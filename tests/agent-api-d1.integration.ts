import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { AgentApiError, authenticateAgentApiKey, createAgentApiKey, listAgentApiKeys, revokeAgentApiKey } from "../src/lib/agent-api-key-store";
import { ensureAgentObservation, getAgentObservation, getAgentObservationRun, listAgentObservationTargets } from "../src/lib/agent-observation-service";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkRun, updateKeywordBenchmarkCase, updateKeywordBenchmarkRun } from "../src/lib/keyword-benchmark-store";
import { createEvaluationRun, getEvaluationRun } from "../src/lib/eval-store";
import { createDemoEvaluationRun, DEMO_WEBSITE_HTML } from "../src/lib/eval-verifier";
import { managedRunAccess } from "../src/lib/agent-runs";
import type { AgentObservationInput } from "../src/lib/agent-observation-types";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-agent-api-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000011" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
}
const env = { OPENAI_API_KEY: "synthetic-fixture", OPENAI_ALLOWED_USER_IDS: "alice,bob", SCAN_ALLOWED_HOSTS: "example.com", OPENAI_MAX_RUNS_PER_DAY: "3" };
const trial = { query: "Synthetic development tool recommendation", targetUrl: "https://example.com/", language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", searchMode: "open-web" as const,
  referenceFacts: [{ id: "private-reference", statement: "Independent private reference must stay outside API projections." }] };

