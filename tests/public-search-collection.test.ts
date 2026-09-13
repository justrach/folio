import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { ensurePublicCollectionSuite, parsePublicCollectionCli, projectPublicSearchObservation, publicCollectionCaseId, PublicCollectionUsageError } from "../scripts/collect-public-search-rankings";
import { KEYWORD_OPEN_WEB_MODEL, keywordAgentHarnessVersion } from "../src/lib/keyword-benchmark-agent";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import type { PublicSearchQuery } from "../src/lib/public-search-rankings";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";

const query: PublicSearchQuery = { id: "public-fixture", audience: "Learning", category: "Courses", query: "Where can a beginner learn a language?", language: "en", locale: "en-US" };
function run(): KeywordBenchmarkRun {
  const value: KeywordBenchmarkRun = { id: "private_run_123", suiteId: "private_suite_123", caseId: "private_case_123", kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: KEYWORD_OPEN_WEB_MODEL,
    harnessVersion: keywordAgentHarnessVersion("open-web"), environmentType: "openai_hosted", environmentFingerprint: "private_configuration_digest",
    case: { query: query.query, targetUrl: null, language: query.language, locale: query.locale, rubricVersion: "keyword-observation-v1", searchMode: "open-web" },
    status: "completed", sessionId: "private_session_123", createAttemptAt: "2026-09-13T00:00:00.000Z", allowedDomains: [], deadlineAt: "2026-09-13T00:03:00.000Z",
    cancelAttemptAt: null, cancelAcknowledgedAt: null, createdAt: "2026-09-13T00:00:00.000Z", updatedAt: "2026-09-13T00:00:30.000Z", revision: 3,
    providerMetadata: { environmentId: "private_environment_123", requestId: "private_request_123", turnId: "private_turn_123" }, error: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    answer: { text: "Raw private response.", mentions: [
      { name: "Beta", url: "https://beta.com/", reason: "Original reason", citationUrls: ["https://beta.com/docs"] },
      { name: "Alpha", url: null, citationUrls: [] },
      { name: "Beta", url: "https://beta.com/", citationUrls: ["https://beta.com/docs"] },
    ], citations: [{ url: "https://beta.com/docs", title: "Beta documentation", quote: "Private raw quote omitted from public artifact." }], limitations: ["One observed response; not a general market rank."],
      collection: { format: "folio-keyword-collection-v1", searchMode: "open-web", collectedAt: "2026-09-13T00:00:30.000Z", sessionId: "private_session_123", rootTurnId: "private_turn_123",
        finalAnswerItemId: "private_final_123", finalAnswerJson: '{"raw":"private_owner_123"}',
        searchItems: [{ id: "private_search_123", type: "web_search_call", turn_id: "private_turn_123", status: "completed", raw: "private raw search material" }],
        validationItem: { id: "private_validation_123", type: "command_execution", turn_id: "private_turn_123", status: "completed", exit_code: null, output: "FOLIO_KEYWORD_JSON_VALID" } } },
  };
  retainAnswer(value);
  return value;
}
function retainAnswer(value: KeywordBenchmarkRun) {
  const { collection, ...answer } = value.answer!;
  if (collection) collection.finalAnswerJson = JSON.stringify({ ...answer, rawPrivateField: "private_owner_123" });
}

test("public collection export preserves original positions and excludes private source fields", () => {
  const source = run(), before = JSON.stringify(source);
  const result = projectPublicSearchObservation(source, query, ["private_owner_123"]);
  assert.deepEqual(result.recommendations.map(value => [value.position, value.name, value.url]), [[1, "Beta", "https://beta.com/"], [2, "Alpha", null], [3, "Beta", "https://beta.com/"]]);
  assert.equal(result.recommendations[0].reason, "Original reason");
  assert.equal(result.observedAt, source.answer!.collection!.collectedAt);
  assert.deepEqual(result, projectPublicSearchObservation(source, query, ["private_owner_123"]));
  const output = JSON.stringify(result);
  for (const forbidden of ["private_", "sessionId", "caseId", "suiteId", "ownerId", "environmentFingerprint", "finalAnswerJson", "searchItems", "usage", "quote", "Raw private response"])
    assert.equal(output.includes(forbidden), false, forbidden);
  assert.equal(JSON.stringify(source), before);
  assertPublicSearchRankings({ format: "folio-public-search-rankings-v1", queries: [query], observations: [result] });
});

test("public projection excludes creation diagnostics without confusing HTTP numbers with private identifiers", () => {
  const source = run();
  source.providerMetadata.creationHttpStatus = 429;
  source.providerMetadata.creationErrorCode = "UPSTREAM_ERROR";
  source.answer!.mentions[0].reason = "Explains HTTP 429 responses in its documentation.";
  retainAnswer(source);
  const result = projectPublicSearchObservation(source, query);
  assert.equal(result.recommendations[0].reason, source.answer!.mentions[0].reason);
  for (const field of ["providerMetadata", "creationHttpStatus", "creationErrorCode", "UPSTREAM_ERROR"])
    assert.equal(JSON.stringify(result).includes(field), false);
});

