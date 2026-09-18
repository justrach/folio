import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";
import { agentIdempotencyIdentity } from "./agent-observation-store";
import { assertSeoDataAccess, getRelatedKeywords, normalizeKeywordSeed, normalizeSeoDomain, type SeoToolOptions } from "./dataforseo";
import type { SandboxSeoPrincipal } from "./sandbox-seo";

type Row={id:string;domain:string;request_hash:string;status:string;result_json:string|null;created_at:number};
/** Durable admission before POST. Pending/error receipts never automatically retry. */
export async function queryKeywordResearch(db:D1Database,ownerId:string,input:{domain:string;seed:string;requestKey:string},options:SeoToolOptions,sandbox?:SandboxSeoPrincipal){
 if(!ownerId)throw new AgentApiError("Authentication required.",401,"unauthorized");
 const domain=normalizeSeoDomain(input.domain),seed=normalizeKeywordSeed(input.seed);
 if(sandbox&&(sandbox.ownerId!==ownerId||sandbox.domain!==domain||sandbox.toolVersion<2))throw new AgentApiError("This capability does not permit keyword research for this website.",403);
 // A sandbox seed is its own idempotency key, independent of model-created keys.
 const identity=await agentIdempotencyIdentity(sandbox?`research:${sandbox.grantId}:${await seedHash(seed)}`:input.requestKey,{tool:"keyword-research-v1",domain,seed,market:"google-us-en"});
 const read=()=>db.prepare("SELECT id,domain,request_hash,status,result_json,created_at FROM keyword_research_requests WHERE user_id=? AND request_key_hash=?").bind(ownerId,identity.idempotencyHash).first<Row>();
 const project=(row:Row,replayed:boolean)=>{
  if(row.request_hash!==identity.requestHash)throw new AgentApiError("This request key belongs to another keyword lookup.",409,"idempotency_conflict");
  return {id:row.id,domain:row.domain,status:row.status,createdAt:new Date(row.created_at).toISOString(),publication:"private" as const,replayed,result:row.result_json?JSON.parse(row.result_json):null};
 };
 const previous=await read();if(previous)return project(previous,true);
 assertSeoDataAccess(options.env,{userId:ownerId});
 const id=crypto.randomUUID(),now=Date.now();
 const admitted=await db.prepare(`INSERT INTO keyword_research_requests(id,user_id,grant_id,domain,request_hash,request_key_hash,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM keyword_research_requests WHERE user_id=? AND created_at>?)<15
 AND (? IS NULL OR EXISTS(SELECT 1 FROM sandbox_seo_grants g JOIN keyword_benchmark_runs r ON r.id=g.run_id AND r.user_id=g.user_id
 WHERE g.id=? AND g.user_id=? AND g.domain=? AND g.tool_version>=2 AND g.expires_at>?
 AND r.status IN ('queued','running','requires_action') AND r.cancel_attempt_at IS NULL AND r.hold_release_at IS NULL
 AND (SELECT COUNT(*) FROM keyword_research_requests WHERE grant_id=g.id)<3))
 ON CONFLICT(user_id,request_key_hash) DO NOTHING RETURNING id`)
 .bind(id,ownerId,sandbox?.grantId??null,domain,identity.requestHash,identity.idempotencyHash,now,now,ownerId,now-86400000,sandbox?.grantId??null,sandbox?.grantId??null,ownerId,domain,now).first();
 if(!admitted){const row=await read();if(row)return project(row,true);throw new AgentApiError("Keyword research is limited to 3 lookups per active authorized run and 15 per account per day. The run may also have expired or stopped.",429,"research_limit");}
 const result=await getRelatedKeywords(seed,{userId:ownerId},options);
 const status=result.status==="error"?"needs_attention":"complete";
 await db.prepare("UPDATE keyword_research_requests SET status=?,result_json=?,cost_micros=?,updated_at=? WHERE id=? AND user_id=?")
 .bind(status,JSON.stringify(result),result.costUsd===null?null:Math.round(result.costUsd*1000000),Date.now(),id,ownerId).run();
 const row=await read();if(!row)throw new AgentApiError("The saved lookup could not be retrieved. Reuse the same request key.",409);
 return project(row,false);
}
async function seedHash(seed:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(seed))),n=>n.toString(16).padStart(2,"0")).join("").slice(0,32);}