test("actual D1 API credentials are hashed, scoped, expiring, revocable, owner-isolated and atomically bounded", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-api-keys-d1-")); const current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const issued = await createAgentApiKey(db, "alice", { name: "Read fixture", scopes: ["read"] });
    assert.match(issued.token, /^folio_v1_[a-f0-9]{64}$/);
    const saved = await db.prepare("SELECT * FROM agent_api_keys WHERE id=?").bind(issued.key.id).first();
    assert.ok(saved); assert.equal(JSON.stringify(saved).includes(issued.token), false); assert.equal(String(saved.token_hash).length, 64);
    assert.equal((await authenticateAgentApiKey(db, issued.token, "read")).ownerId, "alice");
    await assert.rejects(authenticateAgentApiKey(db, issued.token, "evaluate"), error => error instanceof AgentApiError && error.code === "insufficient_scope");
    await assert.rejects(revokeAgentApiKey(db, "bob", issued.key.id), error => error instanceof AgentApiError && error.status === 404);
    assert.deepEqual(await listAgentApiKeys(db, "bob"), []);
    assert.ok(!(JSON.stringify(await listAgentApiKeys(db, "alice"))).includes("token_hash"));
    await revokeAgentApiKey(db, "alice", issued.key.id);
    await assert.rejects(authenticateAgentApiKey(db, issued.token, "read"), error => error instanceof AgentApiError && error.status === 401);
    const expired = await createAgentApiKey(db, "alice", { name: "Expired fixture", scopes: ["read"], expiresInDays: 1 }, { now: new Date(Date.now() - 86_400_001) });
    await assert.rejects(authenticateAgentApiKey(db, expired.token, "read"), error => error instanceof AgentApiError && error.status === 401);
    const raced = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => createAgentApiKey(db, "alice", { name: `Synthetic ${i}`, scopes: ["read", "evaluate"] })));
    const keys = raced.filter(value => value.status === "fulfilled"); assert.equal(keys.length, 10);
    const token = keys[0].value.token, at = new Date();
    const rates = await Promise.allSettled(Array.from({ length: 65 }, () => authenticateAgentApiKey(db, token, "read", { now: at })));
    assert.equal(rates.filter(value => value.status === "fulfilled").length, 60);
    for (const value of rates) if (value.status === "rejected") assert.equal(value.reason.code, "rate_limited");
    assert.equal((await authenticateAgentApiKey(db, token, "read", { now: new Date(at.getTime() + 60_000) })).ownerId, "alice");
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("actual D1 ensure races commit one request-linked provider start and preserve retries, cache and ambiguity across restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-api-ensure-d1-")); let current: Miniflare | undefined = runtime(directory);
  try {
    let db = await current.getD1Database("DB"); await setup(db);
    const key = await createAgentApiKey(db, "alice", { name: "Agent fixture", scopes: ["read", "evaluate"] });
    const principal = await authenticateAgentApiKey(db, key.token, "evaluate");
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Synthetic private suite", cases: [trial, { ...trial, query: "A different fixture query" }] });
    const input: AgentObservationInput = { kind: "keyword", caseId: suite.cases[0].id };
    let creates = 0;
    const options = { fetcher: (async (_url: unknown, init?: RequestInit) => {
      creates++; assert.equal(init?.method, "POST");
      const reserved = await db.prepare("SELECT r.id,r.create_attempt_at,(SELECT COUNT(*) FROM agent_api_requests a WHERE a.user_id=r.user_id AND a.run_id=r.id) AS links FROM keyword_benchmark_runs r WHERE r.user_id='alice'").first<{ id: string; create_attempt_at: number; links: number }>();
      assert.ok(reserved?.create_attempt_at); assert.ok(reserved.links > 0);
      return Response.json({ id: `session_${creates}`, object: "agent.session", status: "in_progress", required_actions: [] });
    }) as typeof fetch };
    const raced = await Promise.all(Array.from({ length: 8 }, (_, i) => ensureAgentObservation(db, principal, input, i < 4 ? "same-request-123" : `distinct-request-${i}`, env, options)));
    assert.equal(creates, 1); assert.equal(new Set(raced.map(value => value.run?.id)).size, 1);
    const runId = raced[0].run!.id;
    const beforeRead = creates;
    assert.equal((await getAgentObservation(db, "alice", input, env)).disposition, "missing");
    assert.equal((await getAgentObservationRun(db, "alice", "keyword", runId)).run?.id, runId); assert.equal(creates, beforeRead);
    await assert.rejects(getAgentObservationRun(db, "bob", "keyword", runId), error => error instanceof AgentApiError && error.status === 404);
    await assert.rejects(ensureAgentObservation(db, principal, { ...input, maxAgeSeconds: 1 }, "same-request-123", env, options), error => error instanceof AgentApiError && error.code === "idempotency_conflict");
    await assert.rejects(ensureAgentObservation(db, principal, { kind: "keyword", caseId: suite.cases[1].id }, "busy-request-123", env, options), error => error instanceof AgentApiError && error.code === "owner_active_elsewhere");
    const running = (await getKeywordBenchmarkRun(db, "alice", runId))!;
    const collection = { format: "folio-keyword-collection-v1" as const, searchMode: "open-web" as const, collectedAt: new Date().toISOString(),
      sessionId: running.sessionId!, rootTurnId: "turn_fixture", finalAnswerItemId: "answer_fixture", finalAnswerJson: '{"answer":"fixture-private-raw-marker"}',
      searchItems: [{ id: "search_fixture", turn_id: "turn_fixture", type: "web_search_call", status: "completed", action: { queries: ["fixture-private-raw-marker"] } }],
      validationItem: { id: "command_fixture", turn_id: "turn_fixture", type: "command_execution", status: "completed", exit_code: null, output: "FOLIO_KEYWORD_JSON_VALID" } };
    await updateKeywordBenchmarkRun(db, "alice", runId, running.revision, { status: "completed", answer: { text: "Synthetic answer", mentions: [{ name: "Fixture tool", url: "https://example.com/" }], citations: [], collection } });
    assert.deepEqual((await getKeywordBenchmarkRun(db, "alice", runId))?.answer?.collection, collection);
    const cached = await ensureAgentObservation(db, principal, input, "cached-request-123", env, options);
    assert.equal(cached.disposition, "fresh_saved"); assert.equal(cached.freshness.fresh, true); assert.equal(creates, 1);
    assert.equal(JSON.stringify(cached).includes("private-reference"), false);
    assert.equal(JSON.stringify(cached).includes("fixture-private-raw-marker"), false);
    assert.equal(cached.run?.provenance.completedSearchCount, 1); assert.equal(cached.run?.provenance.searchMode, "open-web");
    assert.equal((await getAgentObservation(db, "alice", input, { ...env, OPENAI_AGENTS_MODEL: "changed-model" })).run?.model, "gpt-6-astra", "Open-web observations use the requested fixed Astra model.");
    const changed = await updateKeywordBenchmarkCase(db, "alice", suite.cases[0].id, 0, { ...trial, searchMode: "reviewed-domains" });
    assert.equal((await getAgentObservation(db, "alice", input, env)).run, null, "Search mode/harness/network changes invalidate cache identity.");
    await updateKeywordBenchmarkCase(db, "alice", changed.id, changed.revision, trial);
    assert.equal((await listAgentObservationTargets(db, "bob")).cases.length, 0);
    const ambiguousOptions = { fetcher: (async () => { creates++; throw new Error("Fixture connection lost after request write"); }) as typeof fetch };
    const uncertain = await ensureAgentObservation(db, principal, { ...input, maxAgeSeconds: 0 }, "uncertain-request-123", env, ambiguousOptions);
    assert.equal(uncertain.run?.status, "requires_action"); assert.equal(creates, 2);
    const uncertainId = uncertain.run!.id;
    await current.dispose(); current = runtime(directory); db = await current.getD1Database("DB");
    const restoredPrincipal = await authenticateAgentApiKey(db, key.token, "evaluate");
    const retry = await ensureAgentObservation(db, restoredPrincipal, { ...input, maxAgeSeconds: 0 }, "uncertain-request-123", env, ambiguousOptions);
    assert.equal(retry.run?.id, uncertainId); assert.equal(creates, 2);
    const nextKey = await ensureAgentObservation(db, restoredPrincipal, { ...input, maxAgeSeconds: 0 }, "uncertain-another-123", env, ambiguousOptions);
    assert.equal(nextKey.run?.id, uncertainId); assert.equal(nextKey.disposition, "existing_active"); assert.equal(creates, 2);
    await revokeAgentApiKey(db, "alice", key.key.id);
    await assert.rejects(ensureAgentObservation(db, restoredPrincipal, input, "after-revoke-123", env, options), error => error instanceof AgentApiError && error.status === 403);
    assert.equal(creates, 2);
    const replacementKey = await createAgentApiKey(db, "alice", { name: "Replacement key", scopes: ["read", "evaluate"] });
    const quotaPrincipal = await authenticateAgentApiKey(db, replacementKey.token, "evaluate");
    const finalUncertain = (await getKeywordBenchmarkRun(db, "alice", uncertainId))!;
    await updateKeywordBenchmarkRun(db, "alice", uncertainId, finalUncertain.revision, { status: "failed" });
    const rejectedOptions = { fetcher: (async () => { creates++; return Response.json({ id: `rejected_${creates}`, object: "agent.session", status: "failed", required_actions: [] }); }) as typeof fetch };
    for (let i = 0; i < 4; i++) await ensureAgentObservation(db, quotaPrincipal, { ...input, maxAgeSeconds: 0 }, `counted-attempt-${i}`, env, rejectedOptions);
    const beforeDenied = creates;
    await assert.rejects(ensureAgentObservation(db, quotaPrincipal, { ...input, maxAgeSeconds: 0 }, "quota-denial-123", env, rejectedOptions), error => error instanceof AgentApiError && error.code === "run_limit");
    assert.equal(creates, beforeDenied);
    const exemptEnv = { ...env, OPENAI_UNMETERED_USER_IDS: "alice" };
    await assert.rejects(ensureAgentObservation(db, quotaPrincipal, { ...input, maxAgeSeconds: 0 }, "quota-denial-123", exemptEnv, rejectedOptions), error => error instanceof AgentApiError && error.code === "run_limit", "A saved denied request is not silently retried after an allowance change.");
    const exempt = await ensureAgentObservation(db, quotaPrincipal, { ...input, maxAgeSeconds: 0 }, "explicit-exempt-123", exemptEnv, rejectedOptions);
    assert.equal(exempt.run?.status, "failed"); assert.equal(creates, beforeDenied + 1);
    await db.prepare("DELETE FROM user WHERE id='alice'").run();
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_api_requests WHERE user_id='alice'").first<{ n: number }>())?.n, 0);
  } finally { await current?.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("actual D1 website freshness uses frozen capture age and starts once through existing owner quotas", { timeout: 90_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-api-website-d1-")); const current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const issued = await createAgentApiKey(db, "alice", { name: "Website fixture", scopes: ["read", "evaluate"] });
    const principal = await authenticateAgentApiKey(db, issued.token, "evaluate");
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind("site-alice", "alice", "https://example.com/", "Fixture site", Date.now()).run();
    const base = await createDemoEvaluationRun(), oldTime = new Date(Date.now() - 90_000_000).toISOString();
    const old = { ...base, id: crypto.randomUUID(), mode: "live" as const, targetUrl: "https://example.com/", siteName: "Fixture site",
      model: managedRunAccess(env, "alice").model, expectedFacts: undefined, captures: base.captures.map(value => ({ ...value, capturedAt: oldTime })), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await createEvaluationRun(db, "alice", old, { maxLivePerDay: 3 });
    const input = { kind: "website" as const, websiteId: "site-alice" };
    const stale = await getAgentObservation(db, "alice", input, env);
    assert.equal(stale.run?.id, old.id); assert.equal(stale.freshness.fresh, false); assert.equal(stale.freshness.observedAt, oldTime);
    const referenceRun = { ...old, id: crypto.randomUUID(), expectedFacts: { source: "owner-confirmed" as const, productName: "private-owner-reference-value" },
      result: { ...old.result!, checks: old.result!.checks.map(check => check.id === "product-understanding" ? { ...check, expected: "private-owner-reference-value" } : check) } };
    await createEvaluationRun(db, "alice", referenceRun, { maxLivePerDay: 3 });
    assert.equal(JSON.stringify(await getAgentObservationRun(db, "alice", "website", referenceRun.id)).includes("private-owner-reference-value"), false);
    let captures = 0, creates = 0;
    t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
      if (String(url) === "https://example.com/") { captures++; return new Response(DEMO_WEBSITE_HTML, { headers: { "content-type": "text/html" } }); }
      creates++; assert.equal(init?.method, "POST");
      const links = await db.prepare("SELECT COUNT(*) AS n FROM agent_api_requests WHERE user_id='alice' AND disposition='started'").first<{ n: number }>();
      assert.equal(links?.n, 1);
      return Response.json({ id: "website_fixture", object: "agent.session", status: "idle", required_actions: [] });
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => ensureAgentObservation(db, principal, input, "website-same-123", env)));
    assert.equal(new Set(results.map(value => value.run?.id)).size, 1); assert.equal(creates, 1); assert.equal(captures, 1);
    const run = await getEvaluationRun(db, "alice", results[0].run!.id); assert.ok(run?.events.some(value => value.id === "session-create-attempt"));
    assert.equal(JSON.stringify(results).includes(DEMO_WEBSITE_HTML), false);
    const bobKey = await createAgentApiKey(db, "bob", { name: "Other account", scopes: ["read", "evaluate"] });
    await assert.rejects(ensureAgentObservation(db, await authenticateAgentApiKey(db, bobKey.token, "evaluate"), input, "cross-owner-123", env), error => error instanceof AgentApiError && error.status === 404);
    assert.equal(creates, 1);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
