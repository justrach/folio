import "server-only";

import type { D1Database } from "@cloudflare/workers-types";
import {
  AgentsIntegrationError, cancelAgentSessionTurn, createWebsiteEvaluationSession,
  getAgentsConnectionStatus, getAgentSession, getAgentSessionItems,
  getAgentSessionTurns,
  type AgentsEnvironment, type AgentTurn, type WebsiteEvaluationInput,
} from "./agents";
import {
  EVAL_SUITE, WEBSITE_EVAL_VERSION,
  type EvaluationEvent, type EvaluationRun, type EvidenceCapture, type ExpectedFacts,
} from "./evals";
import { createEvaluationRun, getEvaluationRun, updateEvaluationRun } from "./eval-store";
import { createDemoEvaluationRun, parseWebsiteAgentOutput, sha256Source, verifyEvaluationResult } from "./eval-verifier";
import { evaluateHtml } from "./evaluation";
import { getOwnedSeoReport } from "./seo-store";
import { pendingSavedSeoAction } from "./managed-seo-tool";
import { assertAllowedUrl, boundedFetch, configuredScanHosts, normalizeScanUrl, ScanError } from "./scanner";

export type AgentRunEnvironment = AgentsEnvironment & { SCAN_ALLOWED_HOSTS?: string };

export function managedRunAccess(env: AgentRunEnvironment, ownerId: string) {
  const connection = getAgentsConnectionStatus(env);
  const approved = Boolean(ownerId) && (env.OPENAI_ALLOWED_USER_IDS ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean).includes(ownerId);
  const configuredLimit = Number(env.OPENAI_MAX_RUNS_PER_DAY || 1);
  return {
    ...connection,
    authorized: approved,
    canRun: connection.configured && approved,
    maxRunsPerDay: Number.isInteger(configuredLimit) && configuredLimit >= 1
      ? Math.min(configuredLimit, 20) : 1,
    allowedTargets: [...configuredScanHosts(env.SCAN_ALLOWED_HOSTS)],
    message: !connection.configured ? connection.message : !approved
      ? "Your account needs operator approval before it can spend OpenAI credits."
      : "Managed sessions are enabled for your account. Each new evaluation uses OpenAI credits.",
  };
}

function event(type: EvaluationEvent["type"], title: string, detail?: string): EvaluationEvent {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), type, title, detail };
}

/** A bounded, exact-host HTTP capture. No page scripts execute in the application. */
export async function captureEvaluationWebsite(target: string, env: AgentRunEnvironment): Promise<EvidenceCapture> {
  const allowedHosts = configuredScanHosts(env.SCAN_ALLOWED_HOSTS);
  const url = normalizeScanUrl(target);
  assertAllowedUrl(url, allowedHosts);
  const page = await boundedFetch(url, { allowedHosts, maxBytes: 80_000 });
  const checks = evaluateHtml(page.body, page.url, page.headers);
  return {
    id: "page-1", url: page.url, capturedAt: new Date().toISOString(),
    content: page.body, sha256: await sha256Source(page.body),
    hashEncoding: "utf8-text-v1", kind: "page", transport: "http",
    technicalChecks: checks.checks,
  };
}

function inputForRun(run: EvaluationRun): WebsiteEvaluationInput {
  return {
    runId: run.id, rubricVersion: run.suiteVersion,
    domain: new URL(run.targetUrl).hostname, brand: run.siteName,
    prompts: EVAL_SUITE.tasks.map((task) => `${task.label}: ${task.description}`),
    // Independent answer keys stay in Folio. They are never sent to the model.
    savedSeoReportId: run.captures.find((capture) => capture.kind === "seo-report")?.id.replace(/^seo-report:/, ""),
    evidence: run.captures.filter((capture) => capture.kind !== "seo-report").map(({ id, url, capturedAt, kind, content }) => ({
      id, url, capturedAt, kind, content,
    })),
  };
}

