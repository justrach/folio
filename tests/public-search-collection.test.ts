import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { ensurePublicCollectionSuite, parsePublicCollectionCli, projectPublicSearchObservation, publicCollectionCaseId, PublicCollectionUsageError } from "../scripts/collect-public-search-rankings";
import { projectWebsitePublicObservation, PublicCollectionUsageError as ProjectionError } from "../src/lib/public-observation-projection";
import { buildKeywordBenchmarkRequest } from "../src/lib/keyword-benchmark-agent";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import { publicKeywordRunFixture as run, retainPublicKeywordAnswer as retainAnswer, publicKeywordQuery as query } from "./fixtures/public-keyword";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";

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
  for (const filename of ["0001_initial.sql", "0009_keyword_benchmarks.sql", "0010_keyword_benchmark_lifecycle.sql", "0012_keyword_benchmark_hold_release.sql", "0016_archive_unresolved_keyword_runs.sql"])
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


test("website publication excludes owner inputs and preserves retained public evidence without mutation", () => {
  const source = run();
  source.case.targetUrl = "https://private-target.com/";
  source.case.referenceFacts = [{ id: "private-reference", statement: "Owner-only expected answer" }];
  const before = structuredClone(source), queryBefore = structuredClone(query);
  const result = projectWebsitePublicObservation(source, query, ["private_owner_123"]);
  assert.deepEqual(result, projectPublicSearchObservation(run(), query));
  assert.deepEqual(source, before);
  assert.deepEqual(query, queryBefore);
  assert.equal(JSON.stringify(result).includes("private-target"), false);
  assert.equal(JSON.stringify(result).includes("Owner-only"), false);
  assert.throws(() => projectPublicSearchObservation(source, query), PublicCollectionUsageError);
  assert.equal(ProjectionError, PublicCollectionUsageError);
  const request = buildKeywordBenchmarkRequest({ ...source.case, runId: source.id, caseId: source.caseId,
    model: source.model, allowedDomains: source.allowedDomains });
  assert.equal(request.input.includes(source.case.targetUrl), false);
  assert.equal(request.input.includes("Owner-only expected answer"), false);
  result.recommendations[0].citationUrls.push("https://unrelated.com/");
  assert.deepEqual(source, before);
});

test("both public projectors scan question metadata and observation fields for private identifiers and credentials", () => {
  for (const project of [projectPublicSearchObservation, projectWebsitePublicObservation]) {
    for (const secret of ["private_owner_123", "private_session_123", "sk-syntheticSecretToken12345", "folio_sandbox_" + "a".repeat(64), "Bearer syntheticToken123"] ) {
      const source = run(), publicQuery = { ...query, query: `Where can I learn ${secret}?` };
      source.case.query = publicQuery.query;
      assert.throws(() => project(source, publicQuery, ["private_owner_123"]), /private identifiers or credential-like text/);
      const metadataQuery = { ...query, category: secret };
      assert.throws(() => project(run(), metadataQuery, ["private_owner_123"]), /private identifiers or credential-like text/);
      const answerSource = run();
      answerSource.answer!.limitations = [secret]; retainAnswer(answerSource);
      assert.throws(() => project(answerSource, query, ["private_owner_123"]), /private identifiers or credential-like text/);
    }
  }
});

test("website publication requires the same retained receipt, standard harness, query and public answer", () => {
  const variants = [
    (value: KeywordBenchmarkRun) => { value.harnessVersion += "-seo-v1"; },
    (value: KeywordBenchmarkRun) => { value.case.query = "A different question"; },
    (value: KeywordBenchmarkRun) => { value.case.locale = "en-GB"; },
    (value: KeywordBenchmarkRun) => { value.answer!.collection!.sessionId = "other-session"; },
    (value: KeywordBenchmarkRun) => { value.answer!.collection!.rootTurnId = "other-turn"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions[0].reason = "Edited after collection"; },
    (value: KeywordBenchmarkRun) => { value.answer!.mentions.reverse(); value.answer!.mentions.unshift(value.answer!.mentions.splice(1, 1)[0]); },
    (value: KeywordBenchmarkRun) => { value.status = "running"; },
    (value: KeywordBenchmarkRun) => { value.model = "different-model"; },
  ];
  for (const change of variants) {
    const source = run(); source.case.targetUrl = "https://private-target.com/"; change(source);
    assert.throws(() => projectWebsitePublicObservation(source, query));
  }
});

test("new model starts and historical projections preserve their frozen model IDs",()=>{
 const ids=new Set<string>();
 for (const model of ["gpt-6-astra","gpt-6-luna","gpt-6-sol","gpt-5.6-luna","gpt-5.6-sol","gpt-5.6-terra"]) {
  const source=run();source.model=model;
  const observation=projectPublicSearchObservation(source,query);
  assert.equal(observation.model,model);ids.add(observation.id);
  source.case.targetUrl="https://private-target.com/";
  assert.equal(projectWebsitePublicObservation(source,query).model,model);
  if (model.startsWith("gpt-5.6")) assert.throws(()=>parsePublicCollectionCli(["start","--owner-id","alice","--query-id",query.id,"--confirm-spend","--model",model]));
  else assert.equal(parsePublicCollectionCli(["start","--owner-id","alice","--query-id",query.id,"--confirm-spend","--model",model]).model,model);
 }
 assert.equal(ids.size,6);
 assert.throws(()=>parsePublicCollectionCli(["start","--owner-id","alice","--query-id",query.id,"--confirm-spend","--model","unsupported"]));
 assert.throws(()=>parsePublicCollectionCli(["status","--owner-id","alice","--model","gpt-5.6-luna"]));
});
