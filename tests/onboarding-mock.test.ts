import assert from "node:assert/strict";
import test from "node:test";
import {
  OPEN_DISCOVERY_QUESTIONS,
  SAMPLE_AGENT_ACTION,
  SAMPLE_ANSWERS,
  SAMPLE_CLAIMS,
  SAMPLE_COMPETITORS,
  SAMPLE_TOPICS,
  SAMPLE_WEBSITE_URL,
  allClaimsDecided,
  assertedClaims,
  buildOnboardingExport,
  competitorPosition,
  customTopicQuestion,
  initialClaimDecisions,
  isSampleWebsite,
  keywordGoalQuestion,
  parseLineList,
  reconcileTopics,
  rewriteError,
  sampleObservation,
  sampleTopicsAllowed,
  type DraftTopic,
} from "../src/lib/onboarding-mock";

const emptyParked = () => new Map<string, DraftTopic>();

function topicsFor(opts: { includeSample: boolean; customLabels?: string[]; keywordGoals?: string[] }) {
  return reconcileTopics([], emptyParked(), {
    includeSample: opts.includeSample,
    customLabels: opts.customLabels ?? [],
    keywordGoals: opts.keywordGoals ?? [],
  }).topics;
}

test("asserted profile includes accepted and rewritten claims and retains originals separately", () => {
  const decisions = initialClaimDecisions();
  decisions.description = { status: "accepted" };
  decisions.audience = { status: "rewritten", revision: "Platform engineers running agent fleets." };
  decisions.capabilities = { status: "rejected" };
  const profile = assertedClaims(decisions);
  assert.equal(profile.length, 2);
  assert.equal(profile[0].text, SAMPLE_CLAIMS.description.text);
  assert.equal(profile[0].revised, false);
  assert.equal(profile[1].text, "Platform engineers running agent fleets.");
  assert.equal(profile[1].revised, true);
  assert.equal(SAMPLE_CLAIMS.audience.text, "Developers and teams using AI coding agents.");
  assert.equal(allClaimsDecided(decisions), true);
  decisions.capabilities = { status: "pending" };
  assert.equal(allClaimsDecided(decisions), false);
  decisions.capabilities = { status: "uncertain" };
  assert.equal(assertedClaims(decisions).length, 2);
});

test("blank or whitespace-only rewrites are refused", () => {
  assert.ok(rewriteError(""));
  assert.ok(rewriteError("   "));
  assert.equal(rewriteError("My own wording"), null);
});

test("line list parsing trims, deduplicates, and enforces limits", () => {
  const parsed = parseLineList(" Acme \n\nacme\nBeta\t\nGamma");
  assert.deepEqual(parsed.entries, ["Acme", "Beta", "Gamma"]);
  assert.deepEqual(parsed.errors, []);
  const tooMany = parseLineList(Array.from({ length: 12 }, (_, i) => `c${i}`).join("\n"));
  assert.equal(tooMany.entries.length, 10);
  assert.equal(tooMany.errors.length, 1);
  const tooLong = parseLineList(`${"x".repeat(201)}\nok`);
  assert.deepEqual(tooLong.entries, ["ok"]);
  assert.equal(tooLong.errors.length, 1);
});

test("sample topics appear only when capabilities is accepted on the sample site", () => {
  const decisions = initialClaimDecisions();
  decisions.capabilities = { status: "accepted" };
  assert.equal(sampleTopicsAllowed(decisions, true), true);
  const topics = topicsFor({ includeSample: true });
  assert.equal(topics.length, 3);
  assert.deepEqual(
    topics.map((t) => t.selected),
    [true, true, false],
  );
  assert.equal(topics[0].question, OPEN_DISCOVERY_QUESTIONS[0]);
  for (const status of ["rewritten", "rejected", "uncertain"] as const) {
    decisions.capabilities = { status, revision: status === "rewritten" ? "Other offering." : undefined };
    assert.equal(sampleTopicsAllowed(decisions, true), false);
  }
  assert.equal(sampleTopicsAllowed(decisions, false), false);
});