export async function startEvaluationRun(
  db: D1Database,
  ownerId: string,
  input: { domain?: string; brand?: string; mode: "managed" | "demo"; rerunOf?: string; expectedFacts?: ExpectedFacts; seoReportId?: string },
  env: AgentRunEnvironment,
): Promise<EvaluationRun> {
  let previous: EvaluationRun | null = null;
  if (input.rerunOf) {
    if (input.seoReportId) throw new ScanError("A replay preserves its original SEO report. Start a fresh evaluation to change it.", 400);
    if (input.expectedFacts) throw new ScanError("A replay preserves the original reference answers. Start a fresh evaluation to change them.", 400);
    previous = await getEvaluationRun(db, ownerId, input.rerunOf);
    if (!previous) throw new ScanError("Evaluation not found.", 404);
    if (previous.suiteVersion !== WEBSITE_EVAL_VERSION)
      throw new ScanError("This suite version cannot be rerun by the current evaluator.", 409);
  }
  if (input.mode === "demo") {
    if (previous && previous.mode !== "demo")
      throw new ScanError("A live evaluation must be replayed as a managed evaluation.", 400);
    const demo = await createDemoEvaluationRun();
    await createEvaluationRun(db, ownerId, demo);
    return demo;
  }
  const access = managedRunAccess(env, ownerId);
  if (!access.configured)
    throw new AgentsIntegrationError("Connect an OpenAI API key before running evaluations.", "NOT_CONFIGURED");
  if (!access.authorized)
    throw new ScanError("This account is not approved to spend OpenAI credits.", 403);
  if (previous && previous.mode !== "live")
    throw new ScanError("Replay this fixture as a demonstration, or start a fresh managed website evaluation.", 400);
  const target = normalizeScanUrl(previous?.targetUrl ?? input.domain ?? "example.com");
  assertAllowedUrl(target, configuredScanHosts(env.SCAN_ALLOWED_HOSTS));
  const siteName = (previous?.siteName ?? input.brand ?? target.hostname).trim();
  if (!siteName || siteName.length > 200) throw new ScanError("Use a website name of 1–200 characters.");
  let seoCapture: EvidenceCapture | undefined;
  if (input.seoReportId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.seoReportId)) throw new ScanError("Invalid saved SEO report.", 400);
    const report = await getOwnedSeoReport(db, ownerId, input.seoReportId);
    if (!report || report.state !== "complete" || !report.result || !report.retrievedAt) throw new ScanError("A completed private SEO report is required.", 404);
    if (report.domain !== target.hostname) throw new ScanError("Select an SEO report for this exact website domain.", 400);
    const content = JSON.stringify(report);
    if (content.length > 30_000) throw new ScanError("The saved SEO report exceeds the evaluation evidence limit.", 413);
    seoCapture = { id: `seo-report:${report.id}`, url: `https://${report.domain}/`, capturedAt: report.retrievedAt ?? report.createdAt,
      content, sha256: await sha256Source(content), hashEncoding: "utf8-text-v1", kind: "seo-report", transport: "http" };
  }
  const now = new Date().toISOString();
  let run: EvaluationRun = {
    id: crypto.randomUUID(), targetUrl: target.href, siteName,
    suiteVersion: WEBSITE_EVAL_VERSION, mode: "live", status: "queued",
    createdAt: now, updatedAt: now, sessionId: null, model: access.model,
    providerStatus: null, captures: [], events: [event("queued", "Evaluation reserved", "Private run; a fresh managed OpenAI session will review frozen website evidence.")],
    result: null, error: null, usage: null, publication: "private", revision: 0,
    ...((previous ? previous.expectedFacts : input.expectedFacts) ? { expectedFacts: structuredClone((previous ? previous.expectedFacts : input.expectedFacts)!) } : {}),
  };
  // Atomic D1 reservation precedes all outbound work. Failed or ambiguous runs
  // still count toward the daily cap and are never automatically resubmitted.
  await createEvaluationRun(db, ownerId, run, { maxLivePerDay: access.maxRunsPerDay });
  const save = async (patch: Partial<EvaluationRun>) => {
    const next = { ...run, ...patch, updatedAt: new Date().toISOString() };
    run = await updateEvaluationRun(db, ownerId, next);
  };
  // A database retry is safe; a session-create retry is not. Keep a received
  // provider ID in the response even if both attempts to persist it fail.
  const saveOutcome = async (patch: Partial<EvaluationRun>): Promise<EvaluationRun> => {
    const candidate = { ...run, ...patch, updatedAt: new Date().toISOString() };
    try {
      run = await updateEvaluationRun(db, ownerId, candidate);
      return run;
    } catch {
      try {
        const latest = await getEvaluationRun(db, ownerId, run.id);
        if (!latest || (latest.sessionId && candidate.sessionId && latest.sessionId !== candidate.sessionId))
          throw new Error("Conflicting or unavailable saved evaluation");
        if (latest.sessionId === candidate.sessionId && ["completed", "failed", "cancelled"].includes(latest.status)) return latest;
        const events = new Map([...latest.events, ...candidate.events].map(entry => [entry.id, entry]));
        run = await updateEvaluationRun(db, ownerId, { ...latest, ...patch,
          revision: latest.revision, events: [...events.values()], updatedAt: new Date().toISOString() });
        return run;
      } catch {
        return { ...candidate, status: "requires_action", error: candidate.sessionId
          ? `OpenAI returned session ${candidate.sessionId}, but its latest state could not be saved. Keep this session ID for operator recovery. A task may be running; do not create a replacement.`
          : "Session creation state could not be saved. A task may have been submitted and its cost is unconfirmed. Do not create a replacement; ask an operator to reconcile this reserved run." };
      }
    }
  };
  let providerInput: WebsiteEvaluationInput;
  try {
    let captures: EvidenceCapture[];
    if (previous) {
      captures = structuredClone(previous.captures);
      const valid = await Promise.all(captures.map(async (capture) => await sha256Source(capture.content) === capture.sha256));
      if (!captures.length || !valid.every(Boolean)) throw new ScanError("The saved captures cannot be replayed because their integrity check failed.", 409);
    } else {
      captures = [await captureEvaluationWebsite(run.targetUrl, env), ...(seoCapture ? [seoCapture] : [])];
    }
    await save({ captures, events: [...run.events, event("capture", previous ? "Frozen website evidence replayed" : "Website evidence captured", previous
      ? `Reused the exact captures and independent expected facts from ${previous.id}. No website recapture was performed.`
      : `Saved ${captures[0].content.length.toLocaleString()} characters with a SHA-256 content hash.`)] });
    providerInput = inputForRun(run);
    // This durable marker precedes the only creation POST. The initial input is
    // required for environment:none and can start billable work immediately.
    await save({ events: [...run.events, { ...event("status", "Creating session with captured evidence",
      "One creation request includes the initial task. A lost response leaves creation and cost unconfirmed; it is never automatically retried."), id: "session-create-attempt" }] });
  } catch (error) {
    return saveOutcome({ status: "failed", error: safeError(error),
      events: [...run.events, event("error", "Evaluation preparation failed", safeError(error))] });
  }
  try {
    const session = await createWebsiteEvaluationSession(providerInput, env);
    return saveOutcome({ sessionId: session.id, providerStatus: session.status,
      status: session.status === "failed" ? "failed" : session.status === "requires_action" ? "requires_action" : "running",
      error: session.status === "failed" ? "OpenAI returned a failed session. Its initial task may have consumed credits; no evaluation success is claimed." : null,
      events: [...run.events,
        { ...event("session", "Managed session received", `OpenAI session ${session.id}; the creation request included the initial task.`), id: "session-received" },
        { ...event("status", "Task accepted by OpenAI", "The managed session continues remotely. Refresh its saved turns to confirm the outcome."), id: "input-accepted" }],
    });
  } catch (error) {
    const knownSessionId = error instanceof AgentsIntegrationError ? error.sessionId : undefined;
    const rejected = error instanceof AgentsIntegrationError && !knownSessionId && (
      error.code === "INVALID_INPUT" || error.code === "NOT_CONFIGURED" ||
      (error.status !== undefined && error.status >= 400 && error.status < 500 && error.status !== 408)
    );
    return saveOutcome({ sessionId: knownSessionId ?? null, status: rejected ? "failed" : "requires_action",
      error: rejected ? `The provider rejected session creation. ${safeError(error)}`
        : `Session creation could not be confirmed. ${knownSessionId ? `Received session ${knownSessionId}; refresh it to reconcile. ` : "The provider may have started the task without returning a usable session ID. "}Cost is unconfirmed. Do not create a replacement.`,
      events: [...run.events, { ...event("error", rejected ? "Session creation rejected" : "Session creation unconfirmed", safeError(error)), id: rejected ? "session-create-rejected" : "input-uncertain" }],
    });
  }
}

