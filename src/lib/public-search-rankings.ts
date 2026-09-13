import artifact from "@/data/public-search-rankings.json";
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

assertPublicSearchRankings(artifact);
export const PUBLIC_SEARCH_RANKINGS: PublicSearchRankings = artifact;
export const PUBLIC_SEARCH_QUERIES = PUBLIC_SEARCH_RANKINGS.queries;
export const PUBLIC_SEARCH_OBSERVATIONS = PUBLIC_SEARCH_RANKINGS.observations;

/** A newer observation replaces only the same exact query; no cross-query rank or delta. */
export function latestPublicSearchObservation(queryId: string): PublicSearchObservation | undefined {
  return PUBLIC_SEARCH_OBSERVATIONS.filter(observation => observation.queryId === queryId)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
}
