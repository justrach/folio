import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { authenticateAgentApiKey, createAgentApiKey } from "../src/lib/agent-api-key-store";
import { ensureAgentObservation } from "../src/lib/agent-observation-service";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkRun, getKeywordBenchmarkUsage, markKeywordBenchmarkCreateAttempt,
  previewKeywordBenchmarkHoldRelease, releaseKeywordBenchmarkHold, reserveKeywordBenchmarkRun,
  updateKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";

const config = { model: "fixture-model", harnessVersion: "fixture-harness", environmentType: "openai_hosted", environmentFingerprint: "fixture-digest" };
const input = { query: "First synthetic question", targetUrl: null, language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", searchMode: "open-web" as const };
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-hold-release-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000012" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const results = await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
    assert.ok(results.every(result => result.success));
  }
  for (const owner of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
    .bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
}

test("real D1 hold release preserves unknown evidence and daily accounting, races once, and permits only different cases", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-hold-release-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Held fixture", cases: [input, { ...input, query: "Other synthetic question" }] });
    const first = suite.cases.find(value => value.query === input.query)!, other = suite.cases.find(value => value.id !== first.id)!;
    let run = await reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: first.id, kind: "baseline" }, { maxRunsPerDay: 3 });
    await assert.rejects(previewKeywordBenchmarkHoldRelease(db, "alice", run.id, run.revision), /unreleased creation/);
    run = await markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision);
    run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "requires_action",
      error: "Session creation could not be confirmed. Do not retry; provider cost is unknown.",
      providerMetadata: { requestId: "fixture-create-receipt", environmentId: null, turnId: null } });
    const original = structuredClone(run);
    const preview = await previewKeywordBenchmarkHoldRelease(db, "alice", run.id, run.revision);
    assert.deepEqual(preview.run, original);
    assert.deepEqual(await getKeywordBenchmarkRun(db, "alice", run.id), original, "Preview does not mutate.");
    await assert.rejects(previewKeywordBenchmarkHoldRelease(db, "bob", run.id, run.revision), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);
    await assert.rejects(releaseKeywordBenchmarkHold(db, "bob", run.id, run.revision, { acknowledgeUnknownCost: true }), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);
    await assert.rejects(releaseKeywordBenchmarkHold(db, "alice", run.id, run.revision - 1, { acknowledgeUnknownCost: true }), /unreleased creation/);
    await assert.rejects(releaseKeywordBenchmarkHold(db, "alice", run.id, run.revision, { acknowledgeUnknownCost: false } as never), /acknowledgement/);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: other.id, kind: "baseline" }, { maxRunsPerDay: 3 }), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    const raced = await Promise.allSettled(Array.from({ length: 5 }, () => releaseKeywordBenchmarkHold(db, "alice", run.id, run.revision, { acknowledgeUnknownCost: true })));
    const winners = raced.filter(result => result.status === "fulfilled"); assert.equal(winners.length, 1);
    const released = winners[0].value;
    assert.ok(released.holdReleasedAt); assert.equal(released.holdReleaseReason, "owner-acknowledged-unknown-creation-cost");
    for (const field of ["status", "sessionId", "createAttemptAt", "case", "usage", "providerMetadata", "error", "answer", "createdAt", "deadlineAt"] as const)
      assert.deepEqual(released[field], original[field], `${field} must remain unchanged.`);
    assert.equal(released.revision, original.revision + 1);
    assert.deepEqual(await getKeywordBenchmarkUsage(db, "alice", { maxRunsPerDay: 3 }), { attemptsLast24Hours: 1, remainingRuns: 2, activeRuns: 0, remainingActiveRuns: 1 });
    await assert.rejects(releaseKeywordBenchmarkHold(db, "alice", run.id, released.revision, { acknowledgeUnknownCost: true }), /unreleased creation/);
    await assert.rejects(db.prepare("UPDATE keyword_benchmark_runs SET hold_release_at=NULL,hold_release_reason=NULL WHERE id=?").bind(run.id).run(), /immutable/);
    await assert.rejects(db.prepare("UPDATE keyword_benchmark_runs SET hold_release_reason='changed' WHERE id=?").bind(run.id).run(), /immutable/);
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, released.revision, { status: "failed" }), /confirmed provider receipt/);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: first.id, kind: "baseline" }, { maxRunsPerDay: null }), error => error instanceof KeywordBenchmarkStoreError && error.status === 409);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: other.id, kind: "baseline" }, { maxRunsPerDay: 1 }), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    const started = await reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: other.id, kind: "baseline" }, { maxRunsPerDay: 3 });
    assert.equal(started.createAttemptAt, null); assert.equal(started.status, "queued");
    assert.deepEqual(await getKeywordBenchmarkUsage(db, "alice", { maxRunsPerDay: 3 }), { attemptsLast24Hours: 2, remainingRuns: 1, activeRuns: 1, remainingActiveRuns: 0 });
    await current.dispose(); current = runtime(directory);
    assert.deepEqual(await getKeywordBenchmarkRun(await current.getD1Database("DB"), "alice", run.id), released);
  } finally { try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
});

