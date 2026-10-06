import assert from "node:assert/strict";
import test from "node:test";
import { captureSandboxWebsite } from "../src/lib/sandbox-website-evidence";
import { PUBLIC_SEARCH_QUERIES, type PublicSearchRankings } from "../src/lib/public-search-rankings";
import { buildPublicDashboard, assertPublicDashboardData } from "../src/lib/public-dashboard";
import { indexCoverageCatalog, prepareIndexQuestionCoverage, projectIndexQuestionCoverage, validateIndexCoveragePlan } from "../src/lib/index-question-coverage";
import { parseQuestionCoverageResponse } from "../src/lib/question-coverage";
import { coverageForRecommendation } from "../src/lib/public-question-coverage";

async function fixture() {
  const source = await captureSandboxWebsite("https://example.com/", { fetcher: async () => new Response("<html><head><title>Fixture product</title></head><body><h1>Fixture source</h1><p>Useful details from a frozen public page.</p></body></html>", { headers: { "Content-Type": "text/html" } }), save: async () => {} });
  // The real index ID/text, deliberately outside the prototype's 38-question bank.
  const query = PUBLIC_SEARCH_QUERIES.find(item => item.id.includes("-decision-"))!;
  assert.ok(query);
  const rankings: PublicSearchRankings = { format: "folio-public-search-rankings-v1", queries: [query], observations: [{
    id: "fixture-public-index-answer", queryId: query.id, observedAt: source.pages[0].capturedAt, status: "completed", model: "fixture-search-agent", surface: "openai-managed-agents", searchMode: "open-web", harnessVersion: "fixture-search-v1", environmentType: "fixture-hosted",
    recommendations: [{ position: 1, name: "Fixture product", url: "https://example.com/product", reason: "PRIVATE_REASON_NOT_PROVIDER_INPUT", citationUrls: [] }, { position: 2, name: "Other product", url: "https://other.example/", citationUrls: [] }], citations: [], limitations: ["Fixture only"],
  }] };
  return { source, query, rankings };
}
function classified(plan: ReturnType<typeof prepareIndexQuestionCoverage>) {
  return parseQuestionCoverageResponse({ model: "jev-fixture", usage: { input_tokens: 20, output_tokens: 10 }, answers: Object.fromEntries(Object.entries(plan.coverage.request.questions).map(([key, question]) => {
    const choice = key.endsWith("_relevance") ? "relevant" : "partial";
    return [key, { type: "choice", choice, confidence: 0.8, probabilities: Object.fromEntries(Object.keys(question.criteria).map(option => [option, option === choice ? 0.8 : 0.1])) }];
  })) }, plan.coverage, indexCoverageCatalog(plan));
}

test("index coverage freezes an actual catalog question and exact returned position, not a draft or new ranking", async () => {
  const { source, query, rankings } = await fixture();
  const before = structuredClone(rankings);
  const plan = prepareIndexQuestionCoverage(rankings, rankings.observations[0].id, [1], [source]);
  assert.equal(plan.coverage.questions[0].id, query.id);
  assert.equal(plan.coverage.questions[0].query, query.query);
  assert.equal(plan.coverage.questions[0].language, query.language);
  assert.equal(plan.coverage.questions[0].locale, query.locale);
  assert.ok(!JSON.stringify(plan.coverage.request).includes("PRIVATE_REASON_NOT_PROVIDER_INPUT"));
  assert.ok(!JSON.stringify(plan.coverage.request).includes(rankings.observations[0].id));
  assert.deepEqual(validateIndexCoveragePlan(JSON.parse(JSON.stringify(plan))), plan);
  assert.deepEqual(rankings, before);
  assert.throws(() => prepareIndexQuestionCoverage(rankings, "unknown", [1], [source]), /existing/);
  assert.throws(() => prepareIndexQuestionCoverage(rankings, rankings.observations[0].id, [2], [source]), /match/);
  assert.throws(() => prepareIndexQuestionCoverage(rankings, rankings.observations[0].id, [1, 1], [source]), /distinct/);
  const changed = structuredClone(plan); changed.rankings.queries[0].query += " Modified";
  assert.throws(() => validateIndexCoveragePlan(changed), /changed/);
});

test("validated public coverage flows into the dashboard without changing agent order, model or source data", async () => {
  const { source, rankings } = await fixture();
  const plan = prepareIndexQuestionCoverage(rankings, rankings.observations[0].id, [1], [source]);
  const projection = projectIndexQuestionCoverage(plan, classified(plan), new Date().toISOString());
  const progress = { format: "folio-public-search-progress-v1", updatedAt: source.pages[0].capturedAt, queries: [{ queryId: rankings.queries[0].id, status: "completed" }] };
  const data = buildPublicDashboard(rankings, progress, projection);
  assertPublicDashboardData(data);
  assert.deepEqual(data.observations, rankings.observations);
  assert.equal(data.questionCoverage!.records[0].status, "partial");
  assert.equal(data.questionCoverage!.records[0].model, "jev-fixture");
  assert.equal(data.queries[0].latestObservation!.model, "fixture-search-agent");
  assert.deepEqual(data.queries[0].latestObservation!.recommendations.map(row => row.position), [1, 2]);
  assert.equal(coverageForRecommendation(data.questionCoverage, rankings.observations[0], rankings.observations[0].recommendations[1]), undefined);
  assert.equal(coverageForRecommendation(data.questionCoverage, { ...rankings.observations[0], id: "another-answer" }, rankings.observations[0].recommendations[0]), undefined);
  assert.ok(!JSON.stringify(projection).includes("PRIVATE_REASON_NOT_PROVIDER_INPUT"));
  assert.ok(!JSON.stringify(projection).includes("usage"));
  assert.ok(!JSON.stringify(projection).includes("htmlSha256"));
  assert.equal(projection.records[0].pages[0].excerpt, source.pages[0].text.slice(0, 600));
  data.questionCoverage!.records[0].queryId = "invented-question";
  assert.throws(() => assertPublicDashboardData(data));
});

test("prepared plans and tampered saved model outputs cannot become public classifications", async () => {
  const { source, rankings } = await fixture();
  const plan = prepareIndexQuestionCoverage(rankings, rankings.observations[0].id, [1], [source]);
  assert.throws(() => projectIndexQuestionCoverage(plan, undefined, new Date().toISOString()), /result/);
  const result = classified(plan); result.rows[0].status = "direct";
  assert.throws(() => projectIndexQuestionCoverage(plan, result, new Date().toISOString()), /does not match/);
});
