import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkSuite, reserveKeywordBenchmarkRun,
  markKeywordBenchmarkCreateAttempt, updateKeywordBenchmarkRun, getKeywordBenchmarkRun,
  listKeywordBenchmarkRuns, getKeywordBenchmarkUsage, updateKeywordBenchmarkCase, KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { cancelKeywordBenchmark, keywordBenchmarkOverview, reconcileKeywordBenchmark, seedKeywordBenchmark, startKeywordBenchmark } from "../src/lib/keyword-benchmark-service";
import { compareKeywordBenchmarkRuns } from "../src/lib/keyword-benchmark-types";

/** Actual workerd D1, synthetic identities, isolated persistence; no local env or provider calls. */
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-keyword-benchmark-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000009" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const sql = unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8"));
    const results = await db.batch(sql.map(statement => db.prepare(statement)));
    assert.ok(results.every(result => result.success), `${name} must apply in actual D1.`);
  }
  for (const owner of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
}
const config = { model: "fixture-model", harnessVersion: "fixture-v1", environmentType: "openai_hosted", environmentFingerprint: "fixture-digest" };
const input = { query: "Synthetic best developer tools question", targetUrl: "https://example.test/", language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", referenceFacts: [{ id: "private", statement: "Private independent fixture reference." }] };

test("D1 retains safe creation HTTP diagnostics after restart without retrying an unknown submission", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-keyword-diagnostics-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); let db = await current.getD1Database("DB"); await setup(db);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Creation diagnostics", cases: [input] });
    const env = { OPENAI_API_KEY: "synthetic-fixture", OPENAI_ALLOWED_USER_IDS: "alice" };
    let calls = 0;
    const options = { allowedDomains: ["codegraff.com"], fetcher: (async () => {
      calls++;
      return Response.json({ error: "private-provider-body-marker" }, { status: 429, headers: { "x-request-id": "req_diagnostics_fixture" } });
    }) as typeof fetch };
    const run = await startKeywordBenchmark(db, "alice", { caseId: suite.cases[0].id, kind: "baseline" }, env, options);
    assert.equal(calls, 1); assert.equal(run.status, "requires_action"); assert.equal(run.sessionId, null);
    assert.equal(run.providerMetadata.creationHttpStatus, 429); assert.equal(run.providerMetadata.creationErrorCode, "UPSTREAM_ERROR");
    assert.equal(run.providerMetadata.requestId, "req_diagnostics_fixture"); assert.equal(run.usage.costUsd, null);
    assert.equal(JSON.stringify(run).includes("private-provider-body-marker"), false);
    await current.dispose(); current = runtime(directory); db = await current.getD1Database("DB");
    const restored = await reconcileKeywordBenchmark(db, "alice", run.id, env, options);
    assert.equal(restored.providerMetadata.creationHttpStatus, 429); assert.equal(restored.providerMetadata.creationErrorCode, "UPSTREAM_ERROR");
    assert.equal(restored.status, "requires_action"); assert.equal(calls, 1);
    assert.equal(await getKeywordBenchmarkRun(db, "bob", run.id), null);
    await assert.rejects(startKeywordBenchmark(db, "alice", { caseId: suite.cases[0].id, kind: "baseline" }, env, options));
    assert.equal(calls, 1); assert.equal((await getKeywordBenchmarkUsage(db, "alice")).attemptsLast24Hours, 1);
  } finally { try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
});