test("real D1 release rejects a confirmed provider session and cannot clear its active capacity", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-hold-known-d1-")); let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Known fixture", cases: [input] });
    let run = await reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: suite.cases[0].id, kind: "baseline" });
    run = await markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision);
    run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "requires_action", sessionId: "fixture-known-session" });
    await assert.rejects(releaseKeywordBenchmarkHold(db, "alice", run.id, run.revision, { acknowledgeUnknownCost: true }), /unreleased creation/);
    assert.equal((await getKeywordBenchmarkUsage(db, "alice")).activeRuns, 1);
    await assert.rejects(db.prepare(`UPDATE keyword_benchmark_runs SET hold_release_at=?,hold_release_reason='owner-acknowledged-unknown-creation-cost',updated_at=?,revision=revision+1 WHERE id=?`)
      .bind(Date.now(), Date.now(), run.id).run(), /invalid or immutable/);
  } finally { try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
});

test("real D1 Agent API keeps released same-case retries on the unknown run while a different case may start", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-hold-api-d1-")); let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const key = await createAgentApiKey(db, "alice", { name: "Synthetic hold key", scopes: ["read", "evaluate"] });
    const principal = await authenticateAgentApiKey(db, key.token, "evaluate");
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Held API fixture", cases: [input, { ...input, query: "Different API question" }] });
    const first = suite.cases.find(value => value.query === input.query)!, other = suite.cases.find(value => value.id !== first.id)!;
    const env = { OPENAI_API_KEY: "synthetic-fixture", OPENAI_ALLOWED_USER_IDS: "alice" };
    let requests = 0;
    const options = { fetcher: (async () => { requests++; throw new Error("Synthetic lost create response"); }) as typeof fetch };
    const query = { kind: "keyword" as const, caseId: first.id, maxAgeSeconds: 0 };
    const initial = await ensureAgentObservation(db, principal, query, "held-api-first-key", env, options);
    const run = (await getKeywordBenchmarkRun(db, "alice", initial.run!.id))!;
    assert.equal(run.status, "requires_action"); assert.equal(requests, 1);
    await releaseKeywordBenchmarkHold(db, "alice", run.id, run.revision, { acknowledgeUnknownCost: true });
    const retried = await ensureAgentObservation(db, principal, query, "held-api-first-key", env, options);
    const anotherKey = await ensureAgentObservation(db, principal, query, "held-api-another-key", env, options);
    assert.equal(retried.run?.id, run.id); assert.equal(anotherKey.run?.id, run.id); assert.equal(anotherKey.disposition, "existing_active");
    assert.equal(requests, 1, "Neither idempotent replay nor a new key may replace a released same-case creation.");
    const different = await ensureAgentObservation(db, principal, { kind: "keyword", caseId: other.id, maxAgeSeconds: 0 }, "held-api-different-key", env, options);
    assert.notEqual(different.run?.id, run.id); assert.equal(requests, 2);
    assert.equal((await getKeywordBenchmarkRun(db, "alice", run.id))?.status, "requires_action");
    assert.equal((await getKeywordBenchmarkUsage(db, "alice", { maxRunsPerDay: 6 })).attemptsLast24Hours, 2);
  } finally { try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
});
