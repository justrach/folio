import "server-only";
import { sandboxSeoUrl, createSandboxSeoGrant } from "./sandbox-seo";
import { agentApiHash } from "./agent-api-key-store";
import type { D1Database } from "@cloudflare/workers-types";
import { getAgentsConnectionStatus, isAgentDailyLimitExempt, type AgentsEnvironment } from "./agents";
import { KEYWORD_BENCHMARK_ALLOWED_DOMAINS, ALL_KEYWORD_BENCHMARK_TEMPLATES } from "./keyword-benchmark-catalog";
import { buildKeywordBenchmarkRequest, cancelKeywordBenchmarkSession, createKeywordBenchmarkSession,
  KEYWORD_AGENT_DEADLINE_MS, KEYWORD_OPEN_WEB_MODEL, keywordAgentHarnessVersion, KeywordAgentError, keywordAllowedDomains,
  keywordEnvironmentFingerprint, reconcileKeywordBenchmarkSession, type KeywordAgentOptions } from "./keyword-benchmark-agent";
import { acknowledgeKeywordBenchmarkCancellation, createKeywordBenchmarkSuite, getKeywordBenchmarkRun,
  getKeywordBenchmarkSuite, getKeywordBenchmarkUsage, KeywordBenchmarkStoreError, listKeywordBenchmarkRuns,
  listKeywordBenchmarkSuites, markKeywordBenchmarkCreateAttempt, reserveKeywordBenchmarkCancellation,
  reserveKeywordBenchmarkRun, updateKeywordBenchmarkRun, type KeywordBenchmarkRunPatch } from "./keyword-benchmark-store";
import { isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkCaseInput, type KeywordBenchmarkRun } from "./keyword-benchmark-types";

import { KEYWORD_OPEN_WEB_MODELS, isKeywordOpenWebModel } from "./keyword-models";

export const KEYWORD_BENCHMARK_LIMITS = { maxRunsPerDay: 6, maxActiveRuns: 1 } as const;
export type KeywordBenchmarkServiceOptions = KeywordAgentOptions & { useSeoTools?: boolean; now?: Date; allowedDomains?: string[];
  reserve?: (input: Parameters<typeof reserveKeywordBenchmarkRun>[2], limits: { maxRunsPerDay: number | null; maxActiveRuns: number }) => Promise<{ run: KeywordBenchmarkRun; created: boolean }> };
