import type { PublicSearchObservation, PublicSearchQuery, PublicSearchRankings } from "./public-search-rankings";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";

export type PublicCollectionStatus = "not-started" | "queued" | "running" | "completed" | "failed" | "cancelled" | "unresolved";
export type PublicCollectionProgress = {
  format: "folio-public-search-progress-v1";
  updatedAt: string;
  queries: { queryId: string; status: PublicCollectionStatus; startedAt?: string; finishedAt?: string; observationId?: string }[];
};
export type PublicDashboardQuery = PublicSearchQuery & {
  collection: { status: PublicCollectionStatus; startedAt: string | null; finishedAt: string | null };
  resultStatus: "published" | "awaiting-publication" | "not-published";
  latestObservation: PublicSearchObservation | null;
  observationCount: number;
};
export type PublicHtmlCoverage = {
  catalogWebsiteCount: number;
  measuredHomepageCount: number;
  unavailableHomepageCount: number;
  notMeasuredHomepageCount: number;
  generatedAt: string;
  suiteVersion: string;
  scope: string;
};
export type PublicDashboardData = {
  format: "folio-public-dashboard-v1";
  /** Last published collection-status update, not a freshly inferred collection timestamp. */
  updatedAt: string;
  summary: {
    queryCount: number;
    publishedQueryCount: number;
    publishedObservationCount: number;
    completedUnpublishedQueryCount: number;
    collection: { notStarted: number; queued: number; running: number; completed: number; failed: number; cancelled: number; unresolved: number };
    /** Distinct exact hosts in each query's latest published answer; www is normalized. */
    uniqueRecommendedWebsiteCount: number;
    /** Distinct exact citation URLs in each query's latest published answer. */
    uniqueCitedSourceCount: number;
  };
  queries: PublicDashboardQuery[];
  /** Original artifact order is retained, including older observations. */
  observations: PublicSearchObservation[];
  htmlCoverage?: PublicHtmlCoverage | null;
};

function invalid(): never { throw new Error("Invalid public collection progress artifact."); }
function plain(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) return invalid();
  return value as Record<string, unknown>;
}
function validTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  const date = new Date(value);
  return Boolean(match && Number.isFinite(date.getTime()) && date.toISOString() === `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`);
}

/** Strict allowlist: public task IDs and times only, with complete coverage of the reviewed query set. */
export function assertPublicCollectionProgress(value: unknown, queries: readonly PublicSearchQuery[], observations: readonly PublicSearchObservation[] = []): asserts value is PublicCollectionProgress {
  const artifact = plain(value, ["format", "updatedAt", "queries"]);
  if (artifact.format !== "folio-public-search-progress-v1" || !validTime(artifact.updatedAt) || !Array.isArray(artifact.queries)) return invalid();
  const expected = new Set(queries.map(query => query.id)), seen = new Set<string>();
  if (artifact.queries.length !== expected.size || expected.size !== queries.length) return invalid();
  for (const value of artifact.queries) {
    const item = plain(value, ["queryId", "status"], ["startedAt", "finishedAt", "observationId"]);
    if (typeof item.queryId !== "string" || !expected.has(item.queryId) || seen.has(item.queryId) ||
      typeof item.status !== "string" || !["not-started", "queued", "running", "completed", "failed", "cancelled", "unresolved"].includes(item.status)) return invalid();
    if (Object.hasOwn(item, "startedAt") && !validTime(item.startedAt) || Object.hasOwn(item, "finishedAt") && !validTime(item.finishedAt)) return invalid();
    if (typeof item.startedAt === "string" && typeof item.finishedAt === "string" && Date.parse(item.finishedAt) < Date.parse(item.startedAt)) return invalid();
    if (Object.hasOwn(item, "observationId") && (typeof item.observationId !== "string" || !observations.some(observation => observation.id === item.observationId && observation.queryId === item.queryId))) return invalid();
    seen.add(item.queryId);
  }
}

/** Derive public-only display data. No authentication, private lookup, capture, or provider operation. */
export function buildPublicDashboard(rankings: unknown, status: unknown): PublicDashboardData {
  assertPublicSearchRankings(rankings);
  assertPublicCollectionProgress(status, rankings.queries, rankings.observations);
  const publicRankings: PublicSearchRankings = structuredClone(rankings);
  const collectionById = new Map(status.queries.map(query => [query.queryId, query]));
  const queries = publicRankings.queries.map((query): PublicDashboardQuery => {
    const progress = collectionById.get(query.id)!;
    const observations = publicRankings.observations.filter(observation => observation.queryId === query.id);
    // Equal timestamps retain the first source observation rather than inventing an order.
    const latestObservation = observations.reduce<PublicSearchObservation | null>((latest, observation) =>
      !latest || Date.parse(observation.observedAt) > Date.parse(latest.observedAt) ? observation : latest, null);
    return { ...query, collection: { status: progress.status, startedAt: progress.startedAt ?? null, finishedAt: progress.finishedAt ?? null },
      resultStatus: latestObservation ? "published" : progress.status === "completed" ? "awaiting-publication" : "not-published",
      latestObservation, observationCount: observations.length };
  });
  const collection = { notStarted: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0, unresolved: 0 };
  const websites = new Set<string>(), sources = new Set<string>();
  for (const query of queries) {
    collection[query.collection.status === "not-started" ? "notStarted" : query.collection.status]++;
    for (const recommendation of query.latestObservation?.recommendations ?? []) {
      if (recommendation.url) websites.add(new URL(recommendation.url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""));
    }
    for (const citation of query.latestObservation?.citations ?? []) sources.add(citation.url);
  }
  return { format: "folio-public-dashboard-v1", updatedAt: status.updatedAt,
    summary: { queryCount: queries.length, publishedQueryCount: queries.filter(query => query.latestObservation).length,
      publishedObservationCount: publicRankings.observations.length,
      completedUnpublishedQueryCount: queries.filter(query => query.resultStatus === "awaiting-publication").length,
      collection, uniqueRecommendedWebsiteCount: websites.size, uniqueCitedSourceCount: sources.size },
    queries, observations: publicRankings.observations, htmlCoverage: null };
}

