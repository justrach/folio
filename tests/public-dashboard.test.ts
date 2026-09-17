import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPublicCollectionProgress, assertPublicDashboardData, buildPublicDashboard, buildPublicHtmlCoverage,
  type PublicCollectionProgress, type PublicCollectionStatus,
} from "../src/lib/public-dashboard";
import type { PublicSearchObservation, PublicSearchRankings } from "../src/lib/public-search-rankings";

/** Synthetic public data only; fixtures are never collected or published. */
function fixture() {
  const statuses: PublicCollectionStatus[] = ["running", "completed", "completed", "failed", "unresolved", "not-started", "queued", "cancelled"];
  const queries = statuses.map((_, index) => ({id: `fixture-query-${index + 1}`, audience: "Learning" as const,
    category: "Synthetic category", query: `Synthetic question ${index + 1}?`, language: "en", locale: "en-US"}));
  const observation = (id: string, queryId: string, observedAt: string, url: string): PublicSearchObservation => ({
    id, queryId, observedAt, status: "completed", model: "fixture-model", surface: "openai-managed-agents", searchMode: "open-web",
    harnessVersion: "fixture-harness", environmentType: "fixture-environment",
    recommendations: [{position: 1, name: "Synthetic recommendation", url, citationUrls: ["https://example.com/source"]}],
    citations: [{url: "https://example.com/source", title: "Synthetic source"}], limitations: ["Synthetic test fixture."],
  });
  const latest = observation("fixture-latest", queries[0].id, "2026-09-13T05:00:00Z", "https://www.example.com/first");
  latest.recommendations.push(
    {position: 2, name: "Synthetic recommendation", url: "https://example.com/second", citationUrls: []},
    {position: 3, name: "Separate documentation host", url: "https://docs.example.com/", citationUrls: ["https://example.com/source?version=2"]},
    {position: 4, name: "Unknown website", url: null, citationUrls: []},
  );
  latest.citations.push({url: "https://example.com/source?version=2"});
  const rankings: PublicSearchRankings = {format: "folio-public-search-rankings-v1", queries, observations: [
    observation("fixture-old", queries[0].id, "2026-09-12T05:00:00Z", "https://old.example/"),
    latest,
    observation("fixture-tie", queries[0].id, latest.observedAt, "https://tie.example/"),
    observation("fixture-second-query", queries[1].id, latest.observedAt, "https://another.example/"),
  ]};
  const progress: PublicCollectionProgress = {format: "folio-public-search-progress-v1", updatedAt: "2026-09-13T06:00:00.000Z",
    queries: queries.map((query, index) => ({queryId: query.id, status: statuses[index]}))};
  progress.queries[1].observationId = "fixture-second-query";
  progress.queries[0].startedAt = "2026-09-13T05:30:00Z";
  return {rankings, progress};
}

test("published coverage, collection progress, and awaiting publication remain distinct", () => {
  const {rankings, progress} = fixture();
  const data = buildPublicDashboard(rankings, progress);
  assert.deepEqual(data.summary, {queryCount: 8, publishedQueryCount: 2, publishedObservationCount: 4,
    completedUnpublishedQueryCount: 1,
    collection: {notStarted: 1, queued: 1, running: 1, completed: 2, failed: 1, cancelled: 1, unresolved: 1},
    uniqueRecommendedWebsiteCount: 3, uniqueCitedSourceCount: 2});
  assert.equal(data.queries[0].collection.status, "running");
  assert.equal(data.queries[0].resultStatus, "published", "A new running collection must not hide a saved answer.");
  assert.equal(data.queries[1].resultStatus, "published");
  assert.equal(data.queries[2].resultStatus, "awaiting-publication");
  assert.equal(data.queries[3].resultStatus, "not-published");
  assert.equal(data.queries[3].latestObservation, null);
  assert.equal(data.htmlCoverage, null);
  assertPublicDashboardData(data);
});

test("query, answer, citation, and returned recommendation order are retained without mutating sources", () => {
  const {rankings, progress} = fixture(), before = structuredClone({rankings, progress});
  progress.queries.reverse();
  const data = buildPublicDashboard(rankings, progress);
  assert.deepEqual(data.queries.map(query => query.id), rankings.queries.map(query => query.id));
  assert.deepEqual(data.observations, rankings.observations);
  assert.deepEqual(data.queries[0].latestObservation, rankings.observations[1], "Equal timestamps retain the first source observation.");
  assert.deepEqual(data.queries[0].latestObservation?.recommendations.map(row => row.position), [1, 2, 3, 4]);
  assert.equal(data.queries[0].latestObservation?.recommendations[3].url, null);
  data.queries[0].latestObservation!.recommendations[0].name = "Changed only in cloned DTO";
  assert.deepEqual(rankings, before.rankings);
  assert.deepEqual(progress, {...before.progress, queries: before.progress.queries.reverse()});
});

