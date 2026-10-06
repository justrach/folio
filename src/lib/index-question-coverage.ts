import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { PublicSearchRankings } from "./public-search-rankings";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";
import { assertPublicQuestionCoverage, type PublicQuestionCoverage } from "./public-question-coverage";
import {
  prepareQuestionCoverage, validateQuestionCoverageResult,
  type CoveragePlan, type CoverageQuestion,
} from "./question-coverage";

export type IndexCoveragePlan = {
  format: "folio-index-question-coverage-plan-v1";
  rankings: PublicSearchRankings;
  links: { position: number; websiteUrl: string }[];
  coverage: CoveragePlan;
};
const host = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
export function indexCoverageCatalog(plan: IndexCoveragePlan): CoverageQuestion[] {
  return plan.rankings.queries.map(question => ({ ...question, questionType: "public-index-question" }));
}

/** Freeze the actual public question and returned websites, never a replacement draft question or inferred rank. */
export function prepareIndexQuestionCoverage(input: unknown, observationId: string, positions: readonly number[], evidences: unknown[], model = "jev-latest"): IndexCoveragePlan {
  assertPublicSearchRankings(input);
  const observation = input.observations.find(item => item.id === observationId);
  const query = input.queries.find(item => item.id === observation?.queryId);
  if (!observation || !query) throw new Error("Select an existing public observation and its exact question.");
  if (!positions.length || positions.length > 2 || new Set(positions).size !== positions.length) throw new Error("Select one or two distinct returned positions.");
  const rankings: PublicSearchRankings = { format: "folio-public-search-rankings-v1", queries: [structuredClone(query)], observations: [structuredClone(observation)] };
  const catalog = rankings.queries.map(question => ({ ...question, questionType: "public-index-question" }));
  const coverage = prepareQuestionCoverage(evidences, [query.id], model, catalog);
  if (coverage.websites.some(website => website.targetUrl !== `${new URL(website.targetUrl).origin}/`)) throw new Error("Index coverage requires a frozen website-root capture.");
  const links = positions.map(position => {
    const recommendation = observation.recommendations.find(item => item.position === position);
    if (!recommendation?.url || new URL(recommendation.url).protocol !== "https:") throw new Error("Selected recommendation needs a returned HTTPS website URL.");
    const website = coverage.websites.find(item => host(item.targetUrl) === host(recommendation.url!));
    if (!website) throw new Error("Frozen website origin must match the returned website; subdomains are not interchangeable.");
    return { position, websiteUrl: website.targetUrl };
  });
  if (coverage.websites.some(website => !links.some(link => link.websiteUrl === website.targetUrl))) throw new Error("Every frozen website must belong to a selected returned recommendation.");
  return { format: "folio-index-question-coverage-plan-v1", rankings, links, coverage };
}

export function validateIndexCoveragePlan(value: unknown): IndexCoveragePlan {
  const input = value as IndexCoveragePlan;
  if (!input || !Array.isArray(input.rankings?.observations) || input.rankings.observations.length !== 1 || input.rankings.queries.length !== 1 || !Array.isArray(input.links) || !input.coverage) throw new Error("Invalid frozen index coverage plan.");
  const plan = prepareIndexQuestionCoverage(input.rankings, input.rankings.observations[0].id, input.links.map(link => link.position), input.coverage.websites, input.coverage.request.model);
  if (!isDeepStrictEqual(plan, input)) throw new Error("Frozen index question, observation, website or provider request changed.");
  return plan;
}

/** Explicit public preview: no private IDs, raw HTML, full captures, usage, credentials or provider error bodies. */
export function projectIndexQuestionCoverage(input: IndexCoveragePlan, saved: unknown, evaluatedAt: string): PublicQuestionCoverage {
  const plan = validateIndexCoveragePlan(input);
  const result = validateQuestionCoverageResult(saved, plan.coverage, indexCoverageCatalog(plan));
  const observation = plan.rankings.observations[0];
  const records = plan.links.map(link => {
    const recommendation = observation.recommendations.find(item => item.position === link.position)!;
    const website = plan.coverage.websites.find(item => item.targetUrl === link.websiteUrl)!;
    const row = result.rows.find(item => item.websiteUrl === website.targetUrl && item.questionId === observation.queryId)!;
    const pages = website.pages.map(page => {
      const judgment = result.judgments.find(item => item.websiteUrl === website.targetUrl && item.source.pageId === page.id && item.questionId === observation.queryId)!;
      return { url: page.url, title: page.title, capturedAt: page.capturedAt, sha256: page.sha256, truncated: page.truncated,
        excerpt: page.text.slice(0, 600),
        relevance: { choice: judgment.relevance.choice, confidence: judgment.relevance.confidence, probabilities: judgment.relevance.probabilities },
        coverage: { choice: judgment.coverage.choice, confidence: judgment.coverage.confidence, probabilities: judgment.coverage.probabilities } };
    });
    return { observationId: observation.id, queryId: observation.queryId, position: recommendation.position, recommendationUrl: recommendation.url!,
      websiteUrl: website.targetUrl, evaluatedAt, method: result.method, requestedModel: result.requestedModel, model: result.model,
      requestSha256: result.requestSha256, status: row.status, captureAttemptCount: website.attempts.length, humanReviewRequired: true as const, pages };
  });
  const projection: PublicQuestionCoverage = { format: "folio-public-question-coverage-v1", records };
  assertPublicQuestionCoverage(projection, plan.rankings);
  return projection;
}
