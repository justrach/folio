import type { D1Database } from "@cloudflare/workers-types";
import type { AgentsEnvironment } from "../src/lib/agents";
import { reconcileKeywordBenchmarkSession, type KeywordAgentOptions } from "../src/lib/keyword-benchmark-agent";
import { getKeywordBenchmarkRun, updateKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { keywordSearchMode, type KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Bounded, read-only discovery. Incomplete pagination cannot establish a unique receipt. */
export async function findCategoryReceipts(runs: ReadonlyArray<Pick<KeywordBenchmarkRun, "id" | "caseId">>, env: AgentsEnvironment,
  options: KeywordAgentOptions & { maxPages?: number; timeoutMs?: number } = {}) {
  const maxPages = options.maxPages ?? 40, timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 40 || timeoutMs < 1 || timeoutMs > 30_000) throw Error("Invalid receipt discovery bound.");
  const wanted = new Map(runs.map(run => [run.id, run.caseId]));
  if (!wanted.size) return { complete: true, checked: 0, candidates: [] as unknown[] };
  const deadline = Date.now() + timeoutMs, candidates: unknown[] = [], seen = new Set<string>();
  let checked = 0, after: string | null = null;
  try {
    for (let page = 0; page < maxPages; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const response = await (options.fetcher ?? fetch)(`https://api.openai.com/v1/agents/sessions?limit=100&order=desc${after ? `&after=${encodeURIComponent(after)}` : ""}`, {
        method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(remaining),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "OpenAI-Beta": "agents=v1" },
      });
      if (!response.ok) { await response.body?.cancel(); break; }
      const body = object(await response.json());
      if (!Array.isArray(body.data) || body.data.length > 100 || typeof body.has_more !== "boolean") break;
      checked += body.data.length;
      for (const candidate of body.data) {
        const metadata = object(object(candidate).metadata);
        if (typeof metadata.run_id === "string" && wanted.has(metadata.run_id) && wanted.get(metadata.run_id) === metadata.case_id) candidates.push(candidate);
      }
      if (!body.has_more) return { complete: true, checked, candidates };
      if (typeof body.last_id !== "string" || !body.last_id || seen.has(body.last_id)) break;
      seen.add(body.last_id); after = body.last_id;
    }
  } catch { /* A failed read changes no receipt and grants no retry authority. */ }
  return { complete: false, checked, candidates: [] as unknown[] };
}
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
