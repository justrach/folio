import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { publicModelView } from "../src/lib/public-model-view";
import type { PublicSearchObservation } from "../src/lib/public-search-rankings";

const observation = (id: string, model: string, observedAt: string, host: string): PublicSearchObservation => ({
  id, queryId: "question-1", model, observedAt, status: "completed", surface: "openai-managed-agents", searchMode: "open-web",
  harnessVersion: "keyword-open-web-v2", environmentType: "openai_hosted",
  recommendations: [{ position: 1, name: host, url: `https://${host}/`, citationUrls: [] }],
  citations: [{ url: `https://${host}/source` }], limitations: [],
});
function fixture() {
  const queries = [1, 2, 3].map(id => ({ id: `question-${id}`, audience: "Developer tools", category: "Tools", query: `Which tools fit question ${id}?`, language: "en", locale: "en-US" }));
  return buildPublicDashboard({ format: "folio-public-search-rankings-v1", queries, observations: [
    observation("luna-old", "gpt-5.6-luna", "2026-09-13T08:00:00.000Z", "old.example.com"),
    observation("luna-latest", "gpt-5.6-luna", "2026-09-13T09:00:00.000Z", "luna.example.com"),
    observation("astra-newer", "gpt-6-astra", "2026-09-13T10:00:00.000Z", "astra.example.com"),
  ] }, { format: "folio-public-search-progress-v1", updatedAt: "2026-09-13T10:00:00.000Z", queries: queries.map((query, index) => ({ queryId: query.id, status: ["completed", "running", "failed"][index] })) });
}
test("all-model view preserves original progress and latest answers", () => {
  const data = fixture(); assert.equal(publicModelView(data, null), data);
  assert.equal(data.queries[0].latestObservation?.id, "astra-newer");
});
test("model view selects its latest history and recomputes counters without other-model progress", () => {
  const data = fixture(), before = structuredClone(data), view = publicModelView(data, "gpt-5.6-luna");
  assert.equal(view.queries.length, 3);
  assert.equal(view.queries[0].latestObservation?.id, "luna-latest");
  assert.equal(view.queries[0].observationCount, 2);
  assert.deepEqual(view.queries.slice(1).map(query => query.collection), [
    { status: "unmeasured", startedAt: null, finishedAt: null }, { status: "unmeasured", startedAt: null, finishedAt: null },
  ]);
  assert.equal(view.summary.publishedQueryCount, 1); assert.equal(view.summary.publishedObservationCount, 2);
  assert.equal(view.summary.uniqueRecommendedWebsiteCount, 1); assert.equal(view.summary.uniqueCitedSourceCount, 1);
  assert.equal(view.summary.collection.running, 0); assert.equal(view.summary.collection.failed, 0); assert.equal(view.summary.collection.notStarted, 0);
  assert.deepEqual(data, before);
});
test("unknown models and omitted publications remain unmeasured without hiding catalog questions", () => {
  for (const model of ["unknown-model", ""]) {
    const view = publicModelView(fixture(), model);
    assert.equal(view.queries.length, 3); assert.equal(view.summary.publishedQueryCount, 0); assert.equal(view.summary.publishedObservationCount, 0);
    assert.equal(view.summary.uniqueRecommendedWebsiteCount, 0);
    assert.ok(view.queries.every(query => query.collection.status === "unmeasured" && query.latestObservation === null));
  }
  const data = fixture(); data.observations = [];
  assert.equal(publicModelView(data, "gpt-5.6-luna").queries[0].latestObservation, null);
});
