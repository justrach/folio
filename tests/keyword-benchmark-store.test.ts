import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkSuite, listKeywordBenchmarkSuites,
  updateKeywordBenchmarkCase, reserveKeywordBenchmarkRun, markKeywordBenchmarkCreateAttempt,
  updateKeywordBenchmarkRun, getKeywordBenchmarkRun, listKeywordBenchmarkRuns, getKeywordBenchmarkUsage,
  validateKeywordBenchmarkAnswer, validateKeywordBenchmarkCase, sanitizeKeywordBenchmarkError,
  KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { compareKeywordBenchmarkRuns, type KeywordBenchmarkAnswer, type KeywordBenchmarkCaseInput } from "../src/lib/keyword-benchmark-types";

const fixture: KeywordBenchmarkCaseInput = { query: "Which API tool helps a small team inspect webhooks?", targetUrl: "https://example.test/docs/",
  language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", referenceFacts: [{ id: "independent", statement: "An independently supplied private reference." }] };
const execution = { model: "fixture-model", harnessVersion: "fixture-harness-v1", environmentType: "openai_hosted", environmentFingerprint: "fixture-network-digest" };
const answer: KeywordBenchmarkAnswer = { text: "Synthetic observation recommends Example.", mentions: [{ name: "Example", url: "https://example.test/" }], citations: [{ url: "https://example.test/docs/", title: "Synthetic citation" }], limitations: ["Offline fixture; no provider request."] };

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0001_initial.sql", "0009_keyword_benchmarks.sql", "0010_keyword_benchmark_lifecycle.sql", "0012_keyword_benchmark_hold_release.sql"]) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  for (const owner of ["alice", "bob"]) sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(owner, owner, `${owner}@example.test`, Date.now(), Date.now());
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const result = { bind(...bound: SQLInputValue[]) { values = bound; return result; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values), meta: { changes: 1 } }; },
      async run() { const change = sqlite.prepare(sql).run(...values); return { success: true, results: [], meta: { changes: change.changes } }; },
      batch() { const statement = sqlite.prepare(sql); if (/RETURNING\b/i.test(sql)) return { success: true, results: statement.all(...values) };
        statement.run(...values); return { success: true, results: [] }; },
    }; return result;
  };
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec("BEGIN"); try { const results = statements.map(statement => statement.batch()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  return { db, sqlite };
}

test("creation diagnostics are bounded, require an attempt, and survive retrieval updates unchanged", async () => {
  const { db, sqlite } = database();
  try {
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Diagnostics fixture", cases: [fixture] });
    let run = await reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: suite.cases[0].id, kind: "baseline" });
    const metadata = { ...run.providerMetadata, creationHttpStatus: 429, creationErrorCode: "UPSTREAM_ERROR" as const };
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { providerMetadata: metadata }), /saved creation attempt/);
    run = await markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision);
    for (const status of [99, 600, 429.5, NaN]) await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision,
      { providerMetadata: { ...metadata, creationHttpStatus: status } }), /Invalid creation HTTP status/);
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision,
      { providerMetadata: { ...metadata, creationErrorCode: "raw-private-message" as "UPSTREAM_ERROR" } }), /Invalid creation error code/);
    run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "requires_action", providerMetadata: metadata });
    for (const patch of [{ creationHttpStatus: 500 }, { creationHttpStatus: undefined }, { creationErrorCode: "INVALID_RESPONSE" as const }])
      await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { providerMetadata: { ...metadata, ...patch } }), /cannot be changed/);
    run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision,
      { sessionId: "recovered_fixture_session", providerMetadata: { environmentId: "recovered_env", requestId: "retrieval_request", turnId: "retrieval_turn" } });
    assert.equal(run.providerMetadata.creationHttpStatus, 429);
    assert.equal(run.providerMetadata.creationErrorCode, "UPSTREAM_ERROR");
    assert.equal(run.status, "requires_action"); assert.equal(run.usage.costUsd, null);
  } finally { sqlite.close(); }
});

