import type { PublicSearchObservation, PublicSearchRankings, PublicSearchRecommendation } from "./public-search-rankings";
import { assertPublicSearchRankings } from "./public-search-rankings-validation";

type PublicJudgment<T extends string> = {
  choice: T;
  confidence: number;
  probabilities: Record<T, number>;
};

export type PublicQuestionCoverageRecord = {
  observationId: string;
  queryId: string;
  /** Original recommendation position, not an evidence score or reordered rank. */
  position: number;
  recommendationUrl: string;
  websiteUrl: string;
  evaluatedAt: string;
  method: "question-page-coverage-v1";
  /** Coverage evaluator provenance, independent of the search observation's model. */
  requestedModel: string;
  model: string;
  requestSha256: string;
  status: "direct" | "partial" | "not_established" | "irrelevant" | "review_required";
  captureAttemptCount: number;
  humanReviewRequired: true;
  pages: {
    url: string;
    title: string;
    capturedAt: string;
    sha256: string;
    truncated: boolean;
    excerpt: string;
    relevance: PublicJudgment<"relevant" | "irrelevant" | "uncertain">;
    coverage: PublicJudgment<"direct" | "partial" | "not_established">;
  }[];
};

export type PublicQuestionCoverage = {
  format: "folio-public-question-coverage-v1";
  records: PublicQuestionCoverageRecord[];
};

function fail(path: string, message: string): never {
  // Do not echo rejected keys or values: they may contain private evidence.
  throw new Error(`Invalid public question coverage at ${path}: ${message}.`);
}

function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "expected a plain object");
  const allowed = new Set(keys);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowed.has(key)) fail(path, "contains a field outside the public allowlist");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail(path, "expected enumerable data fields");
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "required field is missing");
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim())) fail(path, "invalid public text");
  return value;
}

function boundedArray(value: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, "array length is outside the allowed bounds");
  // Array metadata must not carry private fields or executable accessors either.
  if (Object.getPrototypeOf(value) !== Array.prototype) fail(path, "expected a plain array");
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)
      fail(path, "contains a field outside the public allowlist");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) fail(path, "expected enumerable array entries");
  }
  // Sparse arrays must not bypass per-entry validation.
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) fail(path, "array contains a missing entry");
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(path, "integer is outside the allowed bounds");
  return value as number;
}

function timestamp(value: unknown, path: string): number {
  const input = text(value, path, 40);
  const match = input.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  const parsed = new Date(input);
  if (!match || !Number.isFinite(parsed.getTime())
    || parsed.toISOString() !== `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`) fail(path, "expected a real UTC timestamp");
  return parsed.getTime();
}

function sha256(value: unknown, path: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail(path, "expected a lowercase SHA-256 digest");
}

function model(value: unknown, path: string): void {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) fail(path, "expected a model identifier");
}

/** Public DNS names only: no IP literals, local names, credentials or custom ports.
 * This is an offline publication contract, not a DNS/network safety guarantee. */
function publicUrl(value: unknown, path: string, source: boolean): URL {
  const input = text(value, path, 4096);
  if (/[\u0000-\u0020\u007f\\]/.test(input)) fail(path, "unsafe URL");
  let url: URL;
  try { url = new URL(input); } catch { fail(path, "expected an absolute URL"); }
  const host = url.hostname;
  if (!(source ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol))
    || url.username || url.password || url.port || !host.includes(".")
    || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/.test(host)
    || /(?:^|\.)(?:localhost|local|internal|home|lan|invalid|onion)$/.test(host)) fail(path, "expected a public website URL");
  if (source && (url.search || url.hash || input.includes("?") || input.includes("#") || url.href !== input))
    fail(path, "expected a canonical HTTPS source URL without query or fragment");
  return url;
}

function probability(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) fail(path, "expected a finite probability in [0, 1]");
  return value;
}

function judgment<T extends string>(value: unknown, path: string, choices: readonly T[]): PublicJudgment<T> {
  const input = object(value, path, ["choice", "confidence", "probabilities"]);
  if (!choices.includes(input.choice as T)) fail(`${path}.choice`, "unknown choice");
  probability(input.confidence, `${path}.confidence`);
  const probabilities = object(input.probabilities, `${path}.probabilities`, choices);
  const values = choices.map(choice => probability(probabilities[choice], `${path}.probabilities.${choice}`));
  if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) > 0.001
    || (probabilities[input.choice as T] as number) < Math.max(...values)) fail(path, "inconsistent choice probabilities");
  return input as unknown as PublicJudgment<T>;
}

