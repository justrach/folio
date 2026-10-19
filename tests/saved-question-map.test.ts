import test from "node:test";
import assert from "node:assert/strict";
import { matchesSavedQuestion, savedQuestionMap, savedQuestionProgress, type SavedQuestionMapItem } from "../src/lib/saved-question-map";
import type { KeywordBenchmarkCase, KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const question: KeywordBenchmarkCase = { id: "map-question", suiteId: "map-suite", query: "Which service explains a codebase?", targetUrl: "https://map-fixture.dev/",
  searchMode: "open-web", revision: 5, language: "en", locale: "US", rubricVersion: "fixture", createdAt: at, updatedAt: at };
const suite: KeywordBenchmarkSuite = { id: "map-suite", name: "Fixture saved questions", description: "Fixture only", createdAt: at, cases: [question] };
function summary(overrides: Partial<KeywordBenchmarkRunSummary> = {}): KeywordBenchmarkRunSummary {
  return { id: "map-run", suiteId: suite.id, caseId: question.id, case: { query: question.query, targetUrl: question.targetUrl, language: question.language, locale: question.locale, rubricVersion: question.rubricVersion, searchMode: question.searchMode }, kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "fixture-model", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture",
    status: "completed", sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at,
    revision: 90, usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null,
    answerCharacters: 25, mentionCount: 1, citationCount: 1, ...overrides };
}

test("unconfirmed history does not become not-run or a fabricated answer count", () => {
  assert.deepEqual(savedQuestionMap(suite, null).map(item => [item.answered, item.state, item.label]), [[false, "unknown", "History not confirmed"]]);
  assert.deepEqual(savedQuestionMap(suite, []).map(item => [item.answered, item.state, item.label]), [[false, "not-run", "Not run"]]);
});

test("frozen inputs establish an answer independently of unrelated run and case revision counters", () => {
  assert.equal(matchesSavedQuestion(question, summary()), true);
  assert.equal(savedQuestionMap(suite, [summary()])[0].answered, true);
  assert.equal(savedQuestionMap(suite, [summary({ revision: 0 })])[0].answered, true);
});

test("changed question inputs retain earlier history without counting its answer as current", () => {
  const changes: Partial<KeywordBenchmarkCase>[] = [{ query: "A changed question" }, { targetUrl: "https://other-fixture.dev/" }, { language: "fr" }, { locale: "SG" }, { rubricVersion: "another-rubric" }, { searchMode: "reviewed-domains" }];
  for (const change of changes) {
    const changed = { ...question, ...change };
    assert.equal(matchesSavedQuestion(changed, summary()), false);
    assert.deepEqual(savedQuestionMap({ ...suite, cases: [changed] }, [summary()]).map(item => [item.answered, item.state, item.latestRunId]), [[false, "earlier-input", undefined]]);
  }
});

test("a later unfinished or failed attempt does not erase a matching recorded answer", () => {
  for (const status of ["queued", "requires_action", "failed"] as const) {
    const later = summary({ id: "later-attempt", status, answerCharacters: 0, createdAt: "2026-10-18T09:00:00.000Z" });
    const item = savedQuestionMap(suite, [later, summary()])[0];
    assert.equal(item.answered, true); assert.equal(item.latestRunId, later.id);
    assert.match(item.label, /Answer recorded/); assert.match(item.label, status === "queued" ? /Latest attempt pending/ : /Latest attempt needs attention/);
  }
});

test("empty completed results and foreign/public records never supply a current private answer", () => {
  for (const value of [summary({ answerCharacters: 0 }), summary({ suiteId: "another-suite" }), summary({ caseId: "another-question" }), ({ ...summary(), publication: "public" } as unknown as KeywordBenchmarkRunSummary)])
    assert.equal(savedQuestionMap(suite, [value])[0].answered, false);
});


test("progress chart partitions each question once and preserves unknown history", () => {
  const items: SavedQuestionMapItem[] = [
    { id: "answered-pending", query: "A", answered: true, state: "pending", label: "Answer recorded · Latest attempt pending" },
    { id: "pending", query: "B", answered: false, state: "pending", label: "Latest attempt pending" },
    { id: "attention", query: "C", answered: false, state: "attention", label: "Latest attempt needs attention" },
    { id: "changed", query: "D", answered: false, state: "earlier-input", label: "Inputs changed · no matching answer" },
    { id: "unrun", query: "E", answered: false, state: "not-run", label: "Not run" },
  ];
  const groups = savedQuestionProgress(items)!;
  assert.deepEqual(groups.map(value => [value.key, value.count]), [["answer", 1], ["pending", 1], ["attention", 1], ["earlier-input", 1], ["not-run", 1]]);
  assert.equal(groups.reduce((sum, value) => sum + value.count, 0), items.length);
  assert.equal(savedQuestionProgress([...items, { id: "unknown", query: "F", answered: false, state: "unknown", label: "History not confirmed" }]), null);
  assert.equal(savedQuestionProgress([])!.every(value => value.count === 0), true);
});
