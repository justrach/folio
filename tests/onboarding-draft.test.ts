import assert from "node:assert/strict";
import test from "node:test";
import { parseOnboardingDraft } from "../src/lib/onboarding-draft";
import { initialClaimDecisions, reconcileTopics } from "../src/lib/onboarding-mock";

const now = 1_000_000_000;
const draft = () => ({
  version: 1, savedAt: now, step: 4, siteInput: "example.org", confirmedUrl: "https://example.org/",
  businessName: "Example", decisions: initialClaimDecisions(),
  editDrafts: { description: null, audience: null, capabilities: null },
  knowsCompetitors: null, competitorMode: "track", competitorsRaw: "", customTopicInput: "pending topic",
  customTopics: ["fleet dashboards"], keywordsRaw: "", topicsSignature: "",
  topics: reconcileTopics([], new Map(), { includeSample: false, customLabels: ["fleet dashboards"], keywordGoals: [] }).topics,
  parkedTopics: [],
});

test("local preview drafts retain edited questions, selection, and pending input", () => {
  const input = draft();
  input.topics[0].question = "Which dashboard suits a small fleet?";
  const restored = parseOnboardingDraft(JSON.stringify(input), now + 1000);
  assert.equal(restored?.topics[0].question, input.topics[0].question);
  assert.equal(restored?.customTopicInput, "pending topic");
  assert.equal(restored?.step, 4);
});

test("local preview rejects expired, malformed, unsafe target and empty advanced drafts", () => {
  assert.equal(parseOnboardingDraft("not json", now), null);
  assert.equal(parseOnboardingDraft(JSON.stringify(draft()), now + 86_400_001), null);
  assert.equal(parseOnboardingDraft(JSON.stringify(draft()), now - 1), null);
  assert.equal(parseOnboardingDraft(JSON.stringify({ ...draft(), confirmedUrl: "https://user:secret@example.org/" }), now), null);
  assert.equal(parseOnboardingDraft(JSON.stringify({ ...draft(), topics: [] }), now), null);
  assert.equal(parseOnboardingDraft(JSON.stringify({ ...draft(), decisions: {} }), now), null);
});
