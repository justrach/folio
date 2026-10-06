import assert from "node:assert/strict";
import test from "node:test";
import {
  SAMPLE_BUSINESS_NAME,
  SAMPLE_COMPETITORS,
  SAMPLE_WEBSITE_URL,
  initialClaimDecisions,
  reconcileTopics,
  buildOnboardingExport,
  type DraftTopic,
  type QuestionMode,
} from "../src/lib/onboarding-mock";
import { buildOnboardingReport } from "../src/lib/onboarding-report";

function acceptedDecisions() {
  const decisions = initialClaimDecisions();
  decisions.description = { status: "accepted" };
  decisions.audience = { status: "accepted" };
  decisions.capabilities = { status: "accepted" };
  return decisions;
}

function sampleTopics(extra?: (topics: DraftTopic[]) => DraftTopic[]) {
  const topics = reconcileTopics([], new Map(), {
    includeSample: true,
    customLabels: [],
    keywordGoals: [],
  }).topics;
  return extra ? extra(topics) : topics;
}

function packetFor({
  websiteUrl = SAMPLE_WEBSITE_URL as string | undefined,
  businessName = SAMPLE_BUSINESS_NAME,
  topics = sampleTopics(),
  competitors = [...SAMPLE_COMPETITORS] as string[],
  mode = "open" as QuestionMode,
} = {}) {
  return buildOnboardingExport({
    websiteUrl,
    businessName,
    decisions: acceptedDecisions(),
    topics,
    competitors,
    keywordGoals: [],
    mode,
  });
}

test("default sample report counts, appearances, and per-question positions", () => {
  const report = buildOnboardingReport(packetFor());
  assert.equal(report.selectedQuestionCount, 2);
  assert.equal(report.availableQuestionCount, 2);
  assert.equal(report.missingQuestionCount, 0);
  assert.deepEqual(
    report.brands.map((b) => b.appearances),
    [2, 1, 1],
  );
  assert.equal(report.brands[0].isTarget, true);
  assert.equal(report.brands[0].label, "Codegraff");
  assert.deepEqual(report.brands[0].positions, [2, 1]);
  assert.deepEqual(report.brands[1].positions, [1, null]);
  assert.deepEqual(report.brands[2].positions, [3, null]);
  assert.equal(report.snapshot.questions[0].illustrativeFindings !== null, true);
});

test("enabling the third sample topic adds a missing answer without changing counts", () => {
  const topics = sampleTopics((list) =>
    list.map((t) => (t.id === "sample-sandbox" ? { ...t, selected: true } : t)),
  );
  const report = buildOnboardingReport(packetFor({ topics }));
  assert.equal(report.selectedQuestionCount, 3);
  assert.equal(report.availableQuestionCount, 2);
  assert.equal(report.missingQuestionCount, 1);
  assert.deepEqual(
    report.brands.map((b) => b.appearances),
    [2, 1, 1],
  );
  assert.deepEqual(report.brands[0].positions, [2, 1, null]);
});

test("editing the first question drops its answer without inventing positions", () => {
  const topics = sampleTopics((list) =>
    list.map((t, i) => (i === 0 ? { ...t, question: "Rewritten workspace question?" } : t)),
  );
  const report = buildOnboardingReport(packetFor({ topics }));
  assert.equal(report.availableQuestionCount, 1);
  assert.equal(report.missingQuestionCount, 1);
  assert.deepEqual(
    report.brands.map((b) => b.appearances),
    [1, 0, 0],
  );
  assert.deepEqual(report.brands[0].positions, [null, 1]);
});

test("named comparison has no available answers and null appearances", () => {
  const report = buildOnboardingReport(packetFor({ mode: "named-comparison" }));
  assert.equal(report.availableQuestionCount, 0);
  assert.equal(report.missingQuestionCount, 2);
  assert.deepEqual(
    report.brands.map((b) => b.appearances),
    [null, null, null],
  );
});

test("custom topics and non-sample sites produce no observations", () => {
  const custom = reconcileTopics([], new Map(), {
    includeSample: true,
    customLabels: ["fleet dashboards"],
    keywordGoals: [],
  }).topics;
  const report = buildOnboardingReport(
    packetFor({ websiteUrl: "https://example.org/", businessName: "Example Studio", topics: custom }),
  );
  assert.equal(report.availableQuestionCount, 0);
  assert.equal(report.brands.every((b) => b.appearances === null), true);
  assert.equal(report.brands[0].label, "Example Studio");
});

test("renamed target keeps identity and original sample positions", () => {
  const report = buildOnboardingReport(packetFor({ businessName: "Renamed Studio" }));
  assert.equal(report.brands[0].label, "Renamed Studio");
  assert.equal(report.brands[0].identity, SAMPLE_BUSINESS_NAME);
  assert.deepEqual(report.brands[0].positions, [2, 1]);
});

test("competitors are trimmed, case-deduped, and target duplicates excluded", () => {
  const report = buildOnboardingReport(
    packetFor({ competitors: ["  paseo ", "PASEO", "Codegraff", "Lanes Desktop"] }),
  );
  assert.deepEqual(
    report.brands.map((b) => b.label),
    ["Codegraff", "paseo", "Lanes Desktop"],
  );
  assert.equal(report.brands.filter((b) => b.isTarget).length, 1);
});

test("input snapshot is not mutated by report construction", () => {
  const snapshot = packetFor();
  const before = JSON.stringify(snapshot);
  const report = buildOnboardingReport(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(report.snapshot, snapshot);
});
