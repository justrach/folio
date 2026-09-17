import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { getEvaluationRun, EvalStoreError } from "./eval-store";
import { prepareCitationReview, reviewCitations } from "./typesafe-citations";
export type TypeSafeEnvironment = { TYPESAFE_API_KEY?: string; TYPESAFE_ALLOWED_USER_IDS?: string };
export type SavedSemanticReview = { id: string; status: "pending" | "completed" | "needs_attention"; model: string; input_tokens: number | null; output_tokens: number | null; latency_ms: number | null; result: null | Awaited<ReturnType<typeof reviewCitations>> };
export function semanticReviewAccess(env: TypeSafeEnvironment, ownerId: string) {
 return Boolean(env.TYPESAFE_API_KEY?.trim() && ownerId && env.TYPESAFE_ALLOWED_USER_IDS?.split(",").map(s=>s.trim()).includes(ownerId));
}
export async function getSemanticReview(db: D1Database, ownerId: string, runId: string): Promise<SavedSemanticReview | null> {
 if (!ownerId) throw new EvalStoreError("Sign in to inspect a semantic review.",401);
 const row = await db.prepare(`SELECT r.id,r.status,r.model,r.input_tokens,r.output_tokens,r.latency_ms,r.result_json
 FROM typesafe_reviews r JOIN evaluation_runs e ON e.id=r.run_id AND e.user_id=r.user_id
 WHERE r.user_id=? AND r.run_id=? AND e.deleted_at IS NULL`).bind(ownerId,runId).first<Omit<SavedSemanticReview,"result"> & {result_json:string|null}>();
 if (!row) return null;
 const {result_json,...rest}=row;return {...rest,result:result_json ? JSON.parse(result_json) : null};
}
export async function startSemanticReview(db: D1Database, ownerId: string, runId: string, revision: unknown, env: TypeSafeEnvironment,
 invoke: typeof reviewCitations = reviewCitations) {
 if (!semanticReviewAccess(env,ownerId)) throw new EvalStoreError("Semantic review is not enabled for this account.",403);
 const run=await getEvaluationRun(db,ownerId,runId);
 if (!run) throw new EvalStoreError("Evaluation not found.",404);
 if (run.mode!=="live" || run.status!=="completed" || run.revision!==revision) throw new EvalStoreError("Refresh a completed live evaluation before reviewing it.",409);
 const existing=await getSemanticReview(db,ownerId,runId);if(existing) return existing;
 let request;
 try {request=await prepareCitationReview(run);} catch {throw new EvalStoreError("Review needs intact single-page evidence and exact fact citations. Inspect the source checks first.",422);}
 const now=Date.now(),id=crypto.randomUUID();
 const reserved=await db.prepare(`INSERT INTO typesafe_reviews(id,user_id,run_id,source_revision,created_at,updated_at,status,model)
 SELECT ?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM evaluation_runs WHERE id=? AND user_id=? AND revision=? AND deleted_at IS NULL AND status='completed' AND mode='live')
 AND NOT EXISTS(SELECT 1 FROM typesafe_reviews WHERE user_id=? AND (run_id=? OR status='pending'))
 AND (SELECT COUNT(*) FROM typesafe_reviews WHERE user_id=? AND created_at>=?)<5
 ON CONFLICT(user_id,run_id) DO NOTHING RETURNING id`).bind(id,ownerId,runId,run.revision,now,now,request.model,runId,ownerId,run.revision,ownerId,runId,ownerId,now-86400000).first<{id:string}>();
 if(!reserved) {
  const duplicate=await getSemanticReview(db,ownerId,runId);if(duplicate) return duplicate;
  throw new EvalStoreError("A review is pending, the five-review daily allowance is used, or the evaluation changed.",409);
 }
 const started=Date.now();
 try {
  const result=await invoke(request,env.TYPESAFE_API_KEY!);
  await db.prepare(`UPDATE typesafe_reviews SET status='completed',model=?,input_tokens=?,output_tokens=?,latency_ms=?,updated_at=?,
   result_json=CASE WHEN EXISTS(SELECT 1 FROM evaluation_runs WHERE id=? AND user_id=? AND deleted_at IS NULL AND revision=?) THEN ? ELSE NULL END
   WHERE id=? AND user_id=? AND status='pending'`).bind(result.model,result.usage.input_tokens,result.usage.output_tokens,Date.now()-started,Date.now(),runId,ownerId,run.revision,JSON.stringify(result),id,ownerId).run();
 } catch {
  // A request can be billed even when no trustworthy response is saved. Keep its reservation and unknown cost.
  await db.prepare("UPDATE typesafe_reviews SET status='needs_attention',latency_ms=?,updated_at=? WHERE id=? AND user_id=? AND status='pending'").bind(Date.now()-started,Date.now(),id,ownerId).run();
 }
 return getSemanticReview(db,ownerId,runId);
}