function safeError(error: unknown): string {
  if (error instanceof AgentsIntegrationError || error instanceof ScanError) return error.message;
  return "Evaluation state could not be saved. Check the server configuration before retrying.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, limit = 4000): string {
  return typeof value === "string" ? value.slice(0, limit)
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "[redacted authorization]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "[redacted token]") : "";
}

/** Allowlisted UI projection excludes reasoning, prompts, credentials and errors. */
export function projectAgentItems(items: Record<string, unknown>[], at: string): EvaluationEvent[] {
  return items.slice(-100).flatMap((item): EvaluationEvent[] => {
    if (typeof item.id !== "string") return [];
    if (item.type === "message" && item.role === "assistant") {
      const text = messageText(item);
      return [{ id: `item-${item.id}`, at, type: "message",
        title: item.phase === "final_answer" ? "Agent returned its review" : "Agent update",
        detail: safeText(text, 1500), status: item.status === "completed" ? "completed" : "running",
        data: { itemId: item.id, turnId: safeText(item.turn_id, 128), phase: safeText(item.phase, 64) } }];
    }
    if (["function_call", "function_call_output", "mcp_call", "web_search_call", "command_execution", "spawn_subagent_call", "send_subagent_input_call", "wait_for_subagents_call"].includes(String(item.type))) {
      return [{ id: `item-${item.id}`, at, type: "tool", title: `Provider item: ${safeText(item.type, 64)}`,
        detail: safeText(item.name || item.server_label || item.call_id || item.id, 120),
        status: item.status === "completed" ? "completed" : item.status === "failed" ? "failed" : "running",
        data: { itemId: item.id, turnId: safeText(item.turn_id, 128), callId: safeText(item.call_id, 128), providerStatus: safeText(item.status, 64) } }];
    }
    return [];
  });
}

