import "server-only";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { AgentApiError, agentApiHash } from "./agent-api-key-store";
import type { AgentApiPrincipal, AgentObservationKind, AgentReservationGuard } from "./agent-observation-types";

export type AgentObservationSelection = {
  kind: AgentObservationKind; resourceId: string;
  /** Trusted server-generated SELECT: id,status,observed_at,has_result. */
  matchingSql: string; matchingValues: (string | number | null)[];
  resourceSql: string; resourceValues: (string | number | null)[];
};
export type AgentObservationRequest = { id: string; request_hash: string; resource_kind: AgentObservationKind;
  resource_id: string; run_id: string; disposition: "fresh_saved" | "existing_active" | "started" | "busy" | "denied" };
export async function agentIdempotencyIdentity(idempotencyKey: string, input: unknown) {
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey))
    throw new AgentApiError("Provide an Idempotency-Key of 8–128 letters, digits, dots, underscores, colons or hyphens.", 400, "invalid_idempotency_key");
  return { idempotencyHash: await agentApiHash(idempotencyKey), requestHash: await agentApiHash(JSON.stringify(input)) };
}
export async function getAgentObservationRequest(db: D1Database, ownerId: string, identity: { idempotencyHash: string; requestHash: string }) {
  const row = await db.prepare("SELECT id,request_hash,resource_kind,resource_id,run_id,disposition FROM agent_api_requests WHERE user_id=? AND idempotency_hash=?")
    .bind(ownerId, identity.idempotencyHash).first<AgentObservationRequest>();
  if (row && row.request_hash !== identity.requestHash) throw new AgentApiError("This Idempotency-Key was already used for a different request.", 409, "idempotency_conflict");
  return row;
}
export function assertAgentRequestDisposition(row: AgentObservationRequest) {
  if (row.disposition === "busy") throw new AgentApiError("Another evaluation is active for this account. Retrieve that task before starting another.", 409, "owner_active_elsewhere");
  if (row.disposition === "denied") throw new AgentApiError("This request could not reserve evaluation capacity. Check your account allowance before submitting a new request.", 429, "run_limit");
}
/** D1 batch is a transaction: retry identity and run allocation commit together. */
export async function reserveAgentObservation(db: D1Database, principal: AgentApiPrincipal,
  identity: { idempotencyHash: string; requestHash: string }, selection: AgentObservationSelection,
  runId: string, maxAgeSeconds: number,
  prepareRun: (guard: AgentReservationGuard) => D1PreparedStatement, options: { now?: Date } = {}) {
  const now = (options.now ?? new Date()).getTime(), requestId = crypto.randomUUID();
  const table = selection.kind === "website" ? "evaluation_runs" : "keyword_benchmark_runs";
  const guard = { requestId, ownerId: principal.ownerId, runId };
  const request = db.prepare(`WITH matching AS (${selection.matchingSql}),
    fresh AS (SELECT id FROM matching WHERE status='completed' AND has_result=1 AND observed_at>=? AND observed_at<=? AND ?>0
      ORDER BY observed_at DESC,id DESC LIMIT 1),
    active AS (SELECT r.id,EXISTS(SELECT 1 FROM matching m WHERE m.id=r.id) AS matching FROM ${table} r
      WHERE r.user_id=? AND r.status IN ('queued','running','requires_action') ORDER BY r.created_at DESC,r.id DESC LIMIT 1)
    INSERT INTO agent_api_requests(id,user_id,key_id,idempotency_hash,request_hash,resource_kind,resource_id,run_id,disposition,created_at)
    SELECT ?,?,?,?,?,?,?,COALESCE((SELECT id FROM fresh),(SELECT id FROM active),?),
      CASE WHEN EXISTS(SELECT 1 FROM fresh) THEN 'fresh_saved'
        WHEN EXISTS(SELECT 1 FROM active WHERE matching=1) THEN 'existing_active'
        WHEN EXISTS(SELECT 1 FROM active) THEN 'busy' ELSE 'started' END,?
    WHERE EXISTS(SELECT 1 FROM agent_api_keys WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?
      AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE value='evaluate'))
      AND (${selection.resourceSql})
    ON CONFLICT(user_id,idempotency_hash) DO NOTHING RETURNING id`)
    .bind(...selection.matchingValues, new Date(now - maxAgeSeconds * 1000).toISOString(), new Date(now).toISOString(), maxAgeSeconds, principal.ownerId,
      requestId, principal.ownerId, principal.keyId, identity.idempotencyHash, identity.requestHash, selection.kind, selection.resourceId, runId, now,
      principal.keyId, principal.ownerId, now, ...selection.resourceValues);
  const results = await db.batch([request, prepareRun(guard),
    db.prepare(`UPDATE agent_api_requests SET disposition='denied' WHERE id=? AND user_id=? AND disposition='started'
      AND NOT EXISTS(SELECT 1 FROM ${table} WHERE user_id=? AND id=?) RETURNING id`)
      .bind(requestId, principal.ownerId, principal.ownerId, runId)]);
  const saved = await getAgentObservationRequest(db, principal.ownerId, identity);
  if (!saved) throw new AgentApiError("The API key or saved target changed before the request was reserved. Reload it before trying again.", 409, "reservation_changed");
  assertAgentRequestDisposition(saved);
  return { request: saved, created: saved.id === requestId && saved.run_id === runId && results[1].results.length > 0 };
}
export async function findSavedAgentObservation(db: D1Database, selection: AgentObservationSelection) {
  return db.prepare(`WITH matching AS (${selection.matchingSql}) SELECT id FROM matching
    WHERE status='completed' AND has_result=1 AND observed_at IS NOT NULL ORDER BY observed_at DESC,id DESC LIMIT 1`)
    .bind(...selection.matchingValues).first<{ id: string }>();
}
