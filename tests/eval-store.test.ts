import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createEvaluationRun, getEvaluationRun, getEvaluationUsage, listEvaluationRuns, listEvaluationRunSummaries,
  updateEvaluationRun, createEvaluationBundle, EvalStoreError,
} from "../src/lib/eval-store";
import { createDemoEvaluationRun, verifyEvaluationResult } from "../src/lib/eval-verifier";
import { evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";

/** Exercise the real migration and SQL against SQLite, behind the small D1 adapter. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  const reads: { sql: string; rows: unknown[] }[] = [];
  for (const migration of ["0001_initial.sql", "0002_evaluations.sql", "0005_eval_evidence_deletion.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(id, id, `${id}@example.com`, Date.now(), Date.now());
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
            async first() { return statement.get(...values) ?? null; },
            async all() {
              const results = statement.all(...values);
              reads.push({ sql, rows: results });
              return { success: true, results };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, sqlite, reads };
}

async function liveRun(): Promise<EvaluationRun> {
  return { ...await createDemoEvaluationRun(), id: crypto.randomUUID(), mode: "live", status: "queued", captures: [], events: [], result: null, agentOutput: undefined, expectedFacts: undefined };
}

test("private run IDs, history, and writes are scoped to the authenticated owner", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const alice = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  assert.equal((await getEvaluationRun(db, "alice", alice.id))?.id, alice.id);
  assert.equal(await getEvaluationRun(db, "bob", alice.id), null);
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.deepEqual(await listEvaluationRuns(db, "bob"), []);
  await assert.rejects(updateEvaluationRun(db, "bob", { ...alice, error: "Cross-account mutation" }), EvalStoreError);
  assert.equal((await getEvaluationRun(db, "alice", alice.id))?.error, null);
});

test("concurrent starts reserve exactly one active run before provider submission", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const first = await liveRun(); const second = await liveRun();
  const attempts = await Promise.allSettled([
    createEvaluationRun(db, "alice", first, { maxLivePerDay: 10 }),
    createEvaluationRun(db, "alice", second, { maxLivePerDay: 10 }),
  ]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.ok(await createEvaluationRun(db, "bob", await liveRun()));
});

test("failed managed attempts retain the daily reservation and demos do not spend it", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  const run = await createEvaluationRun(db, "alice", await liveRun());
  await updateEvaluationRun(db, "alice", { ...run, status: "failed", error: "Provider submission could not be confirmed." });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
  assert.equal((await listEvaluationRuns(db, "alice")).filter(saved => saved.mode === "live").length, 1);
});

test("usage starts at the default allowance, excludes demos, and requires an owner", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const empty = { liveAttemptsLast24Hours: 0, remainingLiveRuns: 1, activeRunId: null, activeRunStatus: null };
  assert.deepEqual(await getEvaluationUsage(db, "alice"), empty);
  await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  assert.deepEqual(await getEvaluationUsage(db, "alice"), empty);
  await assert.rejects(getEvaluationUsage(db, ""), (error: unknown) => error instanceof EvalStoreError && error.status === 401);
  await assert.rejects(getEvaluationUsage(db, "alice", 0), (error: unknown) => error instanceof EvalStoreError && error.status === 500);
});

test("usage counts failed and deleted attempts without leaking another owner's active run", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const deleted = await createEvaluationRun(db, "alice", { ...await liveRun(), status: "completed" }, { maxLivePerDay: 10 });
  await deleteEvaluationEvidence(db, "alice", deleted.id, deleted.revision);
  await createEvaluationRun(db, "alice", { ...await liveRun(), status: "failed" }, { maxLivePerDay: 10 });
  const bob = await createEvaluationRun(db, "bob", await liveRun());
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.deepEqual(await getEvaluationUsage(db, "alice"), {
    liveAttemptsLast24Hours: 2, remainingLiveRuns: 0, activeRunId: null, activeRunStatus: null,
  });
  assert.equal((await getEvaluationUsage(db, "alice", 3)).remainingLiveRuns, 1);
  assert.deepEqual(await getEvaluationUsage(db, "bob"), {
    liveAttemptsLast24Hours: 1, remainingLiveRuns: 0, activeRunId: bob.id, activeRunStatus: "queued",
  });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
});

test("usage reports every active state even after its reservation leaves the daily window", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const earlier = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  let run = await createEvaluationRun(db, "alice", { ...await liveRun(), createdAt: earlier, updatedAt: earlier });
  for (const status of ["queued", "running", "requires_action"] as const) {
    if (run.status !== status) run = await updateEvaluationRun(db, "alice", { ...run, status });
    assert.deepEqual(await getEvaluationUsage(db, "alice"), {
      liveAttemptsLast24Hours: 0, remainingLiveRuns: 1, activeRunId: run.id, activeRunStatus: status,
    });
  }
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
  await updateEvaluationRun(db, "alice", { ...run, status: "cancelled" });
  assert.equal((await getEvaluationUsage(db, "alice")).activeRunId, null);
});

test("usage uses the same inclusive rolling 24-hour boundary as creation enforcement", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const createdAt of [now - 86_400_001, now - 86_400_000, now]) {
    const at = new Date(createdAt).toISOString();
    await createEvaluationRun(db, "alice", { ...await liveRun(), status: "completed", createdAt: at, updatedAt: at }, { maxLivePerDay: 10 });
  }
  assert.deepEqual(await getEvaluationUsage(db, "alice", 3), {
    liveAttemptsLast24Hours: 2, remainingLiveRuns: 1, activeRunId: null, activeRunStatus: null,
  });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun(), { maxLivePerDay: 2 }),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
});

test("optimistic updates reject stale polling and terminal runs cannot silently reopen", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await liveRun());
  const running = await updateEvaluationRun(db, "alice", { ...run, status: "running", sessionId: "as_fixture" });
  assert.equal(running.revision, 1);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...run, status: "failed" }), EvalStoreError);
  const completed = await updateEvaluationRun(db, "alice", { ...running, status: "completed" });
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, status: "running" }), EvalStoreError);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, mode: "demo" }), EvalStoreError);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, sessionId: "as_other" }), EvalStoreError);
  assert.equal((await getEvaluationRun(db, "alice", run.id))?.status, "completed");
});

test("a private JSON export contains a reproducible frozen verification bundle", async () => {
  const run = await createDemoEvaluationRun();
  const bundle = createEvaluationBundle(run);
  assert.equal(bundle.publication, "private");
  const serialized = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
  const reproduced = await verifyEvaluationResult(serialized.run, serialized.run.agentOutput);
  assert.deepEqual(reproduced, run.result);
  assert.ok(!Object.hasOwn(bundle.run, "userId"));
  assert.ok(!Object.hasOwn(bundle.run, "ownerId"));
});

test("deleting an account removes its private captured evaluation evidence", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  sqlite.prepare("DELETE FROM user WHERE id = ?").run("alice");
  assert.equal(await getEvaluationRun(db, "alice", run.id), null);
});

test("summary history pages traverse timestamp ties beyond 50 without loading evidence", async t => {
  const { db, sqlite, reads } = database(); t.after(() => sqlite.close());
  const fixture = await createDemoEvaluationRun();
  const at = "2026-09-13T12:00:00.000Z";
  const saved: EvaluationRun[] = [];
  for (let index = 0; index < 55; index++) {
    saved.push(await createEvaluationRun(db, "alice", {
      ...fixture, id: `history-${String(index).padStart(3, "0")}`, createdAt: at, updatedAt: at,
      agentOutput: { privatePayload: "PRIVATE_EVIDENCE_SENTINEL".repeat(1000) },
    }));
  }
  await createEvaluationRun(db, "bob", { ...fixture, id: "other-owner", createdAt: at, updatedAt: at });
  const first = await listEvaluationRunSummaries(db, "alice");
  assert.equal(first.runs.length, 50);
  assert.ok(first.nextCursor);
  assert.deepEqual(first.runs, saved.slice(5).reverse().map(evaluationSummary));
  assert.equal(reads[0].rows.length, 51, "Only one bounded look-ahead row is returned.");
  for (const row of reads[0].rows) assert.deepEqual(Object.keys(row as object).sort(), ["created_at", "id", "summary_json"]);
  assert.ok(!JSON.stringify(reads[0].rows).includes("PRIVATE_EVIDENCE_SENTINEL"));
  assert.ok(!Object.hasOwn(first.runs[0], "captures"));
  assert.ok(!Object.hasOwn(first.runs[0], "events"));
  assert.ok(!Object.hasOwn(first.runs[0], "expectedFacts"));

  // A deleted cursor row remains a usable position. Newer insertions do not shift it.
  await deleteEvaluationEvidence(db, "alice", first.runs.at(-1)!.id, 0);
  await deleteEvaluationEvidence(db, "alice", "history-003", 0);
  await createEvaluationRun(db, "alice", { ...fixture, id: "newer", createdAt: "2026-09-14T12:00:00.000Z" });
  const second = await listEvaluationRunSummaries(db, "alice", { cursor: first.nextCursor });
  assert.deepEqual(second.runs.map(run => run.id), ["history-004", "history-002", "history-001", "history-000"]);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(await listEvaluationRunSummaries(db, "bob", { cursor: first.nextCursor }), { runs: [], nextCursor: null });
  assert.equal((await listEvaluationRuns(db, "alice")).length, 50, "Legacy full-run callers retain their contract.");
});

test("summary projection preserves evaluationSummary including failure semantics and optional workflow", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const fixture = await createDemoEvaluationRun();
  const event = fixture.events[0];
  const variants: Partial<EvaluationRun>[] = [
    {}, { mode: "live", status: "failed", sessionId: null, events: [] },
    { mode: "live", status: "failed", sessionId: null, events: [{ ...event, id: "session-create-attempt" }] },
    { mode: "live", status: "failed", sessionId: null, events: [{ ...event, id: "input-uncertain" }] },
    { mode: "live", status: "failed", sessionId: "fixture-session", events: [] },
    { mode: "demo", status: "failed", sessionId: null, events: [] },
    { workflow: "website-crawl-v1", providerStatus: "completed", result: null },
  ];
  const saved: EvaluationRun[] = [];
  for (let index = 0; index < variants.length; index++) {
    const createdAt = new Date(Date.parse("2026-09-13T12:00:00.000Z") + index).toISOString();
    saved.push(await createEvaluationRun(db, "alice", {
      ...fixture, ...variants[index], id: `summary-${index}-é`, createdAt,
    }, { maxLivePerDay: null }));
  }
  const runs = [];
  let cursor: string | undefined;
  do {
    const page = await listEvaluationRunSummaries(db, "alice", { limit: 1, cursor });
    runs.push(...page.runs);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(runs, saved.reverse().map(evaluationSummary));
  assert.deepEqual(await listEvaluationRunSummaries(db, "bob"), { runs: [], nextCursor: null });
});

test("history rejects malformed or oversized cursors and invalid limits before querying D1", async () => {
  const db = { prepare() { assert.fail("Invalid pagination must not query D1."); } } as unknown as D1Database;
  const badRequest = (error: unknown) => error instanceof EvalStoreError && error.status === 400;
  for (const limit of [0, -1, 51, 1.5, NaN, Infinity, null, "2"])
    await assert.rejects(listEvaluationRunSummaries(db, "alice", { limit: limit as number }), badRequest);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  for (const cursor of ["", " ", "!", "a".repeat(1025), encode({}), encode([1, 0]), encode([2, 0, "id"]),
    encode([1, "0", "id"]), encode([1, 0.5, "id"]), encode([1, 8_640_000_000_000_001, "id"]),
    encode([1, 0, ""]), encode([1, 0, "a".repeat(129)]), encode([1, 0, "id", "extra"]), encode([1, 0, "id"]) + "="])
    await assert.rejects(listEvaluationRunSummaries(db, "alice", { cursor }), badRequest);
  await assert.rejects(listEvaluationRunSummaries(db, ""), (error: unknown) => error instanceof EvalStoreError && error.status === 401);
});
