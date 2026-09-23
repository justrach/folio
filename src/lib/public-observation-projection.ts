import "server-only";
import { isRecordedKeywordOpenWebModel } from "./keyword-models";
import { createHash } from "node:crypto";
import { keywordAgentHarnessVersion } from "./keyword-benchmark-agent";
import { keywordSearchMode, type KeywordBenchmarkAnswer, type KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { validateKeywordBenchmarkAnswer } from "./keyword-benchmark-store";
import { validateKeywordCollectionEvidence } from "./keyword-search-mode";
import type { PublicSearchObservation, PublicSearchQuery } from "./public-search-rankings";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";

export class PublicCollectionUsageError extends Error {}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function sameQuery(run: KeywordBenchmarkRun, query: PublicSearchQuery) {
  return run.case.query === query.query && run.case.language === query.language && run.case.locale === query.locale;
}
function publicAnswerFields(answer: KeywordBenchmarkAnswer) {
  return {
    recommendations: answer.mentions.map((mention, index) => ({ position: index + 1, name: mention.name, url: mention.url,
      ...(mention.reason?.trim() ? { reason: mention.reason } : {}), citationUrls: [...(mention.citationUrls ?? [])] })),
    citations: answer.citations.map(citation => ({ url: citation.url, ...(citation.title?.trim() ? { title: citation.title } : {}) })),
    limitations: [...(answer.limitations ?? [])],
  };
}
/** Exact allowlist projection. Keep returned order, duplicates, missing URLs and stated limitations. */
function projectObservation(run: KeywordBenchmarkRun, query: PublicSearchQuery, privateIdentifiers: string[], website: boolean): PublicSearchObservation {
  if (run.status !== "completed" || !run.answer || !run.sessionId || !run.answer.collection || !sameQuery(run, query)
    || (!website && (run.case.targetUrl !== null || (run.case.referenceFacts?.length ?? 0) > 0)) || keywordSearchMode(run.case.searchMode) !== "open-web"
    || !isRecordedKeywordOpenWebModel(run.model) || run.environmentType !== "openai_hosted" || run.allowedDomains.length
    || run.harnessVersion !== keywordAgentHarnessVersion("open-web"))
    throw new PublicCollectionUsageError(website
      ? "Publication requires a completed supported-model open-web collection for this exact question and the standard target-withheld harness."
      : "Export requires a completed supported-model open-web collection for this exact public query, without private targets or reference facts.");
  const collection = validateKeywordCollectionEvidence(run.answer.collection);
  if (collection.searchMode !== "open-web" || collection.sessionId !== run.sessionId || collection.rootTurnId !== run.providerMetadata.turnId)
    throw new PublicCollectionUsageError("The saved collection does not match this run's provider receipt.");
  let retainedAnswer: KeywordBenchmarkAnswer;
  try { retainedAnswer = validateKeywordBenchmarkAnswer(JSON.parse(collection.finalAnswerJson)); }
  catch { throw new PublicCollectionUsageError("The retained final answer is invalid. Nothing was published."); }
  const answerFields = publicAnswerFields(run.answer);
  if (JSON.stringify(answerFields) !== JSON.stringify(publicAnswerFields(retainedAnswer)))
    throw new PublicCollectionUsageError("The proposed public fields do not match the retained final answer. Nothing was published.");
  const projected = {
    queryId: query.id, observedAt: new Date(collection.collectedAt).toISOString(), status: "completed" as const,
    model: run.model, surface: run.surface, searchMode: "open-web" as const,
    harnessVersion: run.harnessVersion, environmentType: run.environmentType,
    ...answerFields,
  };
  const observation: PublicSearchObservation = { id: `obs-${query.id.slice(0, 80)}-${hash(projected).slice(0, 24)}`, ...projected };
  assertPublicSearchRankings({ format: "folio-public-search-rankings-v1", queries: [query], observations: [observation] });
  const serialized = JSON.stringify({ query, observation });
  const privateValues = [run.id, run.caseId, run.suiteId, run.sessionId,
    run.providerMetadata.environmentId, run.providerMetadata.requestId, run.providerMetadata.turnId,
    collection.finalAnswerItemId, ...collection.searchItems.map(item => typeof item.id === "string" ? item.id : ""),
    typeof collection.validationItem.id === "string" ? collection.validationItem.id : "", ...privateIdentifiers];
  if (privateValues.some(value => value && serialized.includes(value))
    || /\b(?:sk-[A-Za-z0-9_-]{12,}|folio_(?:v1|sandbox)_[a-f0-9]{64}|Bearer\s+[A-Za-z0-9._-]+)/i.test(serialized))
    throw new PublicCollectionUsageError("The proposed public export contains private identifiers or credential-like text. Review the private source; nothing was published.");
  return observation;
}
/** Operator collection remains restricted to dedicated public-query runs. */
export function projectPublicSearchObservation(run: KeywordBenchmarkRun, query: PublicSearchQuery, privateIdentifiers: string[] = []): PublicSearchObservation {
  return projectObservation(run, query, privateIdentifiers, false);
}

/** Owner-reviewed publication may originate from a website run. The standard
 * open-web harness withholds targets and reference facts from inference; neither
 * field is exported. Questions and returned public URLs are explicitly public.
 * This function only prepares the projection; it grants no publication authority.
 */
export function projectWebsitePublicObservation(run: KeywordBenchmarkRun, query: PublicSearchQuery, privateIdentifiers: string[] = []): PublicSearchObservation {
  return projectObservation(run, query, privateIdentifiers, true);
}
