import type { PublicSearchRankings } from "./public-search-rankings";

const audiences = new Set(["Developer tools", "Software & work", "Shops & brands", "Services & travel", "Learning"]);
const idPattern = /^[a-z0-9][a-z0-9_-]{0,159}$/;

function fail(path: string, message: string): never {
  // Report the field path, never echo rejected values that may contain private data.
  throw new Error(`Invalid public search rankings at ${path}: ${message}.`);
}

function object(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(path, "expected a plain object");
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(path, "contains a field outside the public allowlist");
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, "required field is missing");
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(path, `expected nonempty text of at most ${maximum} characters`);
  return value;
}

function id(value: unknown, path: string): string {
  const result = text(value, path, 160);
  if (!idPattern.test(result)) fail(path, "expected a lowercase public identifier");
  return result;
}

function safeUrl(value: unknown, path: string): string {
  const result = text(value, path, 4096);
  if (result !== result.trim() || /[\u0000-\u0020\u007f]/.test(result)) fail(path, "URL contains whitespace or control characters");
  let parsed: URL;
  try { parsed = new URL(result); } catch { fail(path, "expected an absolute HTTP(S) URL"); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || !parsed.hostname)
    fail(path, "expected an HTTP(S) URL without credentials");
  for (const key of parsed.searchParams.keys()) {
    if (/^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|password|client[_-]?secret|session[_-]?token)$/i.test(key))
      fail(path, "URL contains an authentication parameter");
  }
  return result;
}

function timestamp(value: unknown, path: string): void {
  const result = text(value, path, 40);
  const match = result.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/);
  const parsed = new Date(result);
  if (!match || !Number.isFinite(parsed.getTime())
    || parsed.toISOString() !== `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`)
    fail(path, "expected a real ISO timestamp in UTC");
}

/** Validate the public projection without mutating, filling, sorting, or inventing observations. */
export function assertPublicSearchRankings(value: unknown): asserts value is PublicSearchRankings {
  const artifact = object(value, "artifact", ["format", "queries", "observations"]);
  if (artifact.format !== "folio-public-search-rankings-v1") fail("artifact.format", "unsupported public artifact format");
  const queryIds = new Set<string>();
  array(artifact.queries, "queries").forEach((input, index) => {
    const path = `queries[${index}]`;
    const query = object(input, path, ["id", "audience", "category", "query", "language", "locale"]);
    const queryId = id(query.id, `${path}.id`);
    if (queryIds.has(queryId)) fail(`${path}.id`, "duplicate query identifier");
    queryIds.add(queryId);
    if (!audiences.has(text(query.audience, `${path}.audience`, 100))) fail(`${path}.audience`, "unknown audience");
    text(query.category, `${path}.category`, 200);
    text(query.query, `${path}.query`, 4000);
    text(query.language, `${path}.language`, 40);
    text(query.locale, `${path}.locale`, 80);
  });

  const observationIds = new Set<string>();
  array(artifact.observations, "observations").forEach((input, index) => {
    const path = `observations[${index}]`;
    const observation = object(input, path, ["id", "queryId", "observedAt", "status", "model", "surface", "searchMode", "harnessVersion", "environmentType", "recommendations", "citations", "limitations"]);
    const observationId = id(observation.id, `${path}.id`);
    if (observationIds.has(observationId)) fail(`${path}.id`, "duplicate observation identifier");
    observationIds.add(observationId);
    if (!queryIds.has(id(observation.queryId, `${path}.queryId`))) fail(`${path}.queryId`, "query is not declared in this artifact");
    timestamp(observation.observedAt, `${path}.observedAt`);
    if (observation.status !== "completed") fail(`${path}.status`, "only completed observations may be published");
    if (observation.surface !== "openai-managed-agents") fail(`${path}.surface`, "expected the managed Agents surface");
    if (observation.searchMode !== "open-web") fail(`${path}.searchMode`, "expected open-web collection");
    text(observation.model, `${path}.model`, 200);
    text(observation.harnessVersion, `${path}.harnessVersion`, 200);
    text(observation.environmentType, `${path}.environmentType`, 100);
    array(observation.limitations, `${path}.limitations`).forEach((limitation, offset) => text(limitation, `${path}.limitations[${offset}]`, 4000));

    const citationUrls = new Set<string>();
    array(observation.citations, `${path}.citations`).forEach((input, offset) => {
      const citationPath = `${path}.citations[${offset}]`;
      const citation = object(input, citationPath, ["url"], ["title"]);
      citationUrls.add(safeUrl(citation.url, `${citationPath}.url`));
      if (Object.hasOwn(citation, "title") && citation.title !== null) text(citation.title, `${citationPath}.title`, 1000);
    });

    array(observation.recommendations, `${path}.recommendations`).forEach((input, offset) => {
      const recommendationPath = `${path}.recommendations[${offset}]`;
      const recommendation = object(input, recommendationPath, ["position", "name", "url", "citationUrls"], ["reason"]);
      if (!Number.isSafeInteger(recommendation.position) || recommendation.position !== offset + 1)
        fail(`${recommendationPath}.position`, "position must match its original one-based list order");
      text(recommendation.name, `${recommendationPath}.name`, 300);
      if (recommendation.url !== null) safeUrl(recommendation.url, `${recommendationPath}.url`);
      if (Object.hasOwn(recommendation, "reason")) text(recommendation.reason, `${recommendationPath}.reason`, 4000);
      array(recommendation.citationUrls, `${recommendationPath}.citationUrls`).forEach((url, citationIndex) => {
        const citationPath = `${recommendationPath}.citationUrls[${citationIndex}]`;
        if (!citationUrls.has(safeUrl(url, citationPath))) fail(citationPath, "citation is missing from this observation's citation list");
      });
    });
  });
}
