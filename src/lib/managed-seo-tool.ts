import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getAgentSession, getAgentSessionTurns, getAgentsConnectionStatus,
  SAVED_SEO_TOOL_NAME, submitAgentToolResult,
  type AgentSession, type AgentTurn, type AgentsEnvironment,
} from "./agents";
import { getEvaluationRun, updateEvaluationRun } from "./eval-store";
import { sha256Source } from "./eval-verifier";
import type { EvaluationEvent, EvaluationRun } from "./evals";
import { normalizeSeoDomain } from "./dataforseo";
import { ScanError } from "./scanner";

export type SavedSeoAction = { turnId: string; callId: string };
const identifier = /^[A-Za-z0-9_-]{1,128}$/;
const terminal = new Set(["completed", "failed", "cancelled"]);
const cancellationRequested = (run: EvaluationRun) => run.events.some(event => event.title === "Cancellation requested");

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** History items are not pending-action authority. Only a fresh session is. */
export function pendingSavedSeoAction(session: AgentSession, turns: AgentTurn[]): SavedSeoAction | null {
  if (session.status !== "requires_action" || session.required_actions.length !== 1) return null;
  // Folio submits one root input. Any other root turn is outside this contract.
  const roots = turns.filter(turn => !turn.subagent_id);
  if (roots.length !== 1 || !["waiting", "in_progress"].includes(roots[0].status) || roots[0].session_id !== session.id) return null;
  const action = session.required_actions[0];
  if (!isRecord(action) || action.type !== "function_call" || action.name !== SAVED_SEO_TOOL_NAME ||
    action.turn_id !== roots[0].id || typeof action.turn_id !== "string" || !identifier.test(action.turn_id) ||
    typeof action.call_id !== "string" || !identifier.test(action.call_id) ||
    !isRecord(action.arguments) || Object.keys(action.arguments).length !== 0) return null;
  return { turnId: action.turn_id, callId: action.call_id };
}

/** The snapshot was authorized and frozen at launch; this never queries a report ID or provider. */
export async function frozenSavedSeoResult(run: EvaluationRun): Promise<Record<string, unknown>> {
  const captures = run.captures.filter(capture => capture.kind === "seo-report");
  if (captures.length !== 1) throw new ScanError("This evaluation has no single selected SEO report.", 409);
  const capture = captures[0];
  if (capture.content.length > 30_000 || await sha256Source(capture.content) !== capture.sha256)
    throw new ScanError("The frozen SEO report failed its content integrity check.", 409);
  let report: unknown;
  try { report = JSON.parse(capture.content); } catch { throw new ScanError("The frozen SEO report is unreadable.", 409); }
  if (!isRecord(report) || typeof report.id !== "string" || !identifier.test(report.id) ||
    capture.id !== `seo-report:${report.id}` || report.publication !== "private" ||
    report.state !== "complete" || !isRecord(report.result) || report.result.provider !== "DataForSEO" ||
    typeof report.domain !== "string" || report.result.domain !== report.domain ||
    typeof report.retrievedAt !== "string" || report.retrievedAt !== capture.capturedAt ||
    !Number.isFinite(Date.parse(report.retrievedAt)) ||
    normalizeSeoDomain(report.domain) !== normalizeSeoDomain(run.targetUrl) ||
    normalizeSeoDomain(capture.url) !== normalizeSeoDomain(run.targetUrl))
    throw new ScanError("The selected private SEO report does not match this website evaluation.", 409);
  return {
    tool: SAVED_SEO_TOOL_NAME, publication: "private", evidenceId: capture.id,
    sourceHashSha256: capture.sha256, capturedAt: capture.capturedAt,
    content: capture.content, providerLookupPerformed: false, additionalSeoCostUsd: 0,
    note: "Previously saved SEO observations. No new DataForSEO request was made. Returning this evidence can use OpenAI credits.",
  };
}

async function readAllTurns(sessionId: string, env: AgentsEnvironment) {
  const turns: AgentTurn[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const next = await getAgentSessionTurns(sessionId, { after }, env);
    turns.push(...next.data);
    if (!next.has_more) return turns;
    if (!next.last_id || next.last_id === after) break;
    after = next.last_id;
  }
  throw new ScanError("The saved session's turn history could not be validated.", 409);
}