test("benchmark reservations freeze private inputs, guard creation and retain failed/unknown attempts", async () => {
  const { db, sqlite } = database();
  try {
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Fixture suite", cases: [fixture] });
    assert.equal((await listKeywordBenchmarkSuites(db, "alice"))[0].caseCount, 1);
    assert.equal(await getKeywordBenchmarkSuite(db, "bob", suite.id), null);
    const run = await reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: suite.cases[0].id, kind: "baseline" });
    assert.equal(run.createAttemptAt, null); assert.equal(run.sessionId, null); assert.equal(run.usage.costUsd, null);
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "running", sessionId: "fixture-session" }), /creation attempt/i);
    const attempted = await markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision);
    await assert.rejects(markKeywordBenchmarkCreateAttempt(db, "alice", run.id, attempted.revision), /Do not retry/i);
    const uncertain = await updateKeywordBenchmarkRun(db, "alice", run.id, attempted.revision, {
      status: "requires_action", error: "Session creation could not be confirmed. Do not retry; provider cost is unknown.",
    });
    assert.equal(uncertain.sessionId, null); assert.equal(uncertain.usage.costUsd, null);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: suite.cases[0].id, kind: "baseline" }), error => error instanceof KeywordBenchmarkStoreError && error.status === 429);
    await updateKeywordBenchmarkCase(db, "alice", suite.cases[0].id, 0, { ...fixture, query: "Changed future question" });
    assert.equal((await getKeywordBenchmarkRun(db, "alice", run.id))?.case.query, fixture.query);
    assert.deepEqual(await getKeywordBenchmarkUsage(db, "alice"), { attemptsLast24Hours: 1, remainingRuns: 0, activeRuns: 1, remainingActiveRuns: 0 });
    assert.equal(await getKeywordBenchmarkRun(db, "bob", run.id), null);
    await assert.rejects(updateKeywordBenchmarkRun(db, "bob", run.id, uncertain.revision, { status: "failed" }), KeywordBenchmarkStoreError);
    const failed = await updateKeywordBenchmarkRun(db, "alice", run.id, uncertain.revision, { status: "failed", error: "secret raw provider failure" });
    assert.ok(!failed.error?.includes("secret"));
    assert.equal((await getKeywordBenchmarkUsage(db, "alice")).remainingRuns, 0);
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, failed.revision, { status: "running" }), KeywordBenchmarkStoreError);
  } finally { sqlite.close(); }
});

test("fresh comparisons link the exact owner baseline, preserve terminal evidence and suppress changed-input equivalence", async () => {
  const { db, sqlite } = database();
  try {
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Fixture suite", cases: [fixture, { ...fixture, query: "Other case" }] });
    const target = suite.cases.find(value => value.query === fixture.query)!;
    let baseline = await reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: target.id, kind: "baseline" }, { maxRunsPerDay: 10 });
    baseline = await markKeywordBenchmarkCreateAttempt(db, "alice", baseline.id, baseline.revision);
    baseline = await updateKeywordBenchmarkRun(db, "alice", baseline.id, baseline.revision, { status: "completed", sessionId: "fixture-session", answer,
      providerMetadata: { environmentId: "fixture-env", requestId: "fixture-request", turnId: "fixture-turn" } });
    assert.equal(baseline.answer?.mentions[0].name, "Example");
    const listed = await listKeywordBenchmarkRuns(db, "alice");
    assert.equal(listed[0].answerCharacters, answer.text.length);
    assert.ok(!("answer" in listed[0])); assert.ok(!("referenceFacts" in listed[0].case));
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", baseline.id, baseline.revision, { answer: { ...answer, text: "Rewritten history" } }), KeywordBenchmarkStoreError);
    assert.throws(() => sqlite.prepare("UPDATE keyword_benchmark_runs SET case_json=? WHERE id=?").run(JSON.stringify({ ...fixture, query: "Tampered" }), baseline.id), /immutable/);
    const bob = await createKeywordBenchmarkSuite(db, "bob", { name: "Bob fixture", cases: [fixture] });
    await assert.rejects(reserveKeywordBenchmarkRun(db, "bob", { ...execution, caseId: bob.cases[0].id, kind: "fresh", baselineRunId: baseline.id }), error => error instanceof KeywordBenchmarkStoreError && error.status === 404);
    const other = suite.cases.find(value => value.id !== target.id)!;
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: other.id, kind: "fresh", baselineRunId: baseline.id }, { maxRunsPerDay: 10 }), /baseline is unavailable/);
    await updateKeywordBenchmarkCase(db, "alice", target.id, target.revision, { ...fixture, query: "Changed question" });
    let fresh = await reserveKeywordBenchmarkRun(db, "alice", { ...execution, model: "other-fixture-model", caseId: target.id, kind: "fresh", baselineRunId: baseline.id }, { maxRunsPerDay: 10 });
    fresh = await markKeywordBenchmarkCreateAttempt(db, "alice", fresh.id, fresh.revision);
    fresh = await updateKeywordBenchmarkRun(db, "alice", fresh.id, fresh.revision, { status: "completed", sessionId: "fresh-fixture-session", answer: { ...answer, text: "Changed answer", mentions: [{ name: "New tool", url: null }] } });
    const comparison = compareKeywordBenchmarkRuns(baseline, fresh);
    assert.equal(comparison.comparable, false); assert.ok(comparison.reasons.some(value => value.includes("query")));
    assert.ok(comparison.reasons.some(value => value.includes("model"))); assert.equal(comparison.answerTextChanged, true);
    assert.deepEqual(comparison.addedMentions, ["New tool"]); assert.deepEqual(comparison.removedMentions, ["Example"]);
    assert.equal(compareKeywordBenchmarkRuns(baseline, { ...fresh, model: baseline.model, case: baseline.case }).comparable, true);
    const absent = compareKeywordBenchmarkRuns(baseline, { ...fresh, status: "failed", answer: null });
    assert.equal(absent.comparable, false); assert.equal(absent.answerTextChanged, null); assert.deepEqual(absent.removedMentions, []);
    assert.deepEqual(await listKeywordBenchmarkRuns(db, "bob"), []);
  } finally { sqlite.close(); }
});

