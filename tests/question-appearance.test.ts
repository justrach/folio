import test from "node:test";
import assert from "node:assert/strict";
import { latestQuestionAppearanceRuns, questionAppearance } from "../src/lib/question-appearance";
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

test("recommendation and citation are independent exact-host observations, including known matches beside unknown URLs", () => {
  const cases: [KeywordBenchmarkAnswer, string, string][] = [
    [{ ...answer, mentions: [...answer.mentions, { name: "Unknown other", url: null }], citations: [...answer.citations, { url: "unavailable-source" }] }, "yes", "yes"],
    [{ ...answer, mentions: [{ name: "Other", url: other }] }, "no", "yes"],
    [{ ...answer, mentions: [{ name: "Other", url: other }], citations: [{ url: other }] }, "no", "no"],
    [{ ...answer, mentions: [{ name: "Unknown", url: null }], citations: [{ url: "unavailable-source" }] }, "unknown", "unknown"],
    [{ ...answer, citations: [] }, "yes", "no"],
    [{ ...answer, mentions: [], citations: [] }, "no", "no"],
  ];
  for (const [output, recommended, cited] of cases) {
    const value = run({ answer: output }); const row = questionAppearance(suite, [summary(value)], [value])[0];
    assert.equal(row.recommended, recommended); assert.equal(row.cited, cited); assert.equal(row.runId, value.id);
  }
});

test("missing history, unrun questions, pending work and changed inputs remain distinct from recorded absence", () => {
  assert.equal(questionAppearance(suite, null, [run()])[0].recommended, "unavailable");
  assert.equal(questionAppearance(suite, [], [run()])[0].recommended, "unmeasured");
  const pending = run({ status: "queued", answer: null });
  assert.match(questionAppearance(suite, [summary(pending)], [])[0].note, /Latest attempt pending/);
  const old = run({ case: { ...suite.cases[0], query: "Earlier wording" } });
  const changed = questionAppearance(suite, [summary(old)], [old])[0];
  assert.equal(changed.recommended, "unmeasured"); assert.equal(changed.runId, undefined); assert.match(changed.note, /Inputs changed/);
});

test("the latest matching completion retains its own receipt despite a newer unfinished attempt", () => {
  const older = run({ id: "older", createdAt: "2026-10-17T08:00:00Z" });
  const latest = run({ id: "latest" });
  const pending = run({ id: "pending", createdAt: "2026-10-18T09:00:00Z", status: "requires_action", answer: null });
  const history = [summary(older), summary(pending), summary(latest)];
  assert.deepEqual(latestQuestionAppearanceRuns(suite, history).map(value => value.id), ["latest"]);
  const row = questionAppearance(suite, history, [older, latest])[0];
  assert.equal(row.runId, latest.id); assert.equal(row.model, latest.model); assert.match(row.note, /Latest attempt needs attention/);
});

test("unavailable or stale latest detail never falls back to an older answer", () => {
  const older = run({ id: "older", createdAt: "2026-10-17T08:00:00Z" }); const latest = run({ id: "latest", revision: 8 });
  const history = [summary(older), summary(latest)];
  for (const details of [[older], [older, { ...latest, revision: 7 }], [older, { ...latest, model: "different-model" }], [older, { ...latest, case: { ...latest.case, targetUrl: other } }]]) {
    const row = questionAppearance(suite, history, details)[0];
    assert.equal(row.runId, latest.id); assert.equal(row.recommended, "unavailable"); assert.equal(row.cited, "unavailable");
  }
  assert.equal(questionAppearance(suite, history, [older, latest])[0].recommended, "yes");
});

test("latest completion tie breaks deterministically and ignores a changed-input completion", () => {
  const a = run({ id: "answer-a" }); const z = run({ id: "answer-z" });
  const changed = run({ id: "changed", createdAt: "2026-10-19T08:00:00Z", case: { ...z.case, locale: "SG" } });
  assert.deepEqual(latestQuestionAppearanceRuns(suite, [summary(changed), summary(a), summary(z)]).map(value => value.id), [z.id]);
});