async function appendToolEvent(
  db: D1Database, ownerId: string, id: string, entry: EvaluationEvent,
  state: "reserved" | "submitted" | "uncertain",
) {
  // Polling may update the revision while the provider accepts a result. Merge
  // only this application event; never overwrite a terminal provider outcome.
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await getEvaluationRun(db, ownerId, id);
    if (!latest) throw new ScanError("Evaluation not found.", 404);
    const next = { ...latest, updatedAt: new Date().toISOString(),
      events: [...latest.events.filter(event => event.id !== entry.id), entry] };
    if (!terminal.has(latest.status)) {
      next.status = state === "submitted" ? "running" : "requires_action";
      next.error = state === "uncertain" ? "Returning the saved SEO evidence could not be confirmed. Refresh this session; Folio will not send the result again." : null;
    }
    try { return await updateEvaluationRun(db, ownerId, next); }
    catch (error) { if (attempt === 2) throw error; }
  }
  throw new ScanError("The saved tool result could not be recorded.", 409);
}

/** Explicit user action only. GET/polling must never call this continuation. */
export async function returnSavedSeoEvidence(
  db: D1Database, ownerId: string, runId: string, env: AgentsEnvironment,
): Promise<EvaluationRun> {
  const run = await getEvaluationRun(db, ownerId, runId);
  if (!run) throw new ScanError("Evaluation not found.", 404);
  if (!getAgentsConnectionStatus(env).configured) throw new ScanError("Connect an OpenAI API key before continuing this evaluation.", 503);
  if (!(env.OPENAI_ALLOWED_USER_IDS ?? "").split(",").map(value => value.trim()).includes(ownerId) || !ownerId)
    throw new ScanError("This account is not approved to spend OpenAI credits.", 403);
  if (run.mode !== "live" || terminal.has(run.status) || cancellationRequested(run) || !run.sessionId)
    throw new ScanError("This evaluation has no active managed tool request.", 409);
  const output = await frozenSavedSeoResult(run);
  const existing = await db.prepare("SELECT state FROM agent_tool_calls WHERE user_id = ? AND run_id = ?")
    .bind(ownerId, runId).first<{ state: string }>();
  if (existing) throw new ScanError("Saved SEO evidence was already reserved for this run. Refresh its session; no duplicate tool result will be sent.", 409);
  const [session, turns] = await Promise.all([getAgentSession(run.sessionId, env), readAllTurns(run.sessionId, env)]);
  const action = pendingSavedSeoAction(session, turns);
  if (!action) throw new ScanError("OpenAI has no matching pending saved SEO request for this evaluation's active root turn.", 409);
  const now = Date.now();
  const reserved = await db.prepare(`
    INSERT OR IGNORE INTO agent_tool_calls
      (run_id, user_id, session_id, turn_id, call_id, tool_name, state, created_at, updated_at)
    SELECT id, user_id, session_id, ?, ?, ?, 'reserved', ?, ? FROM evaluation_runs
    WHERE user_id = ? AND id = ? AND revision = ? AND session_id = ?
      AND mode = 'live' AND status IN ('running', 'requires_action') AND deleted_at IS NULL
  `).bind(action.turnId, action.callId, SAVED_SEO_TOOL_NAME, now, now,
    ownerId, runId, run.revision, run.sessionId).run();
  if (reserved.meta.changes !== 1)
    throw new ScanError("This evaluation changed or its tool result is already reserved. Refresh before continuing.", 409);
  const event: EvaluationEvent = {
    id: `saved-seo-tool-${action.callId}`, at: new Date(now).toISOString(), type: "tool",
    title: "Returning saved SEO evidence", status: "pending",
    detail: "The owner approved returning one frozen report. No new DataForSEO request was made.",
    data: { toolName: SAVED_SEO_TOOL_NAME, sessionId: run.sessionId, turnId: action.turnId,
      callId: action.callId, submissionState: "reserved", output },
  };
  const checkpoint = await appendToolEvent(db, ownerId, runId, event, "reserved");
  if (terminal.has(checkpoint.status) || cancellationRequested(checkpoint) || checkpoint.sessionId !== run.sessionId)
    throw new ScanError("This evaluation ended before its saved SEO return was submitted.", 409);
  let state: "submitted" | "uncertain" = "submitted";
  try { await submitAgentToolResult(run.sessionId, action, output, env); }
  catch { state = "uncertain"; }
  await db.prepare("UPDATE agent_tool_calls SET state = ?, updated_at = ? WHERE user_id = ? AND run_id = ? AND state = 'reserved'")
    .bind(state, Date.now(), ownerId, runId).run();
  return appendToolEvent(db, ownerId, runId, {
    ...event, title: state === "submitted" ? "Saved SEO evidence returned" : "Saved SEO return needs reconciliation",
    status: state === "submitted" ? "completed" : "pending",
    detail: state === "submitted" ? "OpenAI accepted the frozen evidence. Its managed turn can continue; no new DataForSEO lookup was made."
      : "The request may have reached OpenAI. Refresh to inspect the saved session; this result will not be automatically resent.",
    data: { ...event.data, submissionState: state },
  }, state);
}