test("real D1 exempts only the configured owner's daily benchmark cap while preserving one active task", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-keyword-exemption-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const alice = await createKeywordBenchmarkSuite(db, "alice", { name: "Exempt fixture", cases: [input] });
    const bob = await createKeywordBenchmarkSuite(db, "bob", { name: "Metered fixture", cases: [input] });
    const env = { OPENAI_API_KEY: "synthetic-fixture", OPENAI_ALLOWED_USER_IDS: "alice,bob", OPENAI_UNMETERED_USER_IDS: "alice" };
    let creates = 0;
    const options = { allowedDomains: ["codegraff.com"], fetcher: (async () => Response.json({ id: `session_${++creates}`, object: "agent.session", status: "failed", required_actions: [] })) as typeof fetch };
    for (let i = 0; i < 7; i++) assert.equal((await startKeywordBenchmark(db, "alice", { caseId: alice.cases[0].id, kind: "baseline" }, env, options)).status, "failed");
    const overview = await keywordBenchmarkOverview(db, "alice", env);
    assert.equal(overview.access.maxRunsPerDay, null); assert.equal(overview.usage.remainingRuns, null); assert.equal(overview.usage.attemptsLast24Hours, 7);
    const activeOptions = { ...options, fetcher: (async () => Response.json({ id: `session_${++creates}`, object: "agent.session", status: "in_progress", required_actions: [] })) as typeof fetch };
    const raced = await Promise.allSettled(Array.from({ length: 5 }, () => startKeywordBenchmark(db, "alice", { caseId: alice.cases[0].id, kind: "baseline" }, env, activeOptions)));
    assert.equal(raced.filter(value => value.status === "fulfilled").length, 1); assert.equal(creates, 8);
    assert.equal((await keywordBenchmarkOverview(db, "alice", env)).usage.remainingActiveRuns, 0);
    for (let i = 0; i < 6; i++) await startKeywordBenchmark(db, "bob", { caseId: bob.cases[0].id, kind: "baseline" }, env, options);
    await assert.rejects(startKeywordBenchmark(db, "bob", { caseId: bob.cases[0].id, kind: "baseline" }, env, options), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    assert.equal((await keywordBenchmarkOverview(db, "bob", env)).usage.remainingRuns, 0);
    assert.equal(creates, 14);
  } finally { try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); } }
});