function messageText(item: Record<string, unknown>): string {
  if (!Array.isArray(item.content)) return "";
  return item.content.filter((part) => isRecord(part) && part.type === "output_text" && typeof part.text === "string")
    .map((part) => (part as { text: string }).text).join("\n");
}

async function allPages<T>(read: (after?: string) => Promise<{ data: T[]; has_more: boolean; last_id?: string | null }>): Promise<T[]> {
  const collected: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const next = await read(after);
    collected.push(...next.data);
    if (!next.has_more) return collected;
    if (!next.last_id || next.last_id === after) throw new AgentsIntegrationError("Provider pagination could not be completed.", "INVALID_RESPONSE");
    after = next.last_id;
  }
  throw new AgentsIntegrationError("Provider history exceeds this evaluator's 1,000-item retrieval limit.", "INVALID_RESPONSE");
}

export function latestRootTurn(turns: AgentTurn[]): AgentTurn | undefined {
  return turns.filter((turn) => !turn.subagent_id).at(-1);
}

function isPreparing(run: EvaluationRun) {
  return run.status === "queued" && Date.now() - Date.parse(run.updatedAt) < 120_000 && !run.events.some((entry) =>
    ["input-accepted", "input-uncertain"].includes(entry.id) ||
    (entry.id === "provider-state" && typeof entry.data?.turnId === "string") ||
    entry.title === "Task accepted by OpenAI" || entry.title === "Submission needs reconciliation");
}

