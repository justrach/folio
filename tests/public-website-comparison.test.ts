import test from "node:test";
import assert from "node:assert/strict";
import { publicWebsiteComparison } from "../src/lib/public-website-comparison";
import { websiteQuestionDrafts } from "../src/lib/website-question-drafts";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import type { PublicSearchObservation, PublicSearchQuery } from "../src/lib/public-search-rankings";
const query = { id: "q", query: "Which tools?", language: "English", locale: "United States" } as PublicSearchQuery;
const run = { case: { query: query.query, language: query.language, locale: query.locale, searchMode: "open-web" }, model: "model", surface: "openai-managed-agents", harnessVersion: "h", environmentType: "sandbox" } as KeywordBenchmarkRun;
const observation: PublicSearchObservation = { id: "public", queryId: "q", observedAt: "2026-09-13T00:00:00Z", status: "completed", model: "model", surface: "openai-managed-agents", harnessVersion: "h", environmentType: "sandbox", searchMode: "open-web", recommendations: [], citations: [], limitations: [] };
test("index comparison requires exact query, locale and public execution context", () => {
  assert.equal(publicWebsiteComparison(run, [query], [observation]).state, "same-public-context");
  for (const key of ["query", "language", "locale"] as const) assert.equal(publicWebsiteComparison(run, [{ ...query, [key]: "changed" }], [observation]).state, "unmeasured");
  for (const key of ["model", "surface", "harnessVersion", "environmentType", "searchMode"] as const) assert.equal(publicWebsiteComparison({ ...run, ...(key === "searchMode" ? { case: { ...run.case, searchMode: "reviewed-domains" } } : { [key]: "changed" }) } as KeywordBenchmarkRun, [query], [observation]).state, "unmeasured");
});
test("chooses latest matching observation without pooling models or creating a delta", () => {
  const result = publicWebsiteComparison(run, [query], [{ ...observation, id: "new", observedAt: "2026-09-15T00:00:00Z" }, observation, { ...observation, id: "different", model: "other", observedAt: "2026-09-16T00:00:00Z" }]);
  assert.equal(result.observation?.id, "new"); assert.match(result.reason, /no change score/);
  assert.equal(publicWebsiteComparison(run, [query], [{ ...observation, observedAt: "invalid" }]).observation, null);
});
test("owner-context question drafts fit the real editor limits and reject invalid context", () => {
  const questions = websiteQuestionDrafts("a".repeat(60), "b".repeat(120));
  assert.equal(questions.length, 10); assert.ok(questions.every(q => q.length <= 300));
  assert.deepEqual(websiteQuestionDrafts("", "task"), []);
  assert.deepEqual(websiteQuestionDrafts("a".repeat(61), "task"), []);
  assert.deepEqual(websiteQuestionDrafts("team\nname", "task"), []);
});