const terminal = (run: KeywordBenchmarkRun) => ["completed", "failed", "cancelled"].includes(run.status);
export class KeywordBenchmarkPersistenceError extends Error {
  constructor(public readonly run: KeywordBenchmarkRun) {
    super("The benchmark outcome could not be saved. Keep the private recovery details and retrieve the same run; do not start a replacement.");
    this.name = "KeywordBenchmarkPersistenceError";
  }
}
export function keywordBenchmarkAccess(env: AgentsEnvironment, ownerId: string) {
  const connection = getAgentsConnectionStatus(env);
  const authorized = Boolean(ownerId) && (env.OPENAI_ALLOWED_USER_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean).includes(ownerId);
  return { configured: connection.configured, authorized, canRun: connection.configured && authorized, model: connection.model, openWebModels: KEYWORD_OPEN_WEB_MODELS,
    ...KEYWORD_BENCHMARK_LIMITS, maxRunsPerDay: authorized && isAgentDailyLimitExempt(env, ownerId) ? null : KEYWORD_BENCHMARK_LIMITS.maxRunsPerDay, deadlineMs: KEYWORD_AGENT_DEADLINE_MS,
    message: !connection.configured ? "Connect the evaluation provider before starting a benchmark."
      : !authorized ? "This account needs approval before it can spend evaluation credits."
        : isAgentDailyLimitExempt(env, ownerId) ? "Each explicit start uses evaluation credits. This account has no daily cap; one active benchmark and the task deadline still apply."
          : "Each explicit start uses evaluation credits. Six starts per day and one active benchmark are allowed; the task deadline is not a guaranteed spending cap." };
}
function requireAccess(env: AgentsEnvironment, ownerId: string) {
  const access = keywordBenchmarkAccess(env, ownerId);
  if (!access.configured) throw new KeywordBenchmarkStoreError("Connect the evaluation provider before continuing.", 503);
  if (!access.authorized) throw new KeywordBenchmarkStoreError("This account is not approved to spend evaluation credits.", 403);
  return access;
}
async function ownedRun(db: D1Database, ownerId: string, id: string) {
  const run = await getKeywordBenchmarkRun(db, ownerId, id);
  if (!run) throw new KeywordBenchmarkStoreError("The private benchmark was not found.", 404);
  return run;
}
export async function keywordBenchmarkOverview(db: D1Database, ownerId: string, env: AgentsEnvironment) {
  const access = keywordBenchmarkAccess(env, ownerId);
  const [suites, usage] = await Promise.all([listKeywordBenchmarkSuites(db, ownerId), getKeywordBenchmarkUsage(db, ownerId, access)]);
  return { suites, usage, access, templates: ALL_KEYWORD_BENCHMARK_TEMPLATES };
}
/** A template is saved against an already owned website; it never creates or publishes a site. */
export async function seedKeywordBenchmark(db: D1Database, ownerId: string, input: { templateId: string; websiteId?: string }) {
  const template = ALL_KEYWORD_BENCHMARK_TEMPLATES.find(value => value.id === input.templateId);
  if (!template) throw new KeywordBenchmarkStoreError("Choose a reviewed benchmark template.", 400);
  const target = template.cases.find(value => value.targetUrl)?.targetUrl;
  let savedUrl: string | null = null;
  if (input.websiteId) {
    if (!isKeywordBenchmarkId(input.websiteId)) throw new KeywordBenchmarkStoreError("Invalid saved website.", 400);
    const row = await db.prepare("SELECT url FROM sites WHERE user_id=? AND id=?").bind(ownerId, input.websiteId).first<{ url: string }>();
    if (!row) throw new KeywordBenchmarkStoreError("Choose a website saved in your account.", 404);
    savedUrl = row.url;
  } else if (target) {
    const candidates = await db.prepare("SELECT url FROM sites WHERE user_id=?").bind(ownerId).all<{ url: string }>();
    savedUrl = candidates.results.find(row => new URL(row.url).href.replace(/\/$/, "") === new URL(target).href.replace(/\/$/, ""))?.url ?? null;
    if (!savedUrl) throw new KeywordBenchmarkStoreError("Save or select your existing website before creating this benchmark.", 409);
  }
  if (savedUrl && template.cases.some(value => keywordSearchMode(value.searchMode) !== "open-web") && !keywordAllowedDomains([...KEYWORD_BENCHMARK_ALLOWED_DOMAINS]).includes(new URL(savedUrl).hostname))
    throw new KeywordBenchmarkStoreError("This website is outside the reviewed research corpus.", 400);
  return createKeywordBenchmarkSuite(db, ownerId, { name: template.name, description: template.description,
    cases: template.cases.map(value => ({ ...structuredClone(value), targetUrl: savedUrl ?? value.targetUrl })) });
}
async function persistReceipt(db: D1Database, ownerId: string, run: KeywordBenchmarkRun, patch: KeywordBenchmarkRunPatch) {
  try { return await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, patch); }
  catch {
    try {
      const latest = await ownedRun(db, ownerId, run.id);
      if (terminal(latest)) return latest;
      if (patch.sessionId && latest.sessionId && patch.sessionId !== latest.sessionId) throw new Error("Conflicting receipt");
      return await updateKeywordBenchmarkRun(db, ownerId, latest.id, latest.revision, patch);
    } catch {
      throw new KeywordBenchmarkPersistenceError({ ...run, ...patch, status: "requires_action",
        error: "The provider receipt could not be saved. Keep this private session ID; do not start a replacement." });
    }
  }
}
export async function keywordBenchmarkExecutionConfig(trial: KeywordBenchmarkCaseInput, env: AgentsEnvironment, options: KeywordBenchmarkServiceOptions = {}, selectedModel?: string) {
  const searchMode = keywordSearchMode(trial.searchMode);
  if (selectedModel !== undefined && (searchMode !== "open-web" || !isKeywordOpenWebModel(selectedModel)))
    throw new KeywordBenchmarkStoreError("Choose a supported model for an open-web question.", 400);
  if (options.useSeoTools) {
    if (selectedModel && selectedModel !== KEYWORD_OPEN_WEB_MODEL) throw new KeywordBenchmarkStoreError("SEO-assisted observations currently support Astra only.", 400);
    if (searchMode !== "open-web") throw new KeywordBenchmarkStoreError("SEO tools require an open-web question.", 400);

  }
  const allowedDomains = searchMode === "open-web" ? [] : keywordAllowedDomains(options.allowedDomains ?? [...KEYWORD_BENCHMARK_ALLOWED_DOMAINS]);
  return { searchMode, allowedDomains, model: searchMode === "open-web" ? selectedModel ?? KEYWORD_OPEN_WEB_MODEL : getAgentsConnectionStatus(env).model, harnessVersion: keywordAgentHarnessVersion(searchMode, options.useSeoTools),
    environmentType: "openai_hosted", environmentFingerprint: options.useSeoTools ? await agentApiHash((await keywordEnvironmentFingerprint(allowedDomains, searchMode)) + ":sandbox-seo-v1") : await keywordEnvironmentFingerprint(allowedDomains, searchMode), deadlineMs: KEYWORD_AGENT_DEADLINE_MS };
}
/** Paid start: validate before reserving, then commit the one-attempt marker before one provider POST. */
export async function startKeywordBenchmark(db: D1Database, ownerId: string,
  input: { caseId: string; kind: "baseline" | "fresh"; baselineRunId?: string; model?: string }, env: AgentsEnvironment, options: KeywordBenchmarkServiceOptions = {}): Promise<KeywordBenchmarkRun> {
  const access = requireAccess(env, ownerId);
  if (!isKeywordBenchmarkId(input.caseId)) throw new KeywordBenchmarkStoreError("Choose a valid benchmark case.", 400);
  const row = await db.prepare("SELECT suite_id FROM keyword_benchmark_cases WHERE user_id=? AND id=?").bind(ownerId, input.caseId).first<{ suite_id: string }>();
  if (!row) throw new KeywordBenchmarkStoreError("The private benchmark case was not found.", 404);
  const suite = await getKeywordBenchmarkSuite(db, ownerId, row.suite_id);
  const trial = suite?.cases.find(value => value.id === input.caseId);
  if (!trial) throw new KeywordBenchmarkStoreError("The private benchmark case was not found.", 404);
  if (options.useSeoTools) sandboxSeoUrl(env, ownerId, trial.targetUrl);
  const config = await keywordBenchmarkExecutionConfig(trial, env, options, input.model);
  const providerInput = { runId: "preflight", caseId: trial.id, query: trial.query, language: trial.language, locale: trial.locale,
    model: config.model, allowedDomains: config.allowedDomains, searchMode: config.searchMode };
  buildKeywordBenchmarkRequest(providerInput);
  const reservationInput = { ...input, ...config };
  const reservation = options.reserve ? await options.reserve(reservationInput, access) : null;
  if (reservation && !reservation.created) return reservation.run;
  let run = reservation?.run ?? await reserveKeywordBenchmarkRun(db, ownerId, reservationInput,
    { maxRunsPerDay: access.maxRunsPerDay, maxActiveRuns: access.maxActiveRuns, now: options.now });
  // Re-project from the atomic frozen snapshot in case its source case changed during preflight.
  const frozenInput: typeof providerInput & { seoMcp?: { url: string; authorization: string } } = { ...providerInput, runId: run.id, query: run.case.query, language: run.case.language, locale: run.case.locale,
    searchMode: keywordSearchMode(run.case.searchMode) };
  try {
    if (frozenInput.searchMode !== config.searchMode) throw new Error("The case search mode changed during reservation.");
    if (options.useSeoTools) frozenInput.seoMcp = await createSandboxSeoGrant(db, ownerId, run, env);
    buildKeywordBenchmarkRequest(frozenInput);
  }
  catch { return updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, { status: "failed", error: "The benchmark case is not valid for this evaluator." }); }
  run = await markKeywordBenchmarkCreateAttempt(db, ownerId, run.id, run.revision);
  try {
    const receipt = await createKeywordBenchmarkSession(frozenInput, env, options);
    return persistReceipt(db, ownerId, run, { sessionId: receipt.sessionId, providerMetadata: receipt.providerMetadata, usage: receipt.usage,
      status: receipt.status === "failed" ? "failed" : receipt.status === "requires_action" ? "requires_action" : "running",
      error: receipt.status === "failed" ? "The provider session failed." : receipt.status === "requires_action" ? "The provider session requires attention." : null });
  } catch (error) {
    if (error instanceof KeywordBenchmarkPersistenceError) throw error;
    const known = error instanceof KeywordAgentError;
    const rejected = known && !error.ambiguous && !error.sessionId;
    return persistReceipt(db, ownerId, run, { status: rejected ? "failed" : "requires_action",
      sessionId: known ? error.sessionId : null, providerMetadata: {
        ...run.providerMetadata, requestId: known ? error.requestId : null,
        ...(known ? { creationErrorCode: error.code } : {}),
        ...(known && error.status !== undefined ? { creationHttpStatus: error.status } : {}),
      },
      error: rejected ? "Session creation was rejected before a session receipt was confirmed."
        : "Session creation could not be confirmed. Do not retry; provider cost is unknown." });
  }
}
/** Explicit cancel or deadline action: a durable claim precedes the sole cancel POST. */
export async function cancelKeywordBenchmark(db: D1Database, ownerId: string, id: string, env: AgentsEnvironment, options: KeywordBenchmarkServiceOptions = {}): Promise<KeywordBenchmarkRun> {
  requireAccess(env, ownerId);
  let run = await ownedRun(db, ownerId, id);
  if (terminal(run) || run.cancelAttemptAt) return run;
  if (!run.sessionId) throw new KeywordBenchmarkStoreError("This reservation has no confirmed session ID. Creation may be unresolved; do not start a replacement.", 409);
  try { run = await reserveKeywordBenchmarkCancellation(db, ownerId, run.id, run.revision); }
  catch (error) { if (error instanceof KeywordBenchmarkStoreError) return ownedRun(db, ownerId, id); throw error; }
  try {
    await cancelKeywordBenchmarkSession(run.sessionId!, env, options);
    try { return await acknowledgeKeywordBenchmarkCancellation(db, ownerId, run.id, run.revision); }
    catch { return ownedRun(db, ownerId, id); }
  } catch {
    try { return await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, { status: "requires_action", error: "Cancellation could not be confirmed. Retrieve the saved session; cancellation will not be submitted again automatically." }); }
    catch { return ownedRun(db, ownerId, id); }
  }
}
/** This POST-driven operation retrieves one existing session; GET routes never call it. */
export async function reconcileKeywordBenchmark(db: D1Database, ownerId: string, id: string, env: AgentsEnvironment, options: KeywordBenchmarkServiceOptions = {}): Promise<KeywordBenchmarkRun> {
  requireAccess(env, ownerId);
  let run = await ownedRun(db, ownerId, id);
  let initialInputUnconfirmed = false;
  if (terminal(run) || !run.sessionId) return run;
  try {
    const observation = await reconcileKeywordBenchmarkSession(run.sessionId!, env, { ...options, expectedAllowedDomains: run.allowedDomains, expectedSearchMode: keywordSearchMode(run.case.searchMode) });
    initialInputUnconfirmed = Boolean(observation.initialInputUnconfirmed);
    const pendingCancel = run.cancelAttemptAt && ["queued", "running", "requires_action"].includes(observation.status);
    run = await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, {
      status: pendingCancel ? "requires_action" : observation.status, answer: observation.answer, usage: observation.usage,
      providerMetadata: observation.providerMetadata,
      error: pendingCancel ? "Cancellation was requested. The final provider outcome is not yet confirmed."
        : observation.status === "failed" ? "The completed provider answer could not be validated."
          : observation.initialInputUnconfirmed ? observation.error
            : observation.status === "requires_action" ? "The provider session requires attention." : null,
    });
  } catch (error) {
    // A simultaneous retriever may have already committed newer or terminal state.
    if (error instanceof KeywordBenchmarkStoreError) run = await ownedRun(db, ownerId, id);
    else {
      try { run = await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, { error: "The provider session could not be retrieved. Try retrieving this saved session again." }); }
      catch { run = await ownedRun(db, ownerId, id); }
    }
  }
  // A saved deadline cannot tell us whether remote work already finished. Retrieve first.
  if (!initialInputUnconfirmed && !terminal(run) && run.deadlineAt && (options.now ?? new Date()).getTime() >= Date.parse(run.deadlineAt) && !run.cancelAttemptAt)
    return cancelKeywordBenchmark(db, ownerId, id, env, options);
  return run;
}
export { getKeywordBenchmarkRun, getKeywordBenchmarkSuite, listKeywordBenchmarkRuns };
export { previewKeywordBenchmarkHoldRelease, releaseKeywordBenchmarkHold } from "./keyword-benchmark-store";
