import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { EvalStoreError } from "./eval-store";

type DeletionCandidate = {
  revision: number;
  status: string;
};

/** Erase Folio's saved evidence without resetting the owner's billable-run quota. */
export async function deleteEvaluationEvidence(
  db: D1Database,
  ownerId: string,
  id: string,
  expectedRevision: unknown,
) {
  if (!ownerId) throw new EvalStoreError("Sign in to delete private evaluation evidence.", 401);
  if (!id || id.length > 128 || !Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0)
    throw new EvalStoreError("Provide the saved evaluation revision before deleting evidence.", 400);

  const candidate = await db.prepare(`
    SELECT revision, status FROM evaluation_runs
    WHERE user_id = ? AND id = ? AND deleted_at IS NULL
  `).bind(ownerId, id).first<DeletionCandidate>();
  if (!candidate) throw new EvalStoreError("Evaluation not found.", 404);
  if (!["completed", "failed", "cancelled"].includes(candidate.status))
    throw new EvalStoreError("Cancel the active run and refresh its status before deleting its evidence.", 409);
  if (candidate.revision !== expectedRevision)
    throw new EvalStoreError("This evaluation changed. Refresh it before deleting its evidence.", 409);

  const deletedAt = Date.now();
  const deleted = await db.prepare(`
    UPDATE evaluation_runs
    SET target_url = '', suite_version = '', session_id = NULL, result_json = '{}',
      updated_at = ?, deleted_at = ?, revision = revision + 1
    WHERE user_id = ? AND id = ? AND revision = ? AND deleted_at IS NULL
      AND status IN ('completed', 'failed', 'cancelled')
    RETURNING id
  `).bind(deletedAt, deletedAt, ownerId, id, expectedRevision as number).first<{ id: string }>();
  // D1 meta.changes also counts trigger effects (such as erased tool records).
  // RETURNING identifies the single owner/revision row our conditional UPDATE matched.
  if (deleted?.id !== id)
    throw new EvalStoreError("This evaluation changed or was deleted. Refresh before continuing.", 409);

  return {
    id,
    deletedAt: new Date(deletedAt).toISOString(),
    scope: "folio-saved-evidence" as const,
    remoteSessionDeleted: false as const,
  };
}