/** Reads existing provider state only. Never creates, resumes, or submits tasks. */
export async function reconcileEvaluationRun(db: D1Database, ownerId: string, id: string, env: AgentRunEnvironment): Promise<EvaluationRun> {
  const run = await getEvaluationRun(db, ownerId, id);
  if (!run) throw new ScanError("Evaluation not found.", 404);
  if (run.mode === "demo" || ["completed", "failed", "cancelled"].includes(run.status)) return run;
  // Preparation and submission own this revision until their checkpoint is
  // saved. A second tab must not race them with a read reconciliation update.
  if (isPreparing(run)) return run;
  if (!run.sessionId) {
    // A create POST now includes its task. Once attempted, missing a response
    // cannot establish that work did not start or that no cost was incurred.
    if (run.events.some(entry => entry.id === "session-create-attempt" || entry.id === "input-uncertain")) {
      if (run.status === "requires_action") return run;
      return updateEvaluationRun(db, ownerId, { ...run, status: "requires_action", updatedAt: new Date().toISOString(),
        error: "Session creation remains unconfirmed after its preparation lease expired. A task may be running and cost is unknown. No replacement will be created automatically.",
        events: [...run.events, { ...event("error", "Session creation unconfirmed", "An operator must recover the original session using this run's creation metadata before any new submission."), id: "input-uncertain" }],
      });
    }
    // A reservation that never reached the create-attempt marker cannot have
    // submitted a task through this handler.
    return updateEvaluationRun(db, ownerId, { ...run, status: "failed",
      updatedAt: new Date().toISOString(),
      error: "Preparation expired before a managed session ID was saved. No task was submitted by this run; the reservation still counts toward the run limit.",
      events: [...run.events, event("error", "Preparation lease expired", "The request ended without a saved managed session. No automatic resubmission was made.")],
    });
  }
  const sessionId = run.sessionId;
  const [session, turns, items] = await Promise.all([
    getAgentSession(sessionId, env),
    allPages((after) => getAgentSessionTurns(sessionId, { after }, env)),
    allPages((after) => getAgentSessionItems(sessionId, { after }, env)),
  ]);
  const now = new Date().toISOString();
  const latest = latestRootTurn(turns);
  const priorEvents = new Map(run.events.map((entry) => [entry.id, entry]));
  const events = new Map(run.events.filter((entry) => !entry.id.startsWith("item-")).slice(-30).map((entry) => [entry.id, entry]));
  for (const entry of projectAgentItems(items, now)) {
    // Keep first observation time while refreshing incomplete item contents.
    events.set(entry.id, { ...entry, at: priorEvents.get(entry.id)?.at ?? entry.at });
  }
  let status: EvaluationRun["status"] = "running";
  let error: string | null = null;
  let result = run.result;
  let agentOutput = run.agentOutput;
  if (session.status === "failed" || latest?.status === "failed") {
    status = "failed"; error = "OpenAI reported a failed session or turn. No successful evaluation is claimed.";
  } else if (latest?.status === "cancelled") status = "cancelled";
  else if (session.status === "requires_action" || latest?.status === "waiting") {
    status = "requires_action";
    error = run.captures.some((capture) => capture.kind === "seo-report")
      ? "The agent is waiting for a tool result. Use Return saved SEO evidence to submit the selected report and continue this model turn."
      : "The provider requires external input. No application tool was enabled for this evaluation.";
  } else if (latest?.status === "completed") {
    const final = items.filter((item) => item.type === "message" && item.role === "assistant" &&
      item.turn_id === latest.id && item.status === "completed" && item.phase === "final_answer").at(-1);
    if (!final) {
      // Turns and item reads are separate snapshots. A terminal turn can be
      // visible just before its final item; the next read must be recoverable.
      status = "running";
      error = "The OpenAI turn completed. Waiting for its saved final answer to become available; refresh to reconcile.";
    } else try {
      const text = final ? messageText(final) : "";
      if (!text || text.length > 50_000) throw new Error("Missing or oversized final response");
      agentOutput = parseWebsiteAgentOutput(JSON.parse(text));
      if (!agentOutput) throw new Error("Invalid final response schema");
      result = await verifyEvaluationResult(run, agentOutput);
      status = "completed";
      const verification = event("verification", "Deterministic verification finished", "The verifier checked returned facts and citations against the frozen captures. Failed checks remain visible; this is not a public website rank.");
      events.set("verification-final", { ...verification, id: "verification-final", status: "completed" });
    } catch {
      status = "failed"; result = null; agentOutput = undefined;
      error = "OpenAI completed its turn, but the final answer did not match the evaluation JSON contract. No score was accepted.";
    }
  } else if (!latest && session.status === "idle") {
    status = "requires_action";
    error = "This saved session has no observed task outcome. Idle alone is not completion; no task is automatically resubmitted.";
  } else if (latest?.status === "queued") status = "queued";
  const stateEvent: EvaluationEvent = { id: "provider-state", at: now, type: "status",
    title: `OpenAI session: ${session.status}`, detail: latest ? `Latest root turn ${latest.id}: ${latest.status}` : "No root turn has been observed.",
    data: { sessionId, providerStatus: session.status, turnId: latest?.id ?? null, turnStatus: latest?.status ?? null, requiredActionCount: session.required_actions.length, savedSeoToolAvailable: Boolean(run.captures.some((capture) => capture.kind === "seo-report") && !run.events.some((entry) => entry.id.startsWith("saved-seo-tool-")) && pendingSavedSeoAction(session, turns)), retrievedItemCount: items.length, activityWindow: "Most recent 100 provider items; reasoning and input omitted." } };
  events.set(stateEvent.id, stateEvent);
  return updateEvaluationRun(db, ownerId, { ...run, status, error, result, agentOutput,
    providerStatus: session.status, usage: pickUsage(latest?.usage ?? session.usage),
    events: [...events.values()], updatedAt: now });
}

function pickUsage(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) return null;
  const result: Record<string, unknown> = {};
  for (const name of ["input_tokens", "output_tokens", "total_tokens"]) {
    const value = input[name];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[name] = value;
  }
  return Object.keys(result).length ? result : null;
}

export async function cancelEvaluationRun(db: D1Database, ownerId: string, id: string, env: AgentRunEnvironment): Promise<EvaluationRun> {
  const run = await getEvaluationRun(db, ownerId, id);
  if (!run) throw new ScanError("Evaluation not found.", 404);
  if (run.mode === "demo" || ["completed", "failed", "cancelled"].includes(run.status)) return run;
  if (isPreparing(run))
    throw new ScanError("The session is being prepared or queued. Refresh its status before cancelling.", 409);
  if (!run.sessionId) throw new ScanError("No managed session is available to cancel.", 409);
  await cancelAgentSessionTurn(run.sessionId, env);
  const saved = await updateEvaluationRun(db, ownerId, { ...run,
    updatedAt: new Date().toISOString(),
    events: [...run.events, event("status", "Cancellation requested", "OpenAI accepted the cancellation event. Refresh to observe the terminal turn status.")],
  });
  // Cancellation acknowledgement is not proof of terminal cancellation.
  return saved;
}