/** HTML coverage is independent of search collection, and excludes local previews and non-catalog rows. */
export function buildPublicHtmlCoverage(
  catalog: readonly {id: string}[],
  batch: {generatedAt: string; suiteVersion: string; scope: string; results: readonly {toolId: string; captureKind: string; status: string; score: number | null; capturedAt: string}[]},
): PublicHtmlCoverage {
  if (!validTime(batch.generatedAt) || new Set(catalog.map(site => site.id)).size !== catalog.length) throw new Error("Invalid public HTML coverage input.");
  let measuredHomepageCount = 0, unavailableHomepageCount = 0, notMeasuredHomepageCount = 0;
  for (const site of catalog) {
    const eligible = batch.results.filter(result => result.toolId === site.id && result.captureKind === "public-homepage");
    if (eligible.some(result => !validTime(result.capturedAt))) throw new Error("Invalid public HTML coverage input.");
    const result = eligible
      .reduce<(typeof batch.results)[number] | null>((latest, result) => !latest || Date.parse(result.capturedAt) > Date.parse(latest.capturedAt) ? result : latest, null);
    if (result?.status === "complete" && typeof result.score === "number" && Number.isFinite(result.score) && result.score >= 0 && result.score <= 100) measuredHomepageCount++;
    else if (result?.status === "unavailable") unavailableHomepageCount++;
    else notMeasuredHomepageCount++;
  }
  return {catalogWebsiteCount: catalog.length, measuredHomepageCount, unavailableHomepageCount, notMeasuredHomepageCount,
    generatedAt: batch.generatedAt, suiteVersion: batch.suiteVersion, scope: batch.scope};
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key)
    && equalJson((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

function assertHtmlCoverage(value: unknown): asserts value is PublicHtmlCoverage {
  const coverage = plain(value, ["catalogWebsiteCount", "measuredHomepageCount", "unavailableHomepageCount", "notMeasuredHomepageCount", "generatedAt", "suiteVersion", "scope"]);
  for (const key of ["catalogWebsiteCount", "measuredHomepageCount", "unavailableHomepageCount", "notMeasuredHomepageCount"]) {
    if (!Number.isSafeInteger(coverage[key]) || (coverage[key] as number) < 0) return invalid();
  }
  if (coverage.catalogWebsiteCount !== (coverage.measuredHomepageCount as number) + (coverage.unavailableHomepageCount as number) + (coverage.notMeasuredHomepageCount as number)
    || !validTime(coverage.generatedAt) || typeof coverage.suiteVersion !== "string" || !coverage.suiteVersion.trim() || coverage.suiteVersion.length > 100
    || typeof coverage.scope !== "string" || !coverage.scope.trim() || coverage.scope.length > 500) return invalid();
}

/** Validate fetched public data, including exact source order, relationships, and recomputed counters. */
export function assertPublicDashboardData(value: unknown): asserts value is PublicDashboardData {
  const data = plain(value, ["format", "updatedAt", "summary", "queries", "observations"], ["htmlCoverage"]);
  if (data.format !== "folio-public-dashboard-v1" || !Array.isArray(data.queries)) return invalid();
  const queries: Record<string, unknown>[] = [], progress: Record<string, unknown>[] = [];
  for (const item of data.queries) {
    const query = plain(item, ["id", "audience", "category", "query", "language", "locale", "collection", "resultStatus", "latestObservation", "observationCount"]);
    const collection = plain(query.collection, ["status", "startedAt", "finishedAt"]);
    queries.push(Object.fromEntries(["id", "audience", "category", "query", "language", "locale"].map(key => [key, query[key]])));
    progress.push({queryId: query.id, status: collection.status,
      ...(collection.startedAt === null ? {} : {startedAt: collection.startedAt}),
      ...(collection.finishedAt === null ? {} : {finishedAt: collection.finishedAt})});
  }
  const expected = buildPublicDashboard({format: "folio-public-search-rankings-v1", queries, observations: data.observations},
    {format: "folio-public-search-progress-v1", updatedAt: data.updatedAt, queries: progress});
  if (!equalJson(data.summary, expected.summary) || !equalJson(data.queries, expected.queries)) return invalid();
  if (Object.hasOwn(data, "htmlCoverage") && data.htmlCoverage !== null) assertHtmlCoverage(data.htmlCoverage);
}
