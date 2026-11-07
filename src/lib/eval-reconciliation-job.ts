import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { reconcileEvaluationRun, type AgentRunEnvironment } from "./agent-runs";

export type EvaluationJobEnvironment = AgentRunEnvironment & {
  EVALUATION_RECONCILE_ENABLED?: string;
  EVALUATION_RECONCILE_SECRET?: string;
};

const JOB_NAME = "evaluation-read-reconciliation";
export const RECONCILIATION_BATCH_SIZE = 3;
// Each provider request already has a 30s timeout and pagination is capped at
// 10 pages. Runs below execute concurrently, within this lease's 10 minutes.
export const RECONCILIATION_LEASE_MS = 600_000;
export const RECONCILIATION_STALE_MS = 15 * 60_000;
const JOB_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export function validReconciliationSecret(secret: unknown): secret is string {
  return typeof secret === "string" && secret.length >= 32 && secret.length <= 512 && !/[\r\n]/.test(secret);
}

/** Fixed-length digest comparison avoids revealing the matching token prefix. */
export function authenticateReconciliationJob(request: Request, env: EvaluationJobEnvironment): boolean {
  if (env.EVALUATION_RECONCILE_ENABLED !== "true" || !validReconciliationSecret(env.EVALUATION_RECONCILE_SECRET)) return false;
  const supplied = request.headers.get("Authorization");
  if (!supplied?.startsWith("Bearer ") || supplied.length > 519) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(supplied.slice(7)), digest(env.EVALUATION_RECONCILE_SECRET));
}

type JobDependencies = {
  now?: () => number;
  reconcile?: typeof reconcileEvaluationRun;
};

export type ReconciliationJobResult = {
  status: "disabled" | "busy" | "completed";
  attempted: number;
  reconciled: number;
  failed: number;
  stale: number;
  lastSuccessAt: number | null;
};

/** Read existing provider state only. This job cannot create sessions, resubmit
 * input, approve costs, dispatch application tools, or publish private runs. */
