import type { PublicDashboardData, PublicDashboardQuery } from "./public-dashboard";

export type PublicModelTask = Omit<PublicDashboardQuery, "collection"> & {
  collection: Omit<PublicDashboardQuery["collection"], "status"> & {
    status: PublicDashboardQuery["collection"]["status"] | "unmeasured";
  };
};
export type PublicModelView = Omit<PublicDashboardData, "queries"> & { queries: PublicModelTask[] };

/** Collection progress has no model provenance. Only published evidence can be scoped to a model. */
export function publicModelView(data: PublicDashboardData, model: string | null): PublicModelView {
  if (model === null) return data;
  const observations = data.observations.filter(item => item.model === model);
  const byQuery = new Map<string, typeof observations>();
  for (const observation of observations) {
    const items = byQuery.get(observation.queryId) ?? [];
    items.push(observation); byQuery.set(observation.queryId, items);
  }
  const websites = new Set<string>(), sources = new Set<string>();
  const queries = data.queries.map((query): PublicModelTask => {
    const matching = byQuery.get(query.id) ?? [];
    const latestObservation = matching.reduce<(typeof observations)[number] | null>((latest, item) =>
      !latest || Date.parse(item.observedAt) > Date.parse(latest.observedAt) ? item : latest, null);
    for (const item of latestObservation?.recommendations ?? []) {
      if (item.url) websites.add(new URL(item.url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""));
    }
    for (const citation of latestObservation?.citations ?? []) sources.add(citation.url);
    return { ...query, latestObservation, observationCount: matching.length,
      resultStatus: latestObservation ? "published" : "not-published",
      collection: { status: latestObservation ? "completed" : "unmeasured", startedAt: null, finishedAt: latestObservation?.observedAt ?? null } };
  });
  const publishedQueryCount = queries.filter(query => query.latestObservation).length;
  return { ...data, queries, observations, summary: {
    queryCount: queries.length, publishedQueryCount, publishedObservationCount: observations.length,
    completedUnpublishedQueryCount: 0,
    // Unknown model-specific operational state is not a zero-run or not-started claim.
    collection: { notStarted: 0, queued: 0, running: 0, completed: publishedQueryCount, failed: 0, cancelled: 0, unresolved: 0 },
    uniqueRecommendedWebsiteCount: websites.size, uniqueCitedSourceCount: sources.size,
  } };
}
