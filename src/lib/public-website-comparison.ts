import type { KeywordBenchmarkRun } from "./keyword-benchmark-types";
import type { PublicSearchObservation, PublicSearchQuery } from "./public-search-rankings";

/** Public records omit private references and environment fingerprints. Never claim a matched delta. */
export function publicWebsiteComparison(run: KeywordBenchmarkRun, queries: PublicSearchQuery[], observations: PublicSearchObservation[]) {
  const matching = queries.filter(query => query.query === run.case.query && query.language === run.case.language && query.locale === run.case.locale);
  const ids = new Set(matching.map(query => query.id));
  const candidates = observations.filter(item => ids.has(item.queryId) && item.status === "completed" &&
    run.case.searchMode === "open-web" && item.searchMode === run.case.searchMode && item.model === run.model &&
    item.surface === run.surface && item.harnessVersion === run.harnessVersion && item.environmentType === run.environmentType &&
    Number.isFinite(Date.parse(item.observedAt)))
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt) || a.id.localeCompare(b.id));
  const observation = candidates[0] ?? null;
  return { state: observation ? "same-public-context" as const : "unmeasured" as const,
    query: observation ? matching.find(query => query.id === observation.queryId)! : null, observation,
    reason: observation ? "Same question, language, location, model, search scope and public execution labels. Private reference facts and environment fingerprints are unavailable in the index; no change score is calculated." :
      matching.length ? "This question has no published observation with the same model, search scope and execution labels." : "No identical question, language and location is published in this index." };
}
