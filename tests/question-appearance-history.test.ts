import test from "node:test";
import assert from "node:assert/strict";
import { questionAppearanceHistory, selectedQuestionHistoryRuns } from "../src/lib/question-appearance-history";

import type { KeywordBenchmarkAnswer, KeywordBenchmarkRun, KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const target = "https://appearance-fixture.dev/";
const other = "https://other-appearance-fixture.dev/";
const suite: KeywordBenchmarkSuite = { id: "appearance-suite", name: "Private fixture questions", description: "Fixture only", createdAt: at,
  cases: [{ id: "appearance-case", suiteId: "appearance-suite", query: "Which service explains a codebase?", targetUrl: target, searchMode: "open-web", revision: 9, createdAt: at, updatedAt: at,
    language: "en", locale: "US", rubricVersion: "fixture" }] };
const answer: KeywordBenchmarkAnswer = { text: "A recorded fixture answer.", mentions: [{ name: "Target fixture", url: target }], citations: [{ url: target }], limitations: ["Fixture only"] };
function run(overrides: Partial<KeywordBenchmarkRun> = {}): KeywordBenchmarkRun {
  return { id: "appearance-run", suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "fixture-model", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture", status: "completed", sessionId: "fixture-session",
    createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at, revision: 4,
    answer, usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null, ...overrides };
}
function summary(value: KeywordBenchmarkRun): KeywordBenchmarkRunSummary {
  const { answer: output, ...rest } = value;
  return { ...rest, answerCharacters: output?.text.length ?? 0, mentionCount: output?.mentions.length ?? 0, citationCount: output?.citations.length ?? 0 };
}


function completion(index: number, recommended: boolean, cited: boolean): KeywordBenchmarkRun {
  return run({ id: `history-${index}`, createdAt: `2026-10-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    answer: { text: "A recorded fixture answer.", mentions: [{ name: recommended ? "Target fixture" : "Other fixture", url: recommended ? target : other }], citations: [{ url: cited ? target : other }], limitations: ["Fixture only"] } });
}
function history(values: KeywordBenchmarkRun[], details = values) { return questionAppearanceHistory(suite, suite.cases[0].id, values.map(summary), details); }

test("saved observations are chronological and recommendation/citation changes remain independent", () => {
  const a = completion(0, false, false), b = completion(1, false, true), c = completion(2, true, true);
  assert.deepEqual(history([c, a, b]).points.map(point => point.runId), [a.id, b.id, c.id]);
  assert.deepEqual(history([a, b]).comparison, { recommended: "Unchanged · not recommended", cited: "Now cited as source", reasons: [] });
  assert.deepEqual(history([a, b, c]).comparison, { recommended: "Now recommended", cited: "Unchanged · cited", reasons: [] });
  const decrease = completion(3, false, false);
  assert.deepEqual(history([c, decrease]).comparison, { recommended: "No longer recommended", cited: "No longer cited as source", reasons: [] });
});

test("changed execution, input and research settings prevent comparable-change claims", () => {
  const a = completion(0, false, false), b = completion(1, true, true);
  const mutations: Partial<KeywordBenchmarkRun>[] = [
    { model: "another-model" }, { harnessVersion: "another-harness" }, { environmentType: "another-environment" }, { environmentFingerprint: "another-fingerprint" },
    { case: { ...b.case, query: "Changed wording" } }, { case: { ...b.case, referenceFacts: [{ id: "private-reference", statement: "Changed owner reference" }] } },
    { case: { ...b.case, websiteResearch: { stage: "query-discovery" } } }, { allowedDomains: ["another-appearance-fixture.dev"] },
    { providerMetadata: { ...b.providerMetadata, searchProvider: "another-search-provider" } },
    { case: { ...b.case, searchMode: "reviewed-domains" } },
  ];
  for (const mutation of mutations) {
    const result = history([a, { ...b, ...mutation }]).comparison;
    assert.equal(result.recommended, "Comparison unavailable"); assert.equal(result.cited, "Comparison unavailable"); assert.ok(result.reasons.length > 0);
  }
  const ordered = history([{ ...a, allowedDomains: ["a.dev", "b.dev"] }, { ...b, allowedDomains: ["b.dev", "a.dev"] }]);
  assert.equal(ordered.comparison.recommended, "Now recommended");
});

test("missing and stale details stay gaps, while unknown identities never become a negative observation", () => {
  const a = completion(0, false, false), b = completion(1, false, true), c = completion(2, true, true);
  const gap = history([a, b, c], [a, c]);
  assert.deepEqual(gap.points.map(point => point.recommended), ["no", "unavailable", "yes"]);
  assert.equal(gap.comparison.recommended, "Comparison unavailable"); assert.match(gap.comparison.reasons.join(" "), /saved answers must be available/);
  assert.equal(history([a, b], [a, { ...b, revision: 0 }]).points[1].recommended, "unavailable");
  const unknown = { ...b, answer: { ...b.answer!, mentions: [{ name: "Unmatched", url: null }] } };
  const independent = history([unknown, c]);
  assert.equal(independent.points[0].recommended, "unknown"); assert.match(independent.comparison.recommended, /identity is unknown/);
  assert.equal(independent.comparison.cited, "Unchanged · cited");
});

test("the latest ten completed receipts are bounded independently of pending and failed attempts", () => {
  const completed = Array.from({ length: 12 }, (_, index) => completion(index, index > 5, true));
  const pending = run({ id: "pending", status: "queued", createdAt: "2026-10-20T08:00:00.000Z", answer: null });
  const failed = run({ id: "failed", status: "failed", createdAt: "2026-10-21T08:00:00.000Z", answer: null });
  const selected = selectedQuestionHistoryRuns(suite, suite.cases[0].id, [pending, ...completed, failed].map(summary));
  assert.equal(selected.length, 10); assert.deepEqual(selected.map(value => value.id), completed.slice(2).reverse().map(value => value.id));
  const data = history([pending, ...completed, failed]);
  assert.equal(data.totalCompleted, 12); assert.equal(data.latestAttempt?.id, failed.id);
  assert.deepEqual(data.points.map(point => point.runId), completed.slice(2).map(value => value.id));
});

test("zero, one and unconfirmed history remain explicit without invented change", () => {
  const question = suite.cases[0].id;
  const unavailable = questionAppearanceHistory(suite, question, null, []);
  assert.equal(unavailable.totalCompleted, null); assert.deepEqual(unavailable.points, []);
  assert.equal(questionAppearanceHistory(suite, question, [], []).totalCompleted, 0);
  const one = history([completion(0, true, true)]);
  assert.equal(one.points.length, 1); assert.equal(one.comparison.recommended, "Not enough observations");
});
