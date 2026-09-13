import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";
import { getAgentObservationRun } from "./agent-observation-service";
import { getEvaluationRun } from "./eval-store";
import { getOwnedSeoReport } from "./seo-store";
import { evaluateHtml } from "./evaluation";
import { normalizeSeoDomain } from "./dataforseo";

export type SavedPage = { limit?: number; cursor?: string };
type CursorRow = { id: string; created_at: number };
function cursor(value?: string): [number, string] | null {
  if (!value) return null;
  try { const v = JSON.parse(atob(value)); if (Array.isArray(v) && v.length === 2 && Number.isSafeInteger(v[0]) && typeof v[1] === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v[1])) return v as [number,string]; } catch {}
  throw new AgentApiError("Invalid page cursor.",400,"invalid_input");
}
export async function savedRows<T extends CursorRow>(db: D1Database, sql: string, values: (string|number|null)[], page: SavedPage = {}) {
  const limit=page.limit??50, after=cursor(page.cursor);
  if (!Number.isInteger(limit)||limit<1||limit>100) throw new AgentApiError("limit must be 1–100.",400,"invalid_input");
  const rows=await db.prepare(`SELECT * FROM (${sql}) WHERE (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?`)
    .bind(...values,after?.[0]??null,after?.[0]??null,after?.[0]??null,after?.[1]??null,limit+1).all<T>();
  const items=rows.results.slice(0,limit), last=items.at(-1), truncated=rows.results.length>limit;
  return {items,nextCursor:truncated&&last?btoa(JSON.stringify([last.created_at,last.id])):null,truncated,
    ordering:"created_at DESC, id DESC; new inserts ahead of the cursor appear on refresh"};
}
export async function savedSite(db:D1Database,owner:string,id:string) {
  if(!owner)throw new AgentApiError("Authentication required.",401,"unauthorized");
  const site=await db.prepare("SELECT id,url,name FROM sites WHERE user_id=? AND id=?").bind(owner,id).first<{id:string;url:string;name:string}>();
  if(!site)throw new AgentApiError("Website not found.",404,"not_found");
  return site;
}
export async function pagedTargets(db:D1Database,owner:string,input:SavedPage & {kind?:"website"|"keyword";websiteId?:string;suiteId?:string;searchMode?:string}) {
  if(!owner)throw new AgentApiError("Authentication required.",401,"unauthorized");
  const site=input.websiteId?await savedSite(db,owner,input.websiteId):null;
  if(input.kind==="website") {
    const page=await savedRows<{id:string;created_at:number;url:string;name:string}>(db,"SELECT id,created_at,url,name FROM sites WHERE user_id=? AND (? IS NULL OR id=?)",[owner,input.websiteId??null,input.websiteId??null],input);
    return {...page,kind:"website"};
  }
  const page=await savedRows<{id:string;created_at:number;suite_id:string;case_json:string}>(db,`SELECT id,created_at,suite_id,case_json FROM keyword_benchmark_cases WHERE user_id=? AND (? IS NULL OR suite_id=?) AND (? IS NULL OR json_extract(case_json,'$.targetUrl')=?) AND (? IS NULL OR COALESCE(json_extract(case_json,'$.searchMode'),'reviewed-domains')=?)`,[owner,input.suiteId??null,input.suiteId??null,site?.url??null,site?.url??null,input.searchMode??null,input.searchMode??null],input);
  return {...page,kind:"keyword",items:page.items.map(row=>{const c=JSON.parse(row.case_json);return {id:row.id,suiteId:row.suite_id,createdAt:new Date(row.created_at).toISOString(),query:c.query,targetUrl:c.targetUrl,language:c.language,locale:c.locale,searchMode:c.searchMode??"reviewed-domains"};})};
}
export async function savedRunHistory(db:D1Database,owner:string,input:SavedPage & {kind:"website"|"keyword";websiteId?:string;caseId?:string;status?:string;since?:string;until?:string;searchMode?:string;model?:string;changedSince?:string}) {
  if(!owner)throw new AgentApiError("Authentication required.",401,"unauthorized");
  const site=input.websiteId?await savedSite(db,owner,input.websiteId):null;
  const keyword=input.kind==="keyword";
  const table=keyword?"keyword_benchmark_runs":"evaluation_runs";
  const filters=["user_id=?"],values:(string|number|null)[]=[owner];
  if(!keyword)filters.push("mode='live' AND deleted_at IS NULL");
  if(site){filters.push(`${keyword?"json_extract(case_json,'$.targetUrl')":"target_url"}=?`);values.push(site.url);}
  if(input.caseId){if(!keyword)throw new AgentApiError("caseId requires keyword kind.");filters.push("case_id=?");values.push(input.caseId);}
  if(input.status){filters.push("status=?");values.push(input.status);}
  if(input.model){filters.push(`${keyword?"model":"json_extract(result_json,'$.model')"}=?`);values.push(input.model);}
  if(input.searchMode){if(!keyword)throw new AgentApiError("searchMode requires keyword kind.");filters.push("COALESCE(json_extract(case_json,'$.searchMode'),'reviewed-domains')=?");values.push(input.searchMode);}
  for(const [date,operator] of [[input.since,">="],[input.until,"<"]] as const)if(date){if(!Number.isFinite(Date.parse(date)))throw new AgentApiError("Invalid history date.");filters.push(`created_at${operator}?`);values.push(Date.parse(date));}
  if(input.changedSince){if(!Number.isFinite(Date.parse(input.changedSince)))throw new AgentApiError("Invalid change time.");filters.push("updated_at>=?");values.push(Date.parse(input.changedSince));}
  const page=await savedRows(db,`SELECT id,${input.changedSince?"updated_at AS created_at":"created_at"} FROM ${table} WHERE ${filters.join(" AND ")}`,values,input);
  const items=[];for(const row of page.items)items.push((await getAgentObservationRun(db,owner,input.kind,row.id)).run);
  return {...page,items,changePolling:input.changedSince?"updated_at order; retain changedSince and page to completion, then repeat with an overlapping time window and deduplicate by run ID/update time. This reads saved state only.":null};
}
export async function savedPageEvidence(db:D1Database,owner:string,input:SavedPage & {websiteId:string;url?:string;runId?:string;contains?:string}) {
  const site=await savedSite(db,owner,input.websiteId);
  const page=await savedRows(db,"SELECT id,created_at FROM evaluation_runs WHERE user_id=? AND target_url=? AND mode='live' AND deleted_at IS NULL AND (? IS NULL OR id=?)",[owner,site.url,input.runId??null,input.runId??null],input);
  const items=[];
  for(const row of page.items){const run=await getEvaluationRun(db,owner,row.id);if(!run)continue;
    const captures=run.captures.filter(c=>c.kind==="page"&&(!input.url||c.url===input.url));
    for(const c of captures){const index=input.contains?c.content.toLowerCase().indexOf(input.contains.toLowerCase()):0;
      if(input.contains&&index<0)continue;
      const htmlChecks=/<(?:html|head|body|h[1-6])\b/i.test(c.content)?evaluateHtml(c.content,c.url).checks.filter(check=>["headings","canonical","indexability"].includes(check.id)).map(check=>({id:check.id,evidence:check.evidence})):null;
      items.push({runId:run.id,captureId:c.id,url:c.url,capturedAt:c.capturedAt,sha256:c.sha256,hashEncoding:c.hashEncoding??"utf8-text-v1",transport:c.transport??null,
        state:Date.now()-Date.parse(c.capturedAt)>86400000?"stale_snapshot":"observed",excerpt:c.content.slice(Math.max(0,index-200),Math.max(0,index-200)+4000),contentTruncated:c.content.length>4000,
        httpStatus:null,finalUrl:null,canonical:null,indexability:null,headings:null,derivedHtml:htmlChecks?{basis:"Recomputed from saved HTML only; HTTP headers and rendered DOM unavailable",checks:htmlChecks}:null,unavailableReason:"Transport metadata and parsed headings were not stored in this capture. Excerpt is saved untrusted content, not proof of a content gap."});}
    if(!captures.length)items.push({runId:run.id,state:run.events.some(e=>e.type==="capture"&&e.status==="failed")?"fetch_failed":"not_collected",url:input.url??site.url});
  }
  return {...page,items,state:page.items.length?"saved_history":"not_collected",recommendationRule:"Inspect saved content before proposing an edit. A missing recommendation does not establish a missing page or topic."};
}
export async function pagedSeo(db:D1Database,owner:string,input:SavedPage & {domain?:string;reportId?:string}) {
  if(!owner)throw new AgentApiError("Authentication required.",401,"unauthorized");
  if(input.reportId){const report=await getOwnedSeoReport(db,owner,input.reportId);if(!report)throw new AgentApiError("Report not found.",404,"not_found");
    return {report,detail:{state:"not_collected",keywords:null,landingPages:null,backlinkRows:null,
      reason:"The current collector stores organic position buckets and backlink aggregates only. Row-level queries, landing pages and source/target links were never collected.",
      sourceUpdatedAt:report.result?.organic.data?.dataUpdatedAt??null,retrievedAt:report.retrievedAt,
      scope:{location:report.result?.organic.data?.locationName??null,language:report.result?.organic.data?.languageCode??null,includeSubdomains:report.result?.backlinks.data?.includeSubdomains??null},estimates:true}};
  }
  const domain=input.domain?normalizeSeoDomain(input.domain):null;
  const page=await savedRows<{id:string;created_at:number;domain:string;retrieved_at:number|null}>(db,"SELECT id,created_at,domain,retrieved_at FROM seo_reports WHERE user_id=? AND (? IS NULL OR domain=?)",[owner,domain,domain],input);
  return {...page,items:page.items.map(r=>({id:r.id,domain:r.domain,createdAt:new Date(r.created_at).toISOString(),retrievedAt:r.retrieved_at===null?null:new Date(r.retrieved_at).toISOString()}))};
}