test("exact fixture questions get sample positions only for the sample site in open mode", () => {
  const [workspace, context] = topicsFor({ includeSample: true });
  const obs = sampleObservation(workspace, { siteIsSample: true, mode: "open" });
  assert.deepEqual(obs?.positions, ["Paseo", "Codegraff", "Lanes Desktop"]);
  assert.deepEqual(sampleObservation(context, { siteIsSample: true, mode: "open" })?.positions, [
    "Codegraff",
    "Sample context tool",
  ]);
  const edited = { ...workspace, question: `${workspace.question} Edited.` };
  assert.equal(sampleObservation(edited, { siteIsSample: true, mode: "open" }), null);
  assert.equal(sampleObservation(workspace, { siteIsSample: true, mode: "named-comparison" }), null);
  assert.equal(sampleObservation(workspace, { siteIsSample: false, mode: "open" }), null);
  const custom = topicsFor({ includeSample: false, customLabels: ["mono repos"] })[0];
  assert.equal(custom.question, customTopicQuestion("mono repos"));
  assert.equal(custom.question, "Which tools are suitable for mono repos?");
  assert.equal(sampleObservation(custom, { siteIsSample: true, mode: "open" }), null);
  assert.equal(competitorPosition("Lanes Desktop", SAMPLE_ANSWERS[OPEN_DISCOVERY_QUESTIONS[0]]), 3);
  assert.equal(competitorPosition("NotInSample", SAMPLE_ANSWERS[OPEN_DISCOVERY_QUESTIONS[0]]), null);
});

test("changing website identity clears sample evidence and drafts", () => {
  assert.equal(isSampleWebsite(SAMPLE_WEBSITE_URL), true);
  assert.equal(isSampleWebsite("https://example.org/"), false);
  const decisions = initialClaimDecisions();
  decisions.description = { status: "accepted" };
  const exportForOtherSite = buildOnboardingExport({
    websiteUrl: "https://example.org/",
    businessName: "Example",
    decisions,
    topics: [],
    competitors: [],
    keywordGoals: [],
    mode: "open",
  });
  assert.equal(exportForOtherSite.sampleWebsite, false);
  assert.deepEqual(exportForOtherSite.acceptedProfile, []);
  assert.deepEqual(exportForOtherSite.agentActions, []);
});

test("reconciling topics preserves edits on survivors, drops removed goals, parks sample topics", () => {
  const decisions = initialClaimDecisions();
  decisions.capabilities = { status: "accepted" };
  let topics = topicsFor({ includeSample: true, keywordGoals: ["alpha"] });
  topics = topics.map((t, i) =>
    i === 0
      ? { ...t, question: `${t.question} Edited.` }
      : i === 1
        ? { ...t, selected: false }
        : t,
  );
  let parked = emptyParked();
  let result = reconcileTopics(topics, parked, {
    includeSample: true,
    customLabels: [],
    keywordGoals: ["beta"],
  });
  parked = result.parked;
  topics = result.topics;
  assert.equal(topics.length, 4);
  assert.equal(topics[0].question, `${OPEN_DISCOVERY_QUESTIONS[0]} Edited.`);
  assert.equal(topics[1].selected, false);
  assert.equal(topics[3].question, keywordGoalQuestion("beta"));
  assert.ok(!topics.some((t) => t.question.includes("alpha")));

  decisions.capabilities = { status: "rejected" };
  result = reconcileTopics(topics, parked, {
    includeSample: false,
    customLabels: [],
    keywordGoals: ["beta"],
  });
  parked = result.parked;
  topics = result.topics;
  assert.deepEqual(topics.map((t) => t.origin), ["keyword"]);
  assert.equal(parked.size, 3);

  decisions.capabilities = { status: "accepted" };
  result = reconcileTopics(topics, parked, {
    includeSample: true,
    customLabels: [],
    keywordGoals: ["beta"],
  });
  topics = result.topics;
  assert.equal(topics.length, 4);
  assert.equal(topics[0].question, `${OPEN_DISCOVERY_QUESTIONS[0]} Edited.`);
  assert.equal(topics[1].selected, false);
});