test("no published answers produces empty coverage rather than invented scores or positions", () => {
  const {rankings, progress} = fixture();
  rankings.observations = [];
  delete progress.queries[1].observationId;
  const data = buildPublicDashboard(rankings, progress);
  assert.equal(data.summary.publishedQueryCount, 0);
  assert.equal(data.summary.publishedObservationCount, 0);
  assert.equal(data.summary.uniqueRecommendedWebsiteCount, 0);
  assert.equal(data.summary.uniqueCitedSourceCount, 0);
  assert.equal(data.summary.completedUnpublishedQueryCount, 2);
  assert.ok(data.queries.every(query => query.latestObservation === null && query.observationCount === 0));
  assert.deepEqual(data.observations, []);
  assertPublicDashboardData(data);
});

test("collection progress strictly rejects private fields, missing/duplicate queries, and mismatched observation references", () => {
  const changes: ((progress: PublicCollectionProgress) => void)[] = [
    progress => { Object.assign(progress, {ownerId: "private-fixture-marker"}); },
    progress => { Object.assign(progress.queries[0], {sessionId: "private-fixture-marker"}); },
    progress => { Object.assign(progress.queries[0], {error: "private-fixture-marker"}); },
    progress => { progress.queries.pop(); },
    progress => { progress.queries[0].queryId = progress.queries[1].queryId; },
    progress => { progress.queries[0].queryId = "unreviewed-query"; },
    progress => { progress.queries[0].observationId = "missing-observation"; },
    progress => { progress.queries[0].observationId = "fixture-second-query"; },
    progress => { Object.assign(progress.queries[0], {status: {toString: () => "running"}}); },
    progress => { Object.assign(progress.queries[0], {status: "requires_action"}); },
    progress => { Object.assign(progress.queries[0], {startedAt: undefined}); },
    progress => { Object.setPrototypeOf(progress.queries[0], {privateField: "private-fixture-marker"}); },
  ];
  for (const change of changes) {
    const {rankings, progress} = fixture(); change(progress);
    assert.throws(() => assertPublicCollectionProgress(progress, rankings.queries, rankings.observations),
      error => error instanceof Error && !error.message.includes("private-fixture-marker"));
  }
  const {rankings, progress} = fixture();
  assert.doesNotThrow(() => assertPublicCollectionProgress(progress, rankings.queries, rankings.observations));
});

test("public progress timestamps are real UTC times and cannot finish before their start", () => {
  for (const time of ["not-a-date", "2026-09-13", "2026-02-30T00:00:00Z", "2026-09-13T24:00:00Z", "2026-09-13T05:00:00+01:00"]) {
    const {rankings, progress} = fixture(); progress.updatedAt = time;
    assert.throws(() => buildPublicDashboard(rankings, progress));
    progress.updatedAt = "2026-09-13T06:00:00Z"; progress.queries[0].finishedAt = time;
    assert.throws(() => buildPublicDashboard(rankings, progress));
  }
  const {rankings, progress} = fixture();
  progress.queries[0].finishedAt = "2026-09-13T05:29:59Z";
  assert.throws(() => buildPublicDashboard(rankings, progress));
  progress.queries[0].finishedAt = "2026-09-13T05:30:00.1Z";
  assert.doesNotThrow(() => buildPublicDashboard(rankings, progress));
});

