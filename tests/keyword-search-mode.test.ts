import assert from "node:assert/strict";
import test from "node:test";
import { compareKeywordBenchmarkRuns, keywordSearchMode, type KeywordBenchmarkAnswer, type KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import { keywordRecommendationMetrics, validateKeywordCollectionEvidence } from "../src/lib/keyword-search-mode";
import { KEYWORD_BENCHMARK_TEMPLATES } from "../src/lib/keyword-benchmark-catalog";

const answer: KeywordBenchmarkAnswer = { text: "Fixture ordered recommendations.", mentions: [
  { name: "Another tool", url: "https://aider.chat/", citationUrls: ["https://aider.chat/docs/", "https://unreturned.org/"] },
  { name: "Codegraff", url: "https://WWW.Codegraff.com./docs", citationUrls: ["https://codegraff.com/docs/"] },
], citations: [{ url: "https://aider.chat/docs/" }, { url: "https://codegraff.com/docs/" }] };
const run: KeywordBenchmarkRun = {
  id: "fixture-run", suiteId: "fixture-suite", caseId: "fixture-case", kind: "baseline", baselineRunId: null,
  surface: "openai-managed-agents", publication: "private", case: { query: "Which coding harnesses support terminal workflows?", targetUrl: "https://codegraff.com/", language: "English", locale: "United States", rubricVersion: "fixture-v1" },
  status: "completed", sessionId: "session-fixture", createAttemptAt: "2026-09-13T00:00:00Z", allowedDomains: [], deadlineAt: null, cancelAttemptAt: null, cancelAcknowledgedAt: null,
  createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z", revision: 1, answer,
  usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
  providerMetadata: { environmentId: null, requestId: null, turnId: null }, error: null,
  model: "gpt-6-astra", harnessVersion: "fixture-harness", environmentType: "openai_hosted", environmentFingerprint: "fixture-fingerprint",
};

test("recommendation positions preserve returned order and keep target recommendation/citation distinct", () => {
  const metrics = keywordRecommendationMetrics(run);
  assert.deepEqual(metrics.recommendations.map(item => [item.position, item.name, item.domain]), [[1, "Another tool", "aider.chat"], [2, "Codegraff", "codegraff.com"]]);
  assert.equal(metrics.targetNamed, "yes"); assert.equal(metrics.targetCited, true);
  assert.deepEqual(metrics.targetPositions, [2]);
  assert.deepEqual(metrics.recommendations[0].citationUrls, ["https://aider.chat/docs/"]);
  const onlyCited = keywordRecommendationMetrics({ ...run, answer: { ...answer, mentions: [answer.mentions[0]] } });
  assert.equal(onlyCited.targetNamed, "no"); assert.equal(onlyCited.targetCited, true);
  const subdomain = keywordRecommendationMetrics({ ...run, answer: { ...answer, mentions: [{ name: "Codegraff", url: "https://docs.codegraff.com/" }] } });
  assert.equal(subdomain.targetNamed, "no", "Same-looking names and subdomains are not exact-host matches.");
});

test("missing identities and unavailable observations remain unknown rather than zero or definite absence", () => {
  for (const url of [null, "https://private.internal/", "https://user:secret@codegraff.com/", "not a url"]) {
    const metrics = keywordRecommendationMetrics({ ...run, answer: { ...answer, mentions: [{ name: "Codegraff", url }] } });
    assert.equal(metrics.targetNamed, "unknown"); assert.equal(metrics.recommendations[0].matchesTarget, null);
  }
  for (const pending of [{ ...run, status: "running" as const }, { ...run, answer: null }, { ...run, case: { ...run.case, targetUrl: null } }]) {
    const metrics = keywordRecommendationMetrics(pending);
    assert.equal(metrics.targetNamed, "unknown"); assert.equal(metrics.targetCited, null);
  }
  const malformedCitation = keywordRecommendationMetrics({ ...run, answer: { ...answer, citations: [{ url: "not a URL" }] } });
  assert.equal(malformedCitation.targetCited, null);
  const empty = keywordRecommendationMetrics({ ...run, answer: { text: "No supported recommendation", mentions: [], citations: [] } });
  assert.equal(empty.targetNamed, "no"); assert.equal(empty.targetCited, false); assert.deepEqual(empty.targetPositions, []);
});

test("legacy observations retain bounded mode and cannot be compared as open-web observations", () => {
  assert.equal(keywordSearchMode(), "reviewed-domains");
  assert.throws(() => keywordSearchMode("other" as never));
  assert.equal(compareKeywordBenchmarkRuns(run, { ...run, case: { ...run.case, searchMode: "reviewed-domains" } }).comparable, true);
  const comparison = compareKeywordBenchmarkRuns(run, { ...run, case: { ...run.case, searchMode: "open-web" } });
  assert.equal(comparison.comparable, false); assert.ok(comparison.reasons.includes("The search mode changed."));
  const open = KEYWORD_BENCHMARK_TEMPLATES.find(item => item.id === "coding-harness-open-web-v1")!;
  const old = KEYWORD_BENCHMARK_TEMPLATES.find(item => item.id === "coding-harness-research-v1")!;
  assert.deepEqual(open.cases.map(item => item.query), old.cases.map(item => item.query));
  assert.ok(open.cases.every(item => item.searchMode === "open-web" && item.rubricVersion === "keyword-open-web-v1"));
  assert.ok(old.cases.every(item => keywordSearchMode(item.searchMode) === "reviewed-domains"));
});

test("collection evidence preserves complete raw records within a bounded own-property projection", () => {
  const collection = { format: "folio-keyword-collection-v1", searchMode: "open-web", collectedAt: "2026-09-13T00:00:00Z",
    sessionId: "session-fixture", rootTurnId: "turn-fixture", finalAnswerItemId: "final-fixture", finalAnswerJson: JSON.stringify(answer),
    searchItems: [{ id: "search-fixture", turn_id: "turn-fixture", type: "web_search_call", status: "completed", action: { type: "search", queries: ["coding harnesses"], sources: [{ url: "https://aider.chat/" }] } }],
    validationItem: { id: "command-fixture", turn_id: "turn-fixture", type: "command_execution", status: "completed", exit_code: null, command: "python validate.py", output: "FOLIO_KEYWORD_JSON_VALID" },
    ignoredTopLevel: "discarded",
  };
  const checked = validateKeywordCollectionEvidence(collection);
  assert.deepEqual(checked.searchItems, collection.searchItems); assert.deepEqual(checked.validationItem, collection.validationItem);
  assert.equal(checked.finalAnswerJson, JSON.stringify(answer)); assert.ok(!("ignoredTopLevel" in checked));
  assert.throws(() => validateKeywordCollectionEvidence({ ...collection, searchMode: undefined }));
  assert.throws(() => validateKeywordCollectionEvidence({ ...collection, searchItems: [{ ...collection.searchItems[0], turn_id: "different-turn" }] }));
  assert.throws(() => validateKeywordCollectionEvidence({ ...collection, searchItems: [Object.create(collection.searchItems[0])] }));
  assert.throws(() => validateKeywordCollectionEvidence({ ...collection, validationItem: { ...collection.validationItem, exit_code: 1 } }));
  assert.throws(() => validateKeywordCollectionEvidence({ ...collection, validationItem: { ...collection.validationItem, output: `FOLIO_KEYWORD_JSON_VALID\n${"x".repeat(750_000)}` } }));
});
