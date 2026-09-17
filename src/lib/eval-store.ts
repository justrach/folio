import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { EVAL_SUITE, type EvaluationRun } from "./evals";
import type { AgentReservationGuard } from "./agent-observation-types";

export class EvalStoreError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = "EvalStoreError";
  }
}

function validateRun(run: EvaluationRun) {
  if (!run.id || run.id.length > 128 || run.publication !== "private" ||
    !Number.isInteger(run.revision) || run.revision < 0 ||
    !Number.isFinite(Date.parse(run.createdAt)) || !Number.isFinite(Date.parse(run.updatedAt)))
    throw new EvalStoreError("Invalid private evaluation run.", 400);
  if (JSON.stringify(run).length > 1_000_000)
    throw new EvalStoreError("Evaluation evidence exceeds the saved-run size limit.", 413);
}

/** One SQL statement reserves capacity before any potentially billable session POST. */
export function prepareEvaluationRunReservation(
  db: D1Database,
  ownerId: string,
  run: EvaluationRun,
  options: { maxLivePerDay?: number | null; guard?: AgentReservationGuard } = {},
) {
  validateRun(run);
  if (!ownerId) throw new EvalStoreError("A signed-in owner is required.", 401);
  const limit = options.maxLivePerDay === undefined ? 1 : options.maxLivePerDay;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100))
    throw new EvalStoreError("Invalid deployment evaluation limit.", 500);
  const saved = { ...run, revision: 0 };
  const guard = options.guard;
  if (guard && (guard.ownerId !== ownerId || guard.runId !== run.id)) throw new EvalStoreError("Invalid API reservation owner or run.", 400);
  return db.prepare(`
      INSERT INTO evaluation_runs
        (id, user_id, target_url, suite_version, mode, status, session_id, created_at, updated_at, revision, result_json)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM evaluation_runs WHERE user_id = ? AND status IN ('queued', 'running', 'requires_action')
      ) AND (? = 'demo' OR ? IS NULL OR (
        SELECT COUNT(*) FROM evaluation_runs WHERE user_id = ? AND mode = 'live' AND created_at >= ?
      ) < ?)
      ${guard ? "AND EXISTS(SELECT 1 FROM agent_api_requests WHERE id=? AND user_id=? AND run_id=? AND disposition='started')" : ""}
      RETURNING id
    `).bind(
      saved.id, ownerId, saved.targetUrl, saved.suiteVersion, saved.mode, saved.status,
      saved.sessionId, Date.parse(saved.createdAt), Date.parse(saved.updatedAt), JSON.stringify(saved),
      ownerId, saved.mode, limit, ownerId, Date.now() - 86_400_000, limit,
      ...(guard ? [guard.requestId, guard.ownerId, guard.runId] : []),
    );
}
export async function createEvaluationRun(db: D1Database, ownerId: string, run: EvaluationRun,
  options: { maxLivePerDay?: number | null } = {}): Promise<EvaluationRun> {
  try {
    const inserted = await prepareEvaluationRunReservation(db, ownerId, run, options).first<{ id: string }>();
    if (!inserted)
      throw new EvalStoreError("An evaluation is already active, or this account has reached its managed evaluation limit for the last 24 hours.", 429);
    return { ...run, revision: 0 };
  } catch (error) {
    if (error instanceof EvalStoreError) throw error;
    if (error instanceof Error && /UNIQUE constraint/i.test(error.message))
      throw new EvalStoreError("This evaluation was already reserved, or another evaluation is active.");
    throw error;
  }
}

/** IDs alone never authorize access, including evidence downloads and provider polling. */
export async function getEvaluationRun(db: D1Database, ownerId: string, id: string): Promise<EvaluationRun | null> {
  const row = await db.prepare("SELECT result_json FROM evaluation_runs WHERE user_id = ? AND id = ? AND deleted_at IS NULL")
    .bind(ownerId, id).first<{ result_json: string }>();
  return row ? JSON.parse(row.result_json) as EvaluationRun : null;
}

export async function listEvaluationRuns(db: D1Database, ownerId: string): Promise<EvaluationRun[]> {
  const { results } = await db.prepare("SELECT result_json FROM evaluation_runs WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50")
    .bind(ownerId).all<{ result_json: string }>();
  return results.map(row => JSON.parse(row.result_json) as EvaluationRun);
}