test("non-sample exports keep manual revisions but no Codegraff suggestions", () => {
  const decisions = initialClaimDecisions();
  decisions.description = { status: "accepted" };
  decisions.audience = { status: "rewritten", revision: "Our own audience description." };
  const asserted = assertedClaims(decisions, false);
  assert.equal(asserted.length, 1);
  assert.equal(asserted[0].text, "Our own audience description.");
  const result = buildOnboardingExport({
    websiteUrl: "https://example.org/",
    businessName: "Example Studio",
    decisions,
    topics: topicsFor({ includeSample: false, customLabels: ["tiny games"] }),
    competitors: [],
    keywordGoals: [],
    mode: "open",
  });
  assert.equal(result.sampleWebsite, false);
  assert.equal(result.acceptedProfile.length, 1);
  assert.equal(result.acceptedProfile[0].revised, true);
  assert.equal(result.suggestions.description, "");
  assert.equal(result.claimDecisions.description.original, "");
  assert.deepEqual(result.agentActions, []);
  assert.equal(result.topics.length, 1);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("Codegraff"));
  assert.ok(!serialized.includes("coding agents"));
});

test("export is explicitly mock, unmeasured, and unpersisted", () => {
  const decisions = initialClaimDecisions();
  decisions.description = { status: "accepted" };
  decisions.audience = { status: "rewritten", revision: "Custom audience." };
  decisions.capabilities = { status: "accepted" };
  const result = buildOnboardingExport({
    websiteUrl: SAMPLE_WEBSITE_URL,
    businessName: "Codegraff",
    decisions,
    topics: topicsFor({ includeSample: true, keywordGoals: ["context"] }),
    competitors: ["Paseo"],
    keywordGoals: ["context"],
    mode: "open",
  });
  assert.equal(result.mock, true);
  assert.equal(result.measured, false);
  assert.equal(result.persisted, false);
  assert.ok(result.disclaimer.length > 0);
  assert.equal(result.websiteUrl, SAMPLE_WEBSITE_URL);
  assert.equal(result.claimDecisions.audience.revision, "Custom audience.");
  assert.equal(result.acceptedProfile.length, 3);
  assert.equal(result.topics.length, 4);
  assert.deepEqual(result.questions[0].illustrativeFindings, ["Paseo", "Codegraff", "Lanes Desktop"]);
  assert.equal(result.questions[2].illustrativeFindings, null);
  assert.equal(result.agentActions.length, 1);
  assert.equal(result.agentActions[0].recommendation, SAMPLE_AGENT_ACTION.recommendation);
  assert.equal(result.agentActions[0].title, "Make the website’s identity clear");
});

test("sample topics expose the settled labels and defaults", () => {
  assert.equal(SAMPLE_TOPICS.length, 3);
  assert.equal(SAMPLE_TOPICS[0].label, "Running coding agents together");
  assert.equal(SAMPLE_TOPICS[1].label, "Understanding an existing codebase");
  assert.equal(SAMPLE_TOPICS[2].label, "Running agents in isolated environments");
  assert.deepEqual(
    SAMPLE_TOPICS.map((t) => t.defaultSelected),
    [true, true, false],
  );
  assert.equal(SAMPLE_TOPICS[2].question, "Which tools offer isolated environments for coding agents?");
});

test("keyword IDs stay stable when an earlier goal is removed", () => {
  let topics = topicsFor({ includeSample: false, keywordGoals: ["alpha", "beta"] });
  const betaId = topics.find((t) => t.label === "beta")!.id;
  topics = topics.map((t) =>
    t.label === "beta" ? { ...t, question: "Edited beta question?", selected: false } : t,
  );
  const { topics: next } = reconcileTopics(topics, emptyParked(), {
    includeSample: false,
    customLabels: [],
    keywordGoals: ["beta", "gamma"],
  });
  const beta = next.find((t) => t.label === "beta")!;
  const gamma = next.find((t) => t.label === "gamma")!;
  assert.equal(beta.id, betaId);
  assert.equal(beta.question, "Edited beta question?");
  assert.equal(beta.selected, false);
  assert.notEqual(gamma.id, beta.id);
  assert.equal(gamma.question, keywordGoalQuestion("gamma"));
  assert.ok(!next.some((t) => t.label === "alpha"));
});
