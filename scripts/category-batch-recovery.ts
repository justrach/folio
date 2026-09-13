import type { D1Database } from "@cloudflare/workers-types";
import type { AgentsEnvironment } from "../src/lib/agents";
import { reconcileKeywordBenchmarkSession, type KeywordAgentOptions } from "../src/lib/keyword-benchmark-agent";
import { getKeywordBenchmarkRun, updateKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { keywordSearchMode, type KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Metadata is checked against the frozen reservation, never question text or list order. */
export function matchesCategoryReceipt(run: KeywordBenchmarkRun, candidate: unknown): boolean {
  const session = object(candidate), metadata = object(session.metadata), agent = object(session.agent);
  const environment = object(session.environment), network = object(environment.network);
  const domains = network.allowed_domains;
  const networkMatches = keywordSearchMode(run.case.searchMode) === "open-web"
    ? network.access === "disabled" && (domains == null || (Array.isArray(domains) && domains.length === 0))
    : network.access === "restricted" && Array.isArray(domains) && domains.every(domain => typeof domain === "string")
      && JSON.stringify([...new Set(domains)].sort()) === JSON.stringify([...new Set(run.allowedDomains)].sort());
  return typeof session.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(session.id)
    && metadata.run_id === run.id && metadata.case_id === run.caseId && metadata.harness_version === run.harnessVersion
    && agent.model === run.model && environment.type === run.environmentType && networkMatches;
}

/** Attach one independently recovered receipt using GETs only. Never release a hold or retry a create. */
export async function recoverCategoryReceipt(db: D1Database, ownerId: string, runId: string,
  candidates: unknown[], env: AgentsEnvironment, options: KeywordAgentOptions = {}) {
  const run = await getKeywordBenchmarkRun(db, ownerId, runId);
  if (!run) throw new KeywordBenchmarkStoreError("The owned recovery record was not found.", 404);
  // Count all matching identities before validating configuration: a conflicting second receipt is ambiguous.
  const identities = candidates.filter(candidate => {
    const metadata = object(object(candidate).metadata);
    return metadata.run_id === run.id && metadata.case_id === run.caseId;
  });
  if (identities.length !== 1 || !matchesCategoryReceipt(run, identities[0]))
    throw new KeywordBenchmarkStoreError("Recovery needs exactly one matching provider receipt and frozen configuration.", 409);
  const sessionId = object(identities[0]).id as string;
  if (run.sessionId) {
    if (run.sessionId === sessionId) return run;
    throw new KeywordBenchmarkStoreError("A different receipt is already saved.", 409);
  }
  if (run.status !== "requires_action" || !run.createAttemptAt || run.answer)
    throw new KeywordBenchmarkStoreError("This record is not an unconfirmed creation.", 409);
  const fetcher: typeof fetch = async (url, init) => {
    if (init?.method !== "GET") throw new Error("Receipt recovery permits provider GET requests only.");
    const response = await (options.fetcher ?? fetch)(url, init);
    if (new URL(String(url)).pathname.endsWith(`/sessions/${sessionId}`) && response.ok
      && !matchesCategoryReceipt(run, await response.clone().json()))
      throw new KeywordBenchmarkStoreError("The retrieved receipt differs from the frozen reservation.", 409);
    return response;
  };
  const observation = await reconcileKeywordBenchmarkSession(sessionId, env, {
    ...options, fetcher, expectedSearchMode: run.case.searchMode, expectedAllowedDomains: run.allowedDomains,
  });
  const terminal = ["completed", "failed", "cancelled"].includes(observation.status);
  return updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, {
    sessionId, status: terminal ? observation.status : "requires_action", answer: observation.answer,
    usage: observation.usage, providerMetadata: observation.providerMetadata,
    error: terminal ? observation.error : "The missing receipt was recovered; its final provider outcome is still unresolved.",
  });
}