export async function runEvaluationReconciliationJob(
  db: D1Database,
  env: EvaluationJobEnvironment,
  dependencies: JobDependencies = {},
): Promise<ReconciliationJobResult> {
  const empty = { attempted: 0, reconciled: 0, failed: 0, stale: 0, lastSuccessAt: null };
  if (env.EVALUATION_RECONCILE_ENABLED !== "true" ||
    !validReconciliationSecret(env.EVALUATION_RECONCILE_SECRET) || !env.OPENAI_API_KEY?.trim())
    return { status: "disabled", ...empty };
  const now = dependencies.now ?? Date.now;
  const reconcile = dependencies.reconcile ?? reconcileEvaluationRun;
  const token = crypto.randomUUID();
  const startedAt = now();
  // One atomic UPSERT grants one owner; duplicated scheduled events cannot both
  // hold the lease. A dead invocation becomes eligible after the fixed expiry.
  const lease = await db.prepare(`
    INSERT INTO background_job_leases (name, token, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at
    WHERE background_job_leases.expires_at <= ?
  `).bind(JOB_NAME, token, startedAt + RECONCILIATION_LEASE_MS, startedAt).run();
  if (lease.meta.changes !== 1) return { status: "busy", ...empty };
  try {
    await db.prepare(`
      INSERT INTO background_job_health (name, last_started_at)
      SELECT ?, ? WHERE EXISTS (
        SELECT 1 FROM background_job_leases WHERE name = ? AND token = ? AND expires_at > ?
      )
      ON CONFLICT(name) DO UPDATE SET last_started_at = excluded.last_started_at
    `).bind(JOB_NAME, startedAt, JOB_NAME, token, startedAt).run();
    // Use a separate attempt timestamp: provider errors and browser polling must
    // not continually push the same runs to the front or starve other owners.
    const { results } = await db.prepare(`
      SELECT id, user_id FROM evaluation_runs
      WHERE mode = 'live' AND deleted_at IS NULL AND status IN ('queued', 'running', 'requires_action')
      ORDER BY background_checked_at ASC, created_at ASC, id ASC LIMIT ?
    `).bind(RECONCILIATION_BATCH_SIZE).all<{ id: string; user_id: string }>();
    const outcomes = await Promise.allSettled(results.map(async (row) => {
      await db.prepare(`
        UPDATE evaluation_runs SET background_checked_at = ?
        WHERE id = ? AND user_id = ? AND mode = 'live' AND deleted_at IS NULL
      `).bind(startedAt, row.id, row.user_id).run();
      await reconcile(db, row.user_id, row.id, env);
      await db.prepare(`
        UPDATE evaluation_runs SET background_reconciled_at = MAX(COALESCE(background_reconciled_at, 0), ?)
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL
      `).bind(now(), row.id, row.user_id).run();
    }));
    const finishedAt = now();
    // Failed attempts do not reset freshness. Owner-action waits can be fresh;
    // this measures successful background checks, not model progress or success.
    const backlog = await db.prepare(`
      SELECT COUNT(*) AS stale FROM evaluation_runs
      WHERE mode = 'live' AND deleted_at IS NULL AND status IN ('queued', 'running', 'requires_action')
        AND COALESCE(background_reconciled_at, created_at) <= ?
    `).bind(finishedAt - RECONCILIATION_STALE_MS).first<{ stale: number }>();
    const result = {
      status: "completed" as const, attempted: outcomes.length,
      reconciled: outcomes.filter(outcome => outcome.status === "fulfilled").length,
      failed: outcomes.filter(outcome => outcome.status === "rejected").length,
      stale: backlog?.stale ?? 0,
    };
    // Expired invocations must not overwrite a newer job's health checkpoint.
    const health = await db.prepare(`
      UPDATE background_job_health SET last_finished_at = ?,
        last_success_at = CASE WHEN ? = 0 AND ? = 0 THEN ? ELSE last_success_at END,
        attempted = ?, reconciled = ?, failed = ?, stale = ?
      WHERE name = ? AND EXISTS (
        SELECT 1 FROM background_job_leases WHERE name = ? AND token = ? AND expires_at > ?
      ) RETURNING last_success_at
    `).bind(finishedAt, result.failed, result.stale, finishedAt,
      result.attempted, result.reconciled, result.failed, result.stale,
      JOB_NAME, JOB_NAME, token, finishedAt).first<{ last_success_at: number | null }>();
    if (!health) throw new Error("Reconciliation lease expired before health was saved.");
    return { ...result, lastSuccessAt: health.last_success_at };
  } finally {
    // An expired invocation can never release a newer invocation's lease.
    await db.prepare("DELETE FROM background_job_leases WHERE name = ? AND token = ?")
      .bind(JOB_NAME, token).run();
  }
}

/** No user session or caller-supplied owner/run filters authorize this route.
 * Unknown tokens and disabled configuration have the same non-disclosing 404. */
export async function handleEvaluationReconciliationRequest(
  request: Request,
  db: () => Promise<D1Database>,
  env: EvaluationJobEnvironment,
  dependencies: JobDependencies = {},
): Promise<Response> {
  if (request.method !== "POST" || !authenticateReconciliationJob(request, env))
    return Response.json({ error: "Not found." }, { status: 404, headers: JOB_HEADERS });
  try {
    const result = await runEvaluationReconciliationJob(await db(), env, dependencies);
    // Only aggregate counts are returned to the authenticated scheduler. No
    // identities, domains, session IDs, outputs, credentials, or errors escape.
    return Response.json(result, {
      status: result.status === "disabled" || result.failed > 0 || result.stale > 0 ? 503 : 200,
      headers: JOB_HEADERS,
    });
  } catch {
    return Response.json({ error: "Reconciliation unavailable." }, { status: 503, headers: JOB_HEADERS });
  }
}