/** Strict, non-mutating allowlist for browser-consumable evidence tied to published recommendations. */
export function assertPublicQuestionCoverage(value: unknown, rankings: PublicSearchRankings): asserts value is PublicQuestionCoverage {
  assertPublicSearchRankings(rankings);
  const artifact = object(value, "artifact", ["format", "records"]);
  if (artifact.format !== "folio-public-question-coverage-v1") fail("artifact.format", "unsupported format");
  const observations = new Map(rankings.observations.map(observation => [observation.id, observation]));
  const seen = new Set<string>();
  boundedArray(artifact.records, "records", 0, 10_000).forEach((input, index) => {
    const path = `records[${index}]`;
    const record = object(input, path, ["observationId", "queryId", "position", "recommendationUrl", "websiteUrl", "evaluatedAt", "method", "requestedModel", "model", "requestSha256", "status", "captureAttemptCount", "humanReviewRequired", "pages"]);
    const observation = observations.get(text(record.observationId, `${path}.observationId`, 160));
    if (!observation || record.queryId !== observation.queryId) fail(path, "observation or exact query does not match published rankings");
    const position = integer(record.position, `${path}.position`, 1, Number.MAX_SAFE_INTEGER);
    const recommendation = observation.recommendations.find(item => item.position === position);
    if (!recommendation || recommendation.url === null || record.recommendationUrl !== recommendation.url)
      fail(path, "original position and recommendation URL must match the observation");
    const key = `${observation.id}:${position}`;
    if (seen.has(key)) fail(path, "duplicate observation and position");
    seen.add(key);
    const recommended = publicUrl(record.recommendationUrl, `${path}.recommendationUrl`, false);
    const website = publicUrl(record.websiteUrl, `${path}.websiteUrl`, true);
    if (website.href !== `${website.origin}/`
      || website.hostname.replace(/^www\./, "") !== recommended.hostname.replace(/^www\./, ""))
      fail(`${path}.websiteUrl`, "canonical website origin does not match the exact recommended host");
    const evaluatedAt = timestamp(record.evaluatedAt, `${path}.evaluatedAt`);
    if (record.method !== "question-page-coverage-v1") fail(`${path}.method`, "unsupported method");
    model(record.requestedModel, `${path}.requestedModel`);
    model(record.model, `${path}.model`);
    sha256(record.requestSha256, `${path}.requestSha256`);
    const attemptCount = integer(record.captureAttemptCount, `${path}.captureAttemptCount`, 1, 6);
    if (record.humanReviewRequired !== true) fail(`${path}.humanReviewRequired`, "human review must remain required");
    const pageUrls = new Set<string>();
    const pages = boundedArray(record.pages, `${path}.pages`, 1, 6).map((input, offset) => {
      const pagePath = `${path}.pages[${offset}]`;
      const page = object(input, pagePath, ["url", "title", "capturedAt", "sha256", "truncated", "excerpt", "relevance", "coverage"]);
      const url = publicUrl(page.url, `${pagePath}.url`, true);
      if (url.origin !== website.origin) fail(`${pagePath}.url`, "page must have the exact captured website origin");
      if (pageUrls.has(url.href)) fail(`${pagePath}.url`, "duplicate page URL");
      pageUrls.add(url.href);
      text(page.title, `${pagePath}.title`, 1000, true);
      if (timestamp(page.capturedAt, `${pagePath}.capturedAt`) > evaluatedAt) fail(`${path}.evaluatedAt`, "evaluation predates a capture");
      sha256(page.sha256, `${pagePath}.sha256`);
      if (typeof page.truncated !== "boolean") fail(`${pagePath}.truncated`, "expected a boolean");
      text(page.excerpt, `${pagePath}.excerpt`, 600, true);
      return {
        relevance: judgment(page.relevance, `${pagePath}.relevance`, ["relevant", "irrelevant", "uncertain"] as const),
        coverage: judgment(page.coverage, `${pagePath}.coverage`, ["direct", "partial", "not_established"] as const),
      };
    });
    if (attemptCount < pages.length) fail(`${path}.captureAttemptCount`, "fewer capture attempts than captured pages");
    // Same conservative strongest-page algorithm as the private evaluator: even an
    // irrelevant page with positive coverage overrides a direct page for review.
    const review = pages.some(page => page.relevance.choice !== "relevant" && page.coverage.choice !== "not_established");
    const status = review ? "review_required"
      : pages.some(page => page.relevance.choice === "relevant" && page.coverage.choice === "direct") ? "direct"
      : pages.some(page => page.relevance.choice === "relevant" && page.coverage.choice === "partial") ? "partial"
      : pages.every(page => page.relevance.choice === "irrelevant") ? "irrelevant" : "not_established";
    if (record.status !== status) fail(`${path}.status`, "status does not match conservative strongest-page coverage");
  });
}

/** Missing coverage stays unmeasured; never match by domain or a newer/different question. */
export function coverageForRecommendation(
  coverage: PublicQuestionCoverage | undefined,
  observation: PublicSearchObservation,
  recommendation: PublicSearchRecommendation,
): PublicQuestionCoverageRecord | undefined {
  return coverage?.records.find(record => record.observationId === observation.id && record.queryId === observation.queryId
    && record.position === recommendation.position && record.recommendationUrl === recommendation.url);
}
