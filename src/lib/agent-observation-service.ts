import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError, requireAgentApiScope } from "./agent-api-key-store";
import { agentIdempotencyIdentity, assertAgentRequestDisposition, findSavedAgentObservation, getAgentObservationRequest,
  reserveAgentObservation, type AgentObservationRequest, type AgentObservationSelection } from "./agent-observation-store";
import type { AgentApiPrincipal, AgentObservation, AgentObservationInput, AgentObservationKind, AgentObservationRun } from "./agent-observation-types";
import { cancelEvaluationRun, managedRunAccess, reconcileEvaluationRun, startEvaluationRun, type AgentRunEnvironment } from "./agent-runs";
import { getEvaluationRun, prepareEvaluationRunReservation } from "./eval-store";
import { WEBSITE_EVAL_VERSION, type EvaluationRun } from "./evals";
import { cancelKeywordBenchmark, keywordBenchmarkAccess, keywordBenchmarkExecutionConfig, reconcileKeywordBenchmark,
  startKeywordBenchmark, type KeywordBenchmarkServiceOptions } from "./keyword-benchmark-service";
import { getKeywordBenchmarkRun, prepareKeywordBenchmarkReservation } from "./keyword-benchmark-store";
import { isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkCaseInput, type KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { normalizeScanUrl } from "./scanner";

export const AGENT_OBSERVATION_DEFAULT_MAX_AGE = 86_400;
export type AgentObservationOptions = Omit<KeywordBenchmarkServiceOptions, "reserve">;
export function validateAgentObservationInput(input: AgentObservationInput): AgentObservationInput & { maxAgeSeconds: number } {
  if (!input || typeof input !== "object" || Array.isArray(input) || !["website", "keyword"].includes(input.kind)) throw new AgentApiError("Choose a saved website or keyword case.");
  const field = input.kind === "website" ? "websiteId" : "caseId";
  if (Object.keys(input).some(key => !["kind", field, "maxAgeSeconds", ...(input.kind === "keyword" ? ["useSeoTools"] : [])].includes(key))) throw new AgentApiError("This request contains unsupported fields.");
  if (input.kind === "keyword" && input.useSeoTools !== undefined && typeof input.useSeoTools !== "boolean") throw new AgentApiError("useSeoTools must be boolean.");
  const id = input.kind === "website" ? input.websiteId : input.caseId;
  if (!isKeywordBenchmarkId(id)) throw new AgentApiError("Choose a valid saved target.");
  const maxAgeSeconds = input.maxAgeSeconds ?? AGENT_OBSERVATION_DEFAULT_MAX_AGE;
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0 || maxAgeSeconds > 604_800) throw new AgentApiError("maxAgeSeconds must be an integer from 0 to 604800.");
  return input.kind === "website" ? { kind: "website", websiteId: id, maxAgeSeconds } : { kind: "keyword", caseId: id, maxAgeSeconds, ...(input.kind === "keyword" && input.useSeoTools ? { useSeoTools: true } : {}) };
}
async function livePrincipal(db: D1Database, principal: AgentApiPrincipal, options: AgentObservationOptions = {}, seo = false) {
  requireAgentApiScope(principal, "evaluate");
  const found = await db.prepare(`SELECT id FROM agent_api_keys WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?
    AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE value='evaluate')
    AND (?=0 OR EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE value='seo'))`)
    .bind(principal.keyId, principal.ownerId, (options.now ?? new Date()).getTime(), seo ? 1 : 0).first();
  if (!found) throw new AgentApiError("This API key no longer permits evaluation actions.", 403, "insufficient_scope");
}
function paidAccess(env: AgentRunEnvironment, ownerId: string, kind: AgentObservationKind) {
  const access = kind === "website" ? managedRunAccess(env, ownerId) : keywordBenchmarkAccess(env, ownerId);
  if (!access.configured) throw new AgentApiError("The evaluation provider is not configured.", 503, "not_configured");
  if (!access.authorized) throw new AgentApiError("This account is not approved to spend evaluation credits.", 403, "account_not_approved");
}
export async function listAgentObservationTargets(db: D1Database, ownerId: string) {
  if (!ownerId) throw new AgentApiError("Authentication is required.", 401, "unauthorized");
  const [sites, cases] = await Promise.all([
    db.prepare("SELECT id,url,name FROM sites WHERE user_id=? ORDER BY created_at DESC,id LIMIT 100").bind(ownerId).all<{ id: string; url: string; name: string }>(),
    db.prepare("SELECT id,suite_id,case_json FROM keyword_benchmark_cases WHERE user_id=? ORDER BY created_at DESC,id LIMIT 1000").bind(ownerId).all<{ id: string; suite_id: string; case_json: string }>(),
  ]);
  return { websites: sites.results, cases: cases.results.map(row => { const value = JSON.parse(row.case_json) as KeywordBenchmarkCaseInput;
    return { id: row.id, suiteId: row.suite_id, query: value.query, targetUrl: value.targetUrl, language: value.language, locale: value.locale, searchMode: keywordSearchMode(value.searchMode) }; }) };
}
async function selectionFor(db: D1Database, ownerId: string, input: AgentObservationInput, env: AgentRunEnvironment, options: AgentObservationOptions) {
  if (!ownerId) throw new AgentApiError("Authentication is required.", 401, "unauthorized");
  if (input.kind === "website") {
    const site = await db.prepare("SELECT id,url,name FROM sites WHERE user_id=? AND id=?").bind(ownerId, input.websiteId).first<{ id: string; url: string; name: string }>();
    if (!site) throw new AgentApiError("The private website was not found.", 404, "not_found");
    const target = normalizeScanUrl(site.url).href, model = managedRunAccess(env, ownerId).model;
    const selection: AgentObservationSelection = { kind: input.kind, resourceId: site.id,
      matchingSql: `SELECT id,status,(SELECT MIN(json_extract(c.value,'$.capturedAt')) FROM json_each(result_json,'$.captures') c
        WHERE json_extract(c.value,'$.kind')='page') AS observed_at,
        CASE WHEN json_type(result_json,'$.result')='object' THEN 1 ELSE 0 END AS has_result
        FROM evaluation_runs WHERE user_id=? AND target_url=? AND mode='live' AND suite_version=? AND deleted_at IS NULL
          AND json_extract(result_json,'$.model')=? AND json_extract(result_json,'$.siteName')=?
          AND json_type(result_json,'$.expectedFacts') IS NULL
          AND NOT EXISTS(SELECT 1 FROM json_each(result_json,'$.captures') c WHERE json_extract(c.value,'$.kind')='seo-report')`,
      matchingValues: [ownerId, target, WEBSITE_EVAL_VERSION, model, site.name.trim()],
      resourceSql: "EXISTS(SELECT 1 FROM sites WHERE user_id=? AND id=? AND url=? AND name=?)", resourceValues: [ownerId, site.id, site.url, site.name] };
    return { selection, site, trial: null };
  }
  const row = await db.prepare("SELECT id,case_json FROM keyword_benchmark_cases WHERE user_id=? AND id=?").bind(ownerId, input.caseId).first<{ id: string; case_json: string }>();
  if (!row) throw new AgentApiError("The private keyword case was not found.", 404, "not_found");
  const trial = JSON.parse(row.case_json) as KeywordBenchmarkCaseInput, config = await keywordBenchmarkExecutionConfig(trial, env, { ...options, useSeoTools: input.kind === "keyword" && input.useSeoTools === true });
  const selection: AgentObservationSelection = { kind: input.kind, resourceId: row.id,
    matchingSql: `SELECT id,status,strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') AS observed_at,
      CASE WHEN answer_json IS NOT NULL THEN 1 ELSE 0 END AS has_result FROM keyword_benchmark_runs
      WHERE user_id=? AND case_id=? AND case_json=? AND model=? AND harness_version=? AND environment_type=? AND environment_fingerprint=?`,
    matchingValues: [ownerId, row.id, row.case_json, config.model, config.harnessVersion, config.environmentType, config.environmentFingerprint],
    resourceSql: "EXISTS(SELECT 1 FROM keyword_benchmark_cases WHERE user_id=? AND id=? AND case_json=?)", resourceValues: [ownerId, row.id, row.case_json] };
  return { selection, site: null, trial };
}
function observedAt(run: EvaluationRun | KeywordBenchmarkRun): string | null {
  if ("caseId" in run) return run.createdAt;
  const times = run.captures.filter(value => value.kind === "page").map(value => value.capturedAt);
  return times.length && times.every(value => Number.isFinite(Date.parse(value))) ? times.sort()[0] : null;
}
function project(run: EvaluationRun | KeywordBenchmarkRun): AgentObservationRun {
  const keyword = "caseId" in run;
  let result: AgentObservationRun["result"] = null;
  if (keyword && run.answer) {
    const { collection: _privateCollection, ...answer } = run.answer;
    result = answer;
  } else if (!keyword && run.result) result = { ...run.result, checks: run.result.checks.map(check =>
    run.expectedFacts && ["product-understanding", "pricing-extraction"].includes(check.id)
      ? { ...check, expected: "Private reference value omitted from this API response." } : check) };
  return { id: run.id, kind: keyword ? "keyword" : "website", status: run.status, model: run.model,
    surface: "openai-managed-agents", createdAt: run.createdAt, updatedAt: run.updatedAt, observedAt: observedAt(run),
    result, usage: run.usage, error: run.error ? "This evaluation needs attention. Inspect its saved task in Folio." : null,
    recovery: run.status === "requires_action" && run.sessionId ? { runId: run.id, sessionId: run.sessionId } : null,
    pollUrl: `/api/v1/runs/${keyword ? "keyword" : "website"}/${encodeURIComponent(run.id)}`,
    provenance: { searchMode: keyword ? keywordSearchMode(run.case.searchMode) : null,
      harnessVersion: keyword ? run.harnessVersion : run.suiteVersion,
      environmentFingerprint: keyword ? run.environmentFingerprint : null,
      environmentType: keyword ? run.environmentType : "none",
      allowedDomains: keyword ? run.allowedDomains : [],
      completedSearchCount: keyword && run.answer?.collection ? run.answer.collection.searchItems.filter(item => item.type === "web_search_call" && item.status === "completed" && item.turn_id === run.answer!.collection!.rootTurnId).length : null } };
}
function envelope(run: EvaluationRun | KeywordBenchmarkRun | null, maxAgeSeconds: number, disposition: AgentObservation["disposition"], options: AgentObservationOptions = {}): AgentObservation {
  const date = run ? observedAt(run) : null, now = (options.now ?? new Date()).getTime();
  const age = date === null ? null : (now - Date.parse(date)) / 1000;
  return { disposition, freshness: { maxAgeSeconds, observedAt: date, ageSeconds: age !== null && Number.isFinite(age) ? Math.max(0, age) : null,
    fresh: Boolean(run?.status === "completed" && ("caseId" in run ? run.answer : run.result) && age !== null && age >= 0 && age <= maxAgeSeconds && maxAgeSeconds > 0) }, run: run ? project(run) : null };
}
async function ownedRun(db: D1Database, ownerId: string, kind: AgentObservationKind, id: string) {
  if (!ownerId || !isKeywordBenchmarkId(id) || !["keyword", "website"].includes(kind)) throw new AgentApiError("Invalid private run.", 404, "not_found");
  const run = kind === "keyword" ? await getKeywordBenchmarkRun(db, ownerId, id) : await getEvaluationRun(db, ownerId, id);
  if (!run || ("mode" in run && run.mode !== "live")) throw new AgentApiError("The private observation was not found.", 404, "not_found");
  return run;
}
export async function getAgentObservation(db: D1Database, ownerId: string, request: AgentObservationInput, env: AgentRunEnvironment, options: AgentObservationOptions = {}) {
  const input = validateAgentObservationInput(request), { selection, site } = await selectionFor(db, ownerId, input, env, options);
  const saved = await findSavedAgentObservation(db, selection), run = saved ? await ownedRun(db, ownerId, input.kind, saved.id) : null;
  // Historical discovery is separate from the strict selection used by paid reuse.
  const historySql = input.kind === "keyword"
    ? "SELECT id,status FROM keyword_benchmark_runs WHERE user_id=? AND case_id=?"
    : "SELECT id,status FROM evaluation_runs WHERE user_id=? AND target_url=? AND mode='live' AND deleted_at IS NULL";
  const values = input.kind === "keyword" ? [ownerId, input.caseId] : [ownerId, normalizeScanUrl(site!.url).href];
  const latest = await db.prepare(`${historySql} AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 1`).bind(...values).first<{id:string}>();
  const attempt = await db.prepare(`${historySql} AND status IN ('queued','running','requires_action') ORDER BY created_at DESC,id DESC LIMIT 1`).bind(...values).first<{id:string}>();
  const latestAttemptRow = await db.prepare(`${historySql} ORDER BY created_at DESC,id DESC LIMIT 1`).bind(...values).first<{id:string}>();
  const latestAttempt = latestAttemptRow ? await ownedRun(db, ownerId, input.kind, latestAttemptRow.id) : null;
  const historical = latest ? await ownedRun(db, ownerId, input.kind, latest.id) : null;
  const compatibleIds = historical ? await db.prepare(`SELECT id FROM (${selection.matchingSql}) WHERE id=?`).bind(...selection.matchingValues, historical.id).first() : null;
  const mismatchReasons:string[]=[];
  if(historical&&!compatibleIds){
    if("caseId" in historical){
      const fields=["owner","case identity","question inputs","model","harness version","environment type","environment fingerprint"];
      const actual=[ownerId,historical.caseId,JSON.stringify(historical.case),historical.model,historical.harnessVersion,historical.environmentType,historical.environmentFingerprint];
      selection.matchingValues.forEach((value,i)=>{if(value!==actual[i])mismatchReasons.push(fields[i]);});
    }else mismatchReasons.push("Website inputs, model, rubric, reference answers or selected SEO evidence differ from current reuse configuration");
  }
  const response = envelope(run, input.maxAgeSeconds, run ? "saved" : "missing", options);
  return { ...response, selectionMeaning: "run is the latest completed observation compatible with the current configuration; historical evidence is separate",
    latestCompletedRun: historical ? project(historical) : null, compatibleRun: response.run,
    latestAttempt: latestAttempt ? project(latestAttempt) : null,
    currentAttempt: attempt ? project(await ownedRun(db, ownerId, input.kind, attempt.id)) : null,
    historyState: historical ? !compatibleIds ? "incompatible_history" : response.freshness.fresh ? "fresh" : "stale" : attempt ? "incomplete_attempt" : latestAttempt ? "terminal_attempt" : "no_history",
    compatibility: { latestCompletedMatchesCurrent: historical ? Boolean(compatibleIds) : null,
      mismatchReasons } };

}
export async function getAgentObservationRun(db: D1Database, ownerId: string, kind: AgentObservationKind, id: string, maxAgeSeconds = AGENT_OBSERVATION_DEFAULT_MAX_AGE, options: AgentObservationOptions = {}) {
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < 0 || maxAgeSeconds > 604_800) throw new AgentApiError("Invalid maxAgeSeconds.");
  return envelope(await ownedRun(db, ownerId, kind, id), maxAgeSeconds, "saved", options);
}
export async function ensureAgentObservation(db: D1Database, principal: AgentApiPrincipal, request: AgentObservationInput,
  idempotencyKey: string, env: AgentRunEnvironment, options: AgentObservationOptions = {}): Promise<AgentObservation> {
  const input = validateAgentObservationInput(request); await livePrincipal(db, principal, options, input.kind === "keyword" && input.useSeoTools === true);
  if (input.kind === "keyword" && input.useSeoTools) requireAgentApiScope(principal, "seo");
  const identity = await agentIdempotencyIdentity(idempotencyKey, input);
  const existing = await getAgentObservationRequest(db, principal.ownerId, identity);
  if (existing) {
    assertAgentRequestDisposition(existing);
    return envelope(await ownedRun(db, principal.ownerId, existing.resource_kind, existing.run_id), input.maxAgeSeconds, "saved", options);
  }
  const { selection, site } = await selectionFor(db, principal.ownerId, input, env, options);
  paidAccess(env, principal.ownerId, input.kind);
  let receipt: AgentObservationRequest | null = null;
  let run: EvaluationRun | KeywordBenchmarkRun;
  if (input.kind === "website") {
    run = await startEvaluationRun(db, principal.ownerId, { mode: "managed", domain: site!.url, brand: site!.name }, env, {
      reserve: async (candidate, limit) => {
        const reservation = await reserveAgentObservation(db, principal, identity, selection, candidate.id, input.maxAgeSeconds,
          guard => prepareEvaluationRunReservation(db, principal.ownerId, candidate, { maxLivePerDay: limit, guard }), options);
        receipt = reservation.request;
        return { run: await ownedRun(db, principal.ownerId, "website", reservation.request.run_id) as EvaluationRun, created: reservation.created };
      },
    });
  } else {
    run = await startKeywordBenchmark(db, principal.ownerId, { caseId: input.caseId, kind: "baseline" }, env, { ...options, useSeoTools: input.useSeoTools === true,
      reserve: async (candidate, limits) => {
        const id = crypto.randomUUID();
        const reservation = await reserveAgentObservation(db, principal, identity, selection, id, input.maxAgeSeconds,
          guard => prepareKeywordBenchmarkReservation(db, principal.ownerId, candidate, { ...limits, now: options.now, id, guard }).statement, options);
        receipt = reservation.request;
        return { run: await ownedRun(db, principal.ownerId, "keyword", reservation.request.run_id) as KeywordBenchmarkRun, created: reservation.created };
      },
    });
  }
  const disposition = (receipt as AgentObservationRequest | null)?.disposition;
  return envelope(run, input.maxAgeSeconds, disposition === "fresh_saved" || disposition === "existing_active" || disposition === "started" ? disposition : "saved", options);
}
export async function reconcileAgentObservation(db: D1Database, principal: AgentApiPrincipal, kind: AgentObservationKind, id: string, env: AgentRunEnvironment, options: AgentObservationOptions = {}) {
  await livePrincipal(db, principal, options); await ownedRun(db, principal.ownerId, kind, id); paidAccess(env, principal.ownerId, kind);
  const run = kind === "keyword" ? await reconcileKeywordBenchmark(db, principal.ownerId, id, env, options) : await reconcileEvaluationRun(db, principal.ownerId, id, env);
  return envelope(run, AGENT_OBSERVATION_DEFAULT_MAX_AGE, "saved", options);
}
export async function cancelAgentObservation(db: D1Database, principal: AgentApiPrincipal, kind: AgentObservationKind, id: string, env: AgentRunEnvironment, options: AgentObservationOptions = {}) {
  await livePrincipal(db, principal, options); await ownedRun(db, principal.ownerId, kind, id); paidAccess(env, principal.ownerId, kind);
  const run = kind === "keyword" ? await cancelKeywordBenchmark(db, principal.ownerId, id, env, options) : await cancelEvaluationRun(db, principal.ownerId, id, env);
  return envelope(run, AGENT_OBSERVATION_DEFAULT_MAX_AGE, "saved", options);
}