export type EvaluationUsage = {
  liveAttemptsLast24Hours: number;
  remainingLiveRuns: number | null;
  activeRunId: string | null;
  activeRunStatus: EvaluationRun["status"] | null;
};

/** Informational snapshot of the same reservations enforced by createEvaluationRun.
 * Deleted evidence and failed attempts still count; active runs do not age out.
 * This read never authorizes a new run or replaces the atomic creation gate.
 */
export async function getEvaluationUsage(
  db: D1Database,
  ownerId: string,
  maxLivePerDay: number | null = 1,
): Promise<EvaluationUsage> {
  if (!ownerId) throw new EvalStoreError("A signed-in owner is required.", 401);
  if (maxLivePerDay !== null && (!Number.isInteger(maxLivePerDay) || maxLivePerDay < 1 || maxLivePerDay > 100))
    throw new EvalStoreError("Invalid deployment evaluation limit.", 500);
  // One statement keeps the count and active-run identity in the same snapshot.
  // Intentionally omit deleted_at: tombstones retain their paid-run reservation.
  const row = await db.prepare(`
    WITH owned_runs AS (
      SELECT id, status, mode, created_at FROM evaluation_runs WHERE user_id = ?
    ), active_run AS (
      SELECT id, status FROM owned_runs WHERE status IN ('queued', 'running', 'requires_action')
      ORDER BY created_at DESC, id DESC LIMIT 1
    )
    SELECT
      (SELECT COUNT(*) FROM owned_runs WHERE mode = 'live' AND created_at >= ?) AS live_attempts,
      (SELECT id FROM active_run) AS active_run_id,
      (SELECT status FROM active_run) AS active_run_status
  `).bind(ownerId, Date.now() - 86_400_000).first<{
    live_attempts: number;
    active_run_id: string | null;
    active_run_status: EvaluationRun["status"] | null;
  }>();
  if (!row) throw new EvalStoreError("Evaluation usage is unavailable.", 503);
  return {
    liveAttemptsLast24Hours: row.live_attempts,
    remainingLiveRuns: maxLivePerDay === null ? null : Math.max(0, maxLivePerDay - row.live_attempts),
    activeRunId: row.active_run_id,
    activeRunStatus: row.active_run_status,
  };
}

/** CAS prevents simultaneous browser polling from overwriting a newer provider return. */
export async function updateEvaluationRun(db: D1Database, ownerId: string, run: EvaluationRun): Promise<EvaluationRun> {
  validateRun(run);
  const saved = { ...run, revision: run.revision + 1 };
  const updated = await db.prepare(`
    UPDATE evaluation_runs SET status = ?, session_id = ?, updated_at = ?, revision = ?, result_json = ?
    WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL
      AND target_url = ? AND suite_version = ? AND mode = ? AND created_at = ?
      AND (session_id IS NULL OR session_id = ?)
      AND (status IN ('queued', 'running', 'requires_action') OR status = ?)
    RETURNING id
  `).bind(
    saved.status, saved.sessionId, Date.parse(saved.updatedAt), saved.revision, JSON.stringify(saved),
    ownerId, saved.id, run.revision, saved.targetUrl, saved.suiteVersion, saved.mode,
    Date.parse(saved.createdAt), saved.sessionId, saved.status,
  ).first<{ id: string }>();
  if (!updated)
    throw new EvalStoreError("This private evaluation changed or is unavailable. Reload before continuing.");
  return saved;
}

/** Private export contains exact captured text and the deterministic verification recipe. */
export function createEvaluationBundle(run: EvaluationRun) {
  return {
    format: "folio-private-evaluation-bundle-v1",
    exportedAt: new Date().toISOString(),
    publication: "private",
    suite: EVAL_SUITE,
    verification: {
      hashAlgorithm: "SHA-256",
      hashEncoding: "UTF-8 encoding of capture.content, without text normalization",
      sourceAuthentication: "Hashes are content identities, not trusted timestamps or website signatures.",
      reproduce: "Run verifyEvaluationResult({captures: run.captures, expectedFacts: run.expectedFacts}, run.agentOutput) from src/lib/eval-verifier.ts at this suite version.",
      formula: "verificationScore = round(100 × passed / (passed + failed)); unmeasured checks are reported separately.",
    },
    run,
  };
}
