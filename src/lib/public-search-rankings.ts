import artifact from "@/data/public-search-rankings.json";
import progressArtifact from "@/data/public-search-progress.json";
import type { PublicCollectionProgress } from "./public-dashboard";
import additionalQuestions from "@/data/public-additional-questions.json";
import type { WebsiteAudience } from "./developer-tools-source";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";

export type PublicSearchQuery = {
  id: string;
  audience: WebsiteAudience;
  category: string;
  query: string;
  language: string;
  locale: string;
};

export type PublicSearchRecommendation = {
  /** Original position in the returned recommendation list; never an HTML score. */
  position: number;
  name: string;
  url: string | null;
  reason?: string;
  citationUrls: string[];
};

/** Allowlisted public projection of a completed, independently collected search observation. */
export type PublicSearchObservation = {
  id: string;
  queryId: string;
  observedAt: string;
  status: "completed";
  model: string;
  surface: "openai-managed-agents";
  searchMode: "open-web";
  harnessVersion: string;
  environmentType: string;
  recommendations: PublicSearchRecommendation[];
  citations: { url: string; title?: string | null }[];
  limitations: string[];
};

export type PublicSearchRankings = {
  format: "folio-public-search-rankings-v1";
  queries: PublicSearchQuery[];
  observations: PublicSearchObservation[];
};

const expandedArtifact = { ...artifact, queries: [...artifact.queries, ...additionalQuestions] };
assertPublicSearchRankings(expandedArtifact);
export const PUBLIC_SEARCH_RANKINGS: PublicSearchRankings = expandedArtifact;
export const PUBLIC_SEARCH_QUERIES = PUBLIC_SEARCH_RANKINGS.queries;
/** Original website-question cohort; expanded scenario libraries are separate. */
const coreIds = new Set(artifact.queries.filter(query => !/-s\d+-q\d+$/.test(query.id)).map(query => query.id));
export const PUBLIC_CORE_QUERIES = PUBLIC_SEARCH_QUERIES.filter(query => coreIds.has(query.id));
export const PUBLIC_SEARCH_OBSERVATIONS = PUBLIC_SEARCH_RANKINGS.observations;

/** A newer observation replaces only the same exact query; no cross-query rank or delta. */
export function latestPublicSearchObservation(queryId: string): PublicSearchObservation | undefined {
  return PUBLIC_SEARCH_OBSERVATIONS.filter(observation => observation.queryId === queryId)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
}

export const PUBLIC_SEARCH_PROGRESS: PublicCollectionProgress = { ...progressArtifact, format: "folio-public-search-progress-v1", queries: [...progressArtifact.queries as PublicCollectionProgress["queries"], ...additionalQuestions.map(query => ({ queryId: query.id, status: "not-started" as const }))] };
