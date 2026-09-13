import { isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkRun, type KeywordCollectionEvidence, type KeywordSearchMode } from "./keyword-benchmark-types";

export const KEYWORD_COLLECTION_MAX_BYTES = 750_000;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Bounded JSON projection; provider items remain inert private evidence. */
export function validateKeywordCollectionEvidence(value: unknown): KeywordCollectionEvidence {
  const invalid = (): never => { throw new Error("Invalid or oversized keyword collection evidence."); };
  if (!object(value)) return invalid();
  const required = ["format", "searchMode", "collectedAt", "sessionId", "rootTurnId", "finalAnswerItemId", "finalAnswerJson", "searchItems", "validationItem"];
  if (required.some(key => !Object.hasOwn(value, key)) || value.format !== "folio-keyword-collection-v1" ||
    (value.searchMode !== "reviewed-domains" && value.searchMode !== "open-web") ||
    !isKeywordBenchmarkId(value.sessionId) || !isKeywordBenchmarkId(value.rootTurnId) || !isKeywordBenchmarkId(value.finalAnswerItemId) ||
    typeof value.collectedAt !== "string" || value.collectedAt.length > 40 || !Number.isFinite(Date.parse(value.collectedAt)) ||
    typeof value.finalAnswerJson !== "string" || !value.finalAnswerJson.length || value.finalAnswerJson.length > 50_000 ||
    !Array.isArray(value.searchItems) || !value.searchItems.length || value.searchItems.length > 500 || !object(value.validationItem)) return invalid();
  const mode = keywordSearchMode(value.searchMode as KeywordSearchMode);
  if (value.searchItems.some(item => !object(item) || ["id", "type", "turn_id", "status"].some(key => !Object.hasOwn(item, key)) || !isKeywordBenchmarkId(item.id) ||
    item.type !== "web_search_call" || item.turn_id !== value.rootTurnId || typeof item.status !== "string" || item.status.length > 40) ||
    !value.searchItems.some(item => item.status === "completed") ||
    new Set(value.searchItems.map(item => item.id)).size !== value.searchItems.length) return invalid();
  const command = value.validationItem;
  if (["id", "type", "turn_id", "status", "exit_code", "output"].some(key => !Object.hasOwn(command, key)) || !isKeywordBenchmarkId(command.id) || command.type !== "command_execution" ||
    command.turn_id !== value.rootTurnId || command.status !== "completed" || (command.exit_code !== 0 && command.exit_code !== null) ||
    typeof command.output !== "string" || !command.output.split("\n").some(line => line.trim() === "FOLIO_KEYWORD_JSON_VALID")) return invalid();
  try {
    if (!object(JSON.parse(value.finalAnswerJson))) return invalid();
    const serialized = JSON.stringify({ format: value.format, searchMode: mode, collectedAt: value.collectedAt,
      sessionId: value.sessionId, rootTurnId: value.rootTurnId, finalAnswerItemId: value.finalAnswerItemId,
      finalAnswerJson: value.finalAnswerJson, searchItems: value.searchItems, validationItem: command });
    if (new TextEncoder().encode(serialized).byteLength > KEYWORD_COLLECTION_MAX_BYTES) return invalid();
    return JSON.parse(serialized) as KeywordCollectionEvidence;
  } catch { return invalid(); }
}

/** Syntax guard only. No DNS lookup or page fetch is performed by these helpers. */
export function keywordPublicHost(host: string): boolean {
  return host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) &&
    !/(?:^|\.)(?:localhost|localdomain|local|internal|intranet|corp|home|lan|test|invalid|example|onion|arpa)$/.test(host);
}

export function keywordPublicUrl(value: unknown, httpsOnly = true): URL | null {
  if (typeof value !== "string" || !value.length || value.length > 2_000 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!(httpsOnly ? url.protocol === "https:" : ["https:", "http:"].includes(url.protocol)) ||
      url.username || url.password || url.port || !keywordPublicHost(url.hostname.replace(/\.$/, ""))) return null;
    return url;
  } catch { return null; }
}

export type KeywordRecommendationMetrics = {
  targetDomain: string | null;
  /** Exact recommendation-URL host match; not an inferred product-name alias. */
  targetNamed: "yes" | "no" | "unknown";
  targetCited: boolean | null;
  targetPositions: number[];
  recommendations: {
    position: number; name: string; url: string | null; domain: string | null;
    matchesTarget: boolean | null; citationUrls: string[];
  }[];
  citationCount: number;
};
const domain = (value: unknown) => keywordPublicUrl(value, false)?.hostname.replace(/\.$/, "").replace(/^www\./, "") ?? null;

/** Returned order is an observation of this answer, never an engine/market ranking. */
export function keywordRecommendationMetrics(run: Pick<KeywordBenchmarkRun, "status" | "answer" | "case">): KeywordRecommendationMetrics {
  const targetDomain = domain(run.case.targetUrl);
  const completed = run.status === "completed" && Boolean(run.answer);
  const citations = completed ? run.answer!.citations : [];
  const knownCitations = new Set(citations.filter(item => domain(item.url)).map(item => item.url));
  const recommendations = (completed ? run.answer!.mentions : []).map((item, index) => {
    const matchedDomain = domain(item.url);
    return {
      position: index + 1, name: item.name, url: keywordPublicUrl(item.url, false)?.href ?? null,
      domain: matchedDomain, matchesTarget: targetDomain && matchedDomain ? targetDomain === matchedDomain : null,
      citationUrls: [...new Set((item.citationUrls ?? []).filter(url => knownCitations.has(url)))],
    };
  });
  const targetPositions = recommendations.filter(item => item.matchesTarget === true).map(item => item.position);
  const targetNamed = !completed || !targetDomain ? "unknown" : targetPositions.length ? "yes" :
    recommendations.some(item => item.domain === null) ? "unknown" : "no";
  const targetCited = !completed || !targetDomain ? null : citations.some(item => domain(item.url) === targetDomain) ? true :
    citations.some(item => !domain(item.url)) ? null : false;
  return { targetDomain, targetNamed, targetCited, targetPositions, recommendations, citationCount: knownCitations.size };
}