export async function savedVisibilityComparison(db:D1Database,owner:string,input:{websiteId:string;baselineStart:string;baselineEnd:string;comparisonStart:string;comparisonEnd:string;caseId?:string;model?:string;searchMode?:string;publicationAt?:string;baselineCursor?:string;comparisonCursor?:string}) {
  const {getKeywordBenchmarkRun}=await import("./keyword-benchmark-store");
  const {compareVisibility}=await import("./visibility-comparison");
  const dates=[input.baselineStart,input.baselineEnd,input.comparisonStart,input.comparisonEnd];
  if(dates.some(d=>!Number.isFinite(Date.parse(d)))||Date.parse(dates[0])>=Date.parse(dates[1])||Date.parse(dates[1])>Date.parse(dates[2])||Date.parse(dates[2])>=Date.parse(dates[3])||input.publicationAt&&!Number.isFinite(Date.parse(input.publicationAt)))throw new AgentApiError("Use ordered, non-overlapping baseline and comparison windows (end exclusive).",400,"invalid_input");
  const common={kind:"keyword" as const,websiteId:input.websiteId,caseId:input.caseId,model:input.model,searchMode:input.searchMode,limit:100};
  const a=await savedRunHistory(db,owner,{...common,since:input.baselineStart,until:input.baselineEnd,cursor:input.baselineCursor});
  const b=await savedRunHistory(db,owner,{...common,since:input.comparisonStart,until:input.comparisonEnd,cursor:input.comparisonCursor});
  const load=async(items:typeof a.items)=>{const runs=[];for(const r of items){if(r){const run=await getKeywordBenchmarkRun(db,owner,r.id);if(run)runs.push(run);}}return runs;};
  return {...compareVisibility(await load(a.items),await load(b.items),input.publicationAt),coverage:{baseline:{nextCursor:a.nextCursor,truncated:a.truncated},comparison:{nextCursor:b.nextCursor,truncated:b.truncated},scope:"Current pages only; use run history for complete client-side pairing if truncated"}};
}