test("public export rejects wrong provenance, private inputs, missing collection and secret-bearing output", () => {
  const variants = [
    (value: KeywordBenchmarkRun) => { value.status = "failed"; },
    (value: KeywordBenchmarkRun) => { value.case.searchMode = "reviewed-domains"; },
    (value: KeywordBenchmarkRun) => { value.case.targetUrl = "https://private.com/"; },
    (value: KeywordBenchmarkRun) => { value.case.referenceFacts = [{ id: "private", statement: "Private answer key" }]; },
    (value: KeywordBenchmarkRun) => { value.model = "different-model"; },
    (value: KeywordBenchmarkRun) => { value.allowedDomains = ["beta.com"]; },
    (value: KeywordBenchmarkRun) => { delete value.answer!.collection; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].name = value.sessionId!; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].reason = "sk-syntheticSecretToken12345"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].url = "https://beta.com/?access_token=private"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].citationUrls = ["https://unlisted.com/"]; },
  ];
  for (const change of variants) {
    const value = run(); change(value); retainAnswer(value);
    assert.throws(() => projectPublicSearchObservation(value, query));
  }
});

test("public export rejects public fields that differ from the retained final answer", () => {
  const variants = [
    (value: KeywordBenchmarkRun) => { value.answer!.mentions.splice(0, 2, value.answer!.mentions[1], value.answer!.mentions[0]); },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].name = "Changed recommendation"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].url = "https://changed.com/"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].reason = "Changed reason"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].citationUrls = []; },
    (value: KeywordBenchmarkRun) => { value.answer!.citations[0].title = "Changed citation title"; },
    (value: KeywordBenchmarkRun) => { value.answer!.citations.push({url: "https://changed.com/source", title: "Extra source"}); },
    (value: KeywordBenchmarkRun) => { value.answer!.limitations = ["Changed limitation"]; },
  ];
  for (const change of variants) {
    const value = run(); change(value);
    assert.throws(() => projectPublicSearchObservation(value, query), /do not match the retained final answer/);
  }
  const invalid = run(); invalid.answer!.collection!.finalAnswerJson = '{"raw":"private_owner_123"}';
  assert.throws(() => projectPublicSearchObservation(invalid, query), /retained final answer is invalid/);
  const changedRetained = run();
  const retained = JSON.parse(changedRetained.answer!.collection!.finalAnswerJson);
  retained.mentions.reverse();
  // This fixture deliberately contains a duplicate; move the distinct recommendation first.
  retained.mentions.unshift(retained.mentions.splice(1, 1)[0]);
  changedRetained.answer!.collection!.finalAnswerJson = JSON.stringify(retained);
  assert.throws(() => projectPublicSearchObservation(changedRetained, query), /do not match the retained final answer/);
  const privateOnly = run(), expected = projectPublicSearchObservation(privateOnly, query);
  privateOnly.answer!.text = "A changed private full response is never exported.";
  privateOnly.answer!.citations[0].quote = "A changed private excerpt is never exported.";
  assert.deepEqual(projectPublicSearchObservation(privateOnly, query), expected);
});

test("CLI keeps collection spend and publication as distinct explicit actions", () => {
  const owner = ["--owner-id", "fixture-owner"];
  assert.throws(() => parsePublicCollectionCli(["start", ...owner, "--query-id", query.id]), PublicCollectionUsageError);
  assert.throws(() => parsePublicCollectionCli(["start", ...owner, "--confirm-spend"]), PublicCollectionUsageError);
  assert.throws(() => parsePublicCollectionCli(["start", ...owner, "--query-id", query.id, "--confirm-spend", "--publish"]), PublicCollectionUsageError);
  assert.equal(parsePublicCollectionCli(["start", ...owner, "--query-id", query.id, "--confirm-spend", "--wait"]).publish, false);
  assert.equal(parsePublicCollectionCli(["export", ...owner, "--run-id", "fixture-run"]).publish, false);
  assert.equal(parsePublicCollectionCli(["export", ...owner, "--run-id", "fixture-run", "--publish"]).publish, true);
  assert.equal(parsePublicCollectionCli(["reconcile", ...owner, "--run-id", "fixture-run", "--wait"]).wait, true);
  assert.equal(parsePublicCollectionCli(["--help"]).command, "help");
  assert.notEqual(publicCollectionCaseId("alice", query), publicCollectionCaseId("bob", query));
  assert.notEqual(publicCollectionCaseId("alice", query), publicCollectionCaseId("alice", { ...query, query: "Changed question" }));
});

test("private collection suite reuse rejects edited questions and isolates account selectors", async t => {
  const sqlite = new DatabaseSync(":memory:"); t.after(() => sqlite.close());
  for (const filename of ["0001_initial.sql", "0009_keyword_benchmarks.sql", "0010_keyword_benchmark_lifecycle.sql", "0012_keyword_benchmark_hold_release.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  for (const owner of ["alice", "bob"]) sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(owner, owner, `${owner}@example.test`, Date.now(), Date.now());
  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind(...args: SQLInputValue[]) { return prepare(sql, args); },
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
    execute() { return { results: sqlite.prepare(sql).all(...values), success: true }; },
  });
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec("BEGIN"); try { const results = statements.map(value => value.execute()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  const first = await ensurePublicCollectionSuite(db, "alice", [query]);
  assert.equal((await ensurePublicCollectionSuite(db, "alice", [query])).id, first.id);
  const other = await ensurePublicCollectionSuite(db, "bob", [query]); assert.notEqual(other.id, first.id);
  assert.notEqual(other.cases[0].id, first.cases[0].id);
  const changed = JSON.stringify({ ...first.cases[0], query: "Private edited query" });
  sqlite.prepare("UPDATE keyword_benchmark_cases SET case_json=? WHERE id=?").run(changed, first.cases[0].id);
  await assert.rejects(ensurePublicCollectionSuite(db, "alice", [query]), PublicCollectionUsageError);
});