test("client DTO validation recomputes counts and rejects fabricated results or private fields", () => {
  const changes: ((data: ReturnType<typeof buildPublicDashboard>) => void)[] = [
    data => { data.summary.publishedQueryCount++; },
    data => { data.summary.uniqueRecommendedWebsiteCount++; },
    data => { data.summary.collection.running++; },
    data => { data.queries[0].observationCount++; },
    data => { data.queries[0].resultStatus = "not-published"; },
    data => { data.queries[0].latestObservation = data.observations[0]; },
    data => { data.queries[0].latestObservation = {...data.observations[1], recommendations: []}; },
    data => { Object.assign(data, {privateOwner: "private-fixture-marker"}); },
    data => { Object.assign(data.summary, {totalCost: 0}); },
    data => { Object.assign(data.queries[0], {runId: "private-fixture-marker"}); },
    data => { Object.assign(data.queries[0].collection, {providerRequestId: "private-fixture-marker"}); },
    data => { Object.assign(data.observations[0], {sessionId: "private-fixture-marker"}); },
    data => { Object.assign(data, {htmlCoverage: undefined}); },
  ];
  for (const change of changes) {
    const {rankings, progress} = fixture(); const data = buildPublicDashboard(rankings, progress); change(data);
    assert.throws(() => assertPublicDashboardData(data), error => error instanceof Error && !error.message.includes("private-fixture-marker"));
  }
  const {rankings, progress} = fixture(); const data = buildPublicDashboard(rankings, progress);
  delete data.htmlCoverage;
  assert.doesNotThrow(() => assertPublicDashboardData(data), "HTML coverage is optional in the public contract.");
  const reordered = JSON.parse(JSON.stringify(data)) as typeof data;
  reordered.summary = Object.fromEntries(Object.entries(reordered.summary).reverse()) as typeof data.summary;
  assert.doesNotThrow(() => assertPublicDashboardData(reordered), "Object key order has no semantic meaning.");
});

test("HTML coverage counts only latest public catalog captures, separately retaining unavailable and unmeasured pages", () => {
  const catalog = ["measured", "unavailable", "missing-score", "missing-capture", "out-of-range"].map(id => ({id}));
  const capturedAt = "2026-09-13T05:00:00Z";
  const row = (toolId: string, status: string, score: number | null, captureKind = "public-homepage") => ({toolId, status, score, captureKind, capturedAt});
  const batch = {generatedAt: capturedAt, suiteVersion: "readiness-v1", scope: "Homepage HTML only; no JavaScript or API tasks", results: [
    {...row("measured", "unavailable", null), capturedAt: "2026-09-12T05:00:00Z"},
    row("measured", "complete", 0), row("unavailable", "unavailable", null), row("missing-score", "complete", null),
    row("missing-capture", "complete", 100, "local-preview"), row("outside-catalog", "complete", 100), row("out-of-range", "complete", 101),
  ]};
  const coverage = buildPublicHtmlCoverage(catalog, batch);
  assert.deepEqual(coverage, {catalogWebsiteCount: 5, measuredHomepageCount: 1, unavailableHomepageCount: 1, notMeasuredHomepageCount: 3,
    generatedAt: capturedAt, suiteVersion: "readiness-v1", scope: batch.scope});
  const {rankings, progress} = fixture(); const data = buildPublicDashboard(rankings, progress); data.htmlCoverage = coverage;
  assertPublicDashboardData(data);
  data.htmlCoverage.measuredHomepageCount++;
  assert.throws(() => assertPublicDashboardData(data), "HTML coverage cannot claim more pages than its catalog total.");
  assert.throws(() => buildPublicHtmlCoverage([...catalog, catalog[0]], batch));
  assert.throws(() => buildPublicHtmlCoverage(catalog, {...batch, results: [row("measured", "complete", 5), {...row("measured", "complete", 10), capturedAt: "invalid"}]}));
});

test("actual public GET reads only published projections, needs no auth, and cannot start provider work", async () => {
  const contextKey = Symbol.for("__cloudflare-context__");
  const globals = globalThis as unknown as Record<symbol, unknown>;
  const previousContext = globals[contextKey];
  globals[contextKey] = {env: {DB: {prepare(sql: string) {
    assert.equal(sql, "SELECT payload_json,updated_at FROM public_keyword_observations WHERE payload_json IS NOT NULL ORDER BY updated_at,run_id");
    return {async all() {return {results: []};}};
  }}}};
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Public fixture must not call any network or provider."); };
  try {
    const route = await import("../src/app/api/public/benchmarks/route");
    assert.equal("POST" in route, false);
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("set-cookie"), null);
    const data: unknown = await response.json();
    assertPublicDashboardData(data);
    assert.ok(data.queries.length > 0);
    assert.ok(data.htmlCoverage && data.htmlCoverage.catalogWebsiteCount > 0);
    assert.equal(data.htmlCoverage?.suiteVersion, "readiness-v1");
    assert.equal(data.summary.queryCount, data.queries.length);
    globals[contextKey] = {env: {DB: {prepare() {throw new Error("Fixture database unavailable");}}}};
    const unavailable = await route.GET();
    assert.equal(unavailable.status, 503, "Do not serve stale shared results after a failed database read.");
    assert.equal(unavailable.headers.get("cache-control"), "no-store");
  } finally { globalThis.fetch = previousFetch; globals[contextKey] = previousContext; }
});