test("benchmark payload validation rejects credential URLs, oversized evidence and malformed metrics", async () => {
  assert.throws(() => validateKeywordBenchmarkCase({ ...fixture, targetUrl: "https://user:secret@example.test/" }), /without credentials/);
  assert.equal(validateKeywordBenchmarkCase({ ...fixture, query: "a".repeat(2000) }).query.length, 2000);
  assert.throws(() => validateKeywordBenchmarkCase({ ...fixture, query: "a".repeat(2001) }), /Invalid query/);
  assert.throws(() => validateKeywordBenchmarkCase({ ...fixture, referenceFacts: [{ id: "same", statement: "a" }, { id: "same", statement: "b" }] }), /unique/);
  assert.throws(() => validateKeywordBenchmarkAnswer({ ...answer, text: "a".repeat(500_001) }), /answer text/);
  assert.throws(() => validateKeywordBenchmarkAnswer({ ...answer, citations: [{ url: "javascript:alert(1)" }] }), /HTTP/);
  assert.equal(sanitizeKeywordBenchmarkError("Bearer synthetic-secret"), "The provider operation needs attention. Retrieve the saved session before continuing.");
  const { db, sqlite } = database();
  try {
    for (const id of ["has spaces", "case/slash", "case:colon", "x".repeat(129), ""]) {
      await assert.rejects(createKeywordBenchmarkSuite(db, "alice", { name: "Invalid ID", cases: [{ ...fixture, id }] }), /Invalid case ID/);
      await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: id, kind: "baseline" }), /Invalid case ID/);
    }
    assert.deepEqual(await listKeywordBenchmarkSuites(db, "alice"), [], "Rejected inputs must not persist an unusable suite or reserve capacity.");
    const accepted = await createKeywordBenchmarkSuite(db, "alice", { name: "ID boundary", cases: [{ ...fixture, id: `AZ_09-${"x".repeat(122)}`, query: "q".repeat(2000) }] });
    assert.equal(accepted.cases[0].id.length, 128);
    await assert.rejects(updateKeywordBenchmarkCase(db, "alice", accepted.cases[0].id, 0, { ...fixture, query: "q".repeat(2001) }), /Invalid query/);
    assert.equal((await getKeywordBenchmarkSuite(db, "alice", accepted.id))?.cases[0].query.length, 2000);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Validation", cases: [fixture] });
    const run = await reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: suite.cases[0].id, kind: "baseline" });
    await assert.rejects(updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { usage: { inputTokens: -1, outputTokens: null, totalTokens: null, costUsd: null } }), /Invalid provider usage/);
    await assert.rejects(reserveKeywordBenchmarkRun(db, "alice", { ...execution, caseId: suite.cases[0].id, kind: "baseline" }, { maxRunsPerDay: 0 }), /deployment benchmark limit/);
    await assert.rejects(getKeywordBenchmarkRun(db, "", run.id), error => error instanceof KeywordBenchmarkStoreError && error.status === 401);
  } finally { sqlite.close(); }
});