test("real D1 benchmark capacity, creation and revision races preserve owned immutable evidence across restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-keyword-benchmark-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Isolated benchmark", cases: [input] });
    const otherSuite = await createKeywordBenchmarkSuite(db, "bob", { name: "Independent owner", cases: [input] });
    assert.equal(await getKeywordBenchmarkSuite(db, "bob", suite.id), null);
    const raced = await Promise.allSettled(Array.from({ length: 8 }, () => reserveKeywordBenchmarkRun(db, "alice", { ...config, caseId: suite.cases[0].id, kind: "baseline" }, { maxRunsPerDay: 3, maxActiveRuns: 3 })));
    const winners = raced.filter(value => value.status === "fulfilled");
    assert.equal(winners.length, 3);
    for (const value of raced) if (value.status === "rejected") assert.ok(value.reason instanceof KeywordBenchmarkStoreError && value.reason.status === 429);
    let run = winners[0].value;
    assert.equal(run.usage.costUsd, null); assert.equal(run.createAttemptAt, null);
    const creationRace = await Promise.allSettled(Array.from({ length: 5 }, () => markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision)));
    const marked = creationRace.filter(value => value.status === "fulfilled"); assert.equal(marked.length, 1); run = marked[0].value;
    // Trigger effects increase meta.changes; returned matching rows still identify one CAS winner.
    await db.prepare("CREATE TABLE benchmark_mutation_audit(run_id TEXT)").run();
    await db.prepare("CREATE TRIGGER benchmark_fixture_audit AFTER UPDATE ON keyword_benchmark_runs BEGIN INSERT INTO benchmark_mutation_audit(run_id) VALUES(NEW.id); END").run();
    const updateRace = await Promise.allSettled([
      updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "running", sessionId: "fixture-session" }),
      updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "requires_action", error: "The provider session requires attention." }),
    ]);
    assert.equal(updateRace.filter(value => value.status === "fulfilled").length, 1);
    run = (await getKeywordBenchmarkRun(db, "alice", run.id))!;
    run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "completed", sessionId: "fixture-session", answer: {
      text: "Synthetic final answer.", mentions: [{ name: "Fixture Tool", url: "https://example.test/" }], citations: [{ url: "https://example.test/docs" }],
    } });
    assert.equal(run.status, "completed"); assert.equal(await getKeywordBenchmarkRun(db, "bob", run.id), null);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "bob", { ...config, caseId: otherSuite.cases[0].id, kind: "fresh", baselineRunId: run.id }), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);
    await assert.rejects(updateKeywordBenchmarkRun(db, "bob", run.id, run.revision, { status: "failed" }), KeywordBenchmarkStoreError);
    await assert.rejects(db.prepare("UPDATE keyword_benchmark_runs SET model='changed' WHERE id=?").bind(run.id).run(), /immutable/);
    await assert.rejects(db.prepare("UPDATE keyword_benchmark_runs SET answer_json=NULL WHERE id=?").bind(run.id).run(), /immutable/);
    await updateKeywordBenchmarkCase(db, "alice", suite.cases[0].id, 0, { ...input, query: "Changed future question" });
    assert.equal((await getKeywordBenchmarkRun(db, "alice", run.id))?.case.query, input.query);
    const summaries = await listKeywordBenchmarkRuns(db, "alice");
    assert.equal(summaries.length, 3); assert.ok(summaries.every(value => !("answer" in value) && !("referenceFacts" in value.case)));
    assert.equal((await getKeywordBenchmarkUsage(db, "alice", { maxRunsPerDay: 3, maxActiveRuns: 3 })).remainingRuns, 0);

    await current.dispose(); current = undefined; current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getKeywordBenchmarkRun(restored, "alice", run.id), run);
    assert.equal((await listKeywordBenchmarkRuns(restored, "alice")).length, 3);
    await assert.rejects(reserveKeywordBenchmarkRun(restored, "alice", { ...config, caseId: suite.cases[0].id, kind: "fresh", baselineRunId: run.id }, { maxRunsPerDay: 3, maxActiveRuns: 3 }), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    const bobRun = await reserveKeywordBenchmarkRun(restored, "bob", { ...config, caseId: otherSuite.cases[0].id, kind: "baseline" });
    assert.equal(bobRun.status, "queued");
    await restored.prepare("DELETE FROM user WHERE id='alice'").run();
    assert.deepEqual(await listKeywordBenchmarkRuns(restored, "alice"), []);
    assert.equal((await getKeywordBenchmarkRun(restored, "bob", bobRun.id))?.id, bobRun.id);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("real D1 service runs private baseline/fresh answers with one create, safe reads and durable deadline cancellation", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-keyword-service-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const templateId = "coding-harness-research-v1";
    await assert.rejects(seedKeywordBenchmark(db, "alice", { templateId }), /existing website/);
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('alice-site','alice','https://codegraff.com/','Synthetic Codegraff',?,0)").bind(Date.now()).run();
    await assert.rejects(seedKeywordBenchmark(db, "bob", { templateId, websiteId: "alice-site" }), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);
    const suite = await seedKeywordBenchmark(db, "alice", { templateId, websiteId: "alice-site" });
    assert.equal(suite.cases.length, 3); assert.ok(suite.cases.every(value => value.targetUrl === "https://codegraff.com/"));
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM sites").first<{ count: number }>())?.count, 1);
    assert.equal((await db.prepare("SELECT is_public FROM sites WHERE id='alice-site'").first<{ is_public: number }>())?.is_public, 0);
    const chosen = suite.cases[0];
    await updateKeywordBenchmarkCase(db, "alice", chosen.id, chosen.revision, { ...chosen, referenceFacts: [{ id: "independent", statement: "PRIVATE_REFERENCE_NEVER_IN_MODEL" }] });
    const env = { OPENAI_API_KEY: "synthetic-fixture-secret", OPENAI_ALLOWED_USER_IDS: "alice", OPENAI_AGENTS_MODEL: "fixture-model" };
    const domains = ["codegraff.com", "opencode.ai"];
    let creates = 0, cancels = 0, reads = 0, providerState: "completed" | "in_progress" | "cancelled" = "completed";
    const payloads: string[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      const address = String(url);
      if (init?.method === "POST" && !address.endsWith("/events")) {
        creates++;
        const body = JSON.parse(String(init.body)); payloads.push(String(init.body));
        const reservation = await getKeywordBenchmarkRun(db, "alice", body.metadata.run_id);
        assert.ok(reservation?.createAttemptAt, "The durable creation marker must precede the provider POST.");
        assert.equal(reservation?.sessionId, null); assert.equal(reservation?.case.query, JSON.parse(body.input).query);
        assert.equal(payloads.at(-1)?.includes("PRIVATE_REFERENCE_NEVER_IN_MODEL"), false);
        return Response.json({ id: `session_${creates}`, object: "agent.session", status: "in_progress", required_actions: [],
          environment: { id: `env_${creates}`, type: "openai_hosted", network: { access: "restricted", allowed_domains: domains } } });
      }
      const sessionId = address.match(/\/sessions\/(session_\d+)/)?.[1]; assert.ok(sessionId);
      if (address.endsWith("/events")) {
        cancels++;
        const rows = await db.prepare("SELECT cancel_attempt_at FROM keyword_benchmark_runs WHERE session_id=?").bind(sessionId).first<{ cancel_attempt_at: number | null }>();
        assert.ok(rows?.cancel_attempt_at, "The cancellation reservation must precede its provider POST.");
        assert.deepEqual(JSON.parse(String(init?.body)), { events: [{ type: "agent.session.input.cancel" }] });
        return new Response(null, { status: 204 });
      }
      reads++; assert.equal(init?.method, "GET");
      const turnId = `turn_${sessionId}`;
      if (address.includes("/turns?")) return Response.json({ data: [{ id: turnId, session_id: sessionId, status: providerState, subagent_id: null }], has_more: false });
      if (address.includes("/items?")) return Response.json({ data: providerState === "completed" ? [
        { id: "search_item", turn_id: turnId, type: "web_search_call", status: "completed" },
        { id: "command_item", turn_id: turnId, type: "command_execution", status: "completed", exit_code: 0, output: "FOLIO_KEYWORD_JSON_VALID" },
        { id: "answer_item", turn_id: turnId, type: "message", role: "assistant", phase: "final_answer", status: "completed", content: [{ type: "output_text", text: JSON.stringify({
          text: `PRIVATE_BASELINE_OBSERVATION_${sessionId}`, mentions: [{ name: "Codegraff", url: "https://codegraff.com/", reason: "Fixture documentation", citationUrls: ["https://codegraff.com/docs"] }],
          citations: [{ url: "https://codegraff.com/docs", title: "Fixture public docs" }], limitations: ["Synthetic evidence; no live provider request."] }) }] },
      ] : [], has_more: false });
      return Response.json({ id: sessionId, object: "agent.session", status: providerState === "in_progress" ? "in_progress" : "idle", required_actions: [],
        environment: { id: "env_saved", type: "openai_hosted", network: { access: "restricted", allowed_domains: domains } }, usage: null });
    };
    const options = { fetcher, allowedDomains: domains };
    await assert.rejects(startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, { ...env, OPENAI_ALLOWED_USER_IDS: "prefix-alice-suffix" }, options), error => error instanceof KeywordBenchmarkStoreError && error.status === 403);
    assert.equal(creates, 0);
    let baseline = await startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, env, options);
    assert.equal(creates, 1); assert.equal(baseline.status, "running"); assert.equal(baseline.usage.costUsd, null);
    await assert.rejects(startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, env, options), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    await keywordBenchmarkOverview(db, "alice", env); await listKeywordBenchmarkRuns(db, "alice"); await getKeywordBenchmarkRun(db, "alice", baseline.id);
    assert.equal(creates, 1); assert.equal(reads, 0); assert.equal(cancels, 0, "Saved-only reads must never invoke provider operations.");
    baseline = await reconcileKeywordBenchmark(db, "alice", baseline.id, env, options);
    assert.equal(baseline.status, "completed"); assert.ok(baseline.answer?.evidence?.some(check => check.id === "live-search-observed"));
    let fresh = await startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "fresh", baselineRunId: baseline.id }, env, options);
    assert.equal(creates, 2); assert.equal(payloads[1].includes("PRIVATE_BASELINE_OBSERVATION"), false);
    fresh = await reconcileKeywordBenchmark(db, "alice", fresh.id, env, options);
    assert.equal(fresh.status, "completed"); assert.equal(compareKeywordBenchmarkRuns(baseline, fresh).comparable, true);
    await assert.rejects(reconcileKeywordBenchmark(db, "bob", fresh.id, { ...env, OPENAI_ALLOWED_USER_IDS: "alice,bob" }, options), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);

    providerState = "in_progress";
    let overdue = await startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, env, { ...options, now: new Date(Date.now() - 181_000) });
    await Promise.all([reconcileKeywordBenchmark(db, "alice", overdue.id, env, options), reconcileKeywordBenchmark(db, "alice", overdue.id, env, options)]);
    overdue = (await getKeywordBenchmarkRun(db, "alice", overdue.id))!;
    assert.equal(cancels, 1); assert.ok(overdue.cancelAttemptAt); assert.ok(overdue.cancelAcknowledgedAt);
    assert.equal(overdue.status, "requires_action", "Cancel acknowledgement must not be recorded as terminal cancellation.");
    await cancelKeywordBenchmark(db, "alice", overdue.id, env, options); assert.equal(cancels, 1);
    providerState = "cancelled";
    overdue = await reconcileKeywordBenchmark(db, "alice", overdue.id, env, options); assert.equal(overdue.status, "cancelled");
    let ambiguousPosts = 0;
    const ambiguous = await startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, env, { ...options, fetcher: async () => { ambiguousPosts++; throw new Error("synthetic private transport error"); } });
    assert.equal(ambiguousPosts, 1); assert.equal(ambiguous.status, "requires_action"); assert.equal(ambiguous.sessionId, null); assert.equal(ambiguous.usage.costUsd, null);
    await reconcileKeywordBenchmark(db, "alice", ambiguous.id, env, options); assert.equal(creates, 3);
    await assert.rejects(startKeywordBenchmark(db, "alice", { caseId: chosen.id, kind: "baseline" }, env, options), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    await current.dispose(); current = undefined; current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getKeywordBenchmarkRun(restored, "alice", ambiguous.id), ambiguous);
    assert.deepEqual(await getKeywordBenchmarkRun(restored, "alice", overdue.id), overdue);
    assert.equal((await getKeywordBenchmarkUsage(restored, "alice", { maxRunsPerDay: 6, maxActiveRuns: 1 })).remainingRuns, 2);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("operator suite allowance is bounded and does not change the browser default or another owner", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-operator-suite-d1-")), current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    for (let i=0;i<20;i++) await createKeywordBenchmarkSuite(db,"alice",{name:`Fixture ${i}`,cases:[input]});
    await assert.rejects(createKeywordBenchmarkSuite(db,"alice",{name:"Default denied",cases:[input]}), error => error instanceof KeywordBenchmarkStoreError && error.status===429);
    await createKeywordBenchmarkSuite(db,"alice",{name:"Authorized operator batch",cases:[input]},{maxSuites:100});
    await assert.rejects(createKeywordBenchmarkSuite(db,"alice",{name:"Default still denied",cases:[input]}), error => error instanceof KeywordBenchmarkStoreError && error.status===429);
    await createKeywordBenchmarkSuite(db,"bob",{name:"Other owner unaffected",cases:[input]});
    await assert.rejects(createKeywordBenchmarkSuite(db,"bob",{name:"Unbounded denied",cases:[input]},{maxSuites:101}), error => error instanceof KeywordBenchmarkStoreError && error.status===400);
  } finally { await current.dispose(); await rm(directory,{recursive:true,force:true}); }
});
