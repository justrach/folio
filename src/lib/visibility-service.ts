import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";
import { getKeywordBenchmarkRun } from "./keyword-benchmark-store";
import { keywordSearchMode } from "./keyword-benchmark-types";
import { visibilityReport, type VisibilityRun } from "./visibility";
export function visibilityFilters(params:URLSearchParams){
  const allowed=["websiteId","startDate","endDate","platform","sourceType","limit","model"];
  for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)throw new AgentApiError("Unknown or repeated filter.",400,"invalid_filter");
  const websiteId=params.get("websiteId")??"";
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(websiteId))throw new AgentApiError("websiteId is required. Retrieve it from /api/v1/sites.",400,"invalid_filter");
  if(params.has("platform")&&params.get("platform")!=="openai")throw new AgentApiError("Supported platform: openai (managed API observations).",400,"invalid_filter");
  const date=(key:string)=>{const value=params.get(key);if(value!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))throw new AgentApiError("Dates must be valid YYYY-MM-DD UTC dates.",400,"invalid_filter");return value;};
  const startDate=date("startDate"),endDate=date("endDate");
  if(startDate&&endDate&&startDate>endDate)throw new AgentApiError("startDate must not follow endDate.",400,"invalid_filter");
  const sourceType=params.get("sourceType")??"all", rawLimit=params.get("limit")??"50";
  if(!["all","owned","external"].includes(sourceType)||!/^\d+$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>200)throw new AgentApiError("sourceType must be all, owned or external; limit must be 1–200.",400,"invalid_filter");
  const model=params.get("model");if(model!==null&&(!model.length||model.length>100))throw new AgentApiError("Invalid model.",400,"invalid_filter");
  return {websiteId,startDate,endDate,sourceType,limit:Number(rawLimit),model};
}
export async function savedVisibility(db:D1Database,ownerId:string,filters:ReturnType<typeof visibilityFilters>){
  if(!ownerId)throw new AgentApiError("Authentication required.",401,"unauthorized");
  const site=await db.prepare("SELECT id,name,url FROM sites WHERE user_id=? AND id=?").bind(ownerId,filters.websiteId).first<{id:string;name:string;url:string}>();
  if(!site)throw new AgentApiError("Website not found.",404,"not_found");
  // Filter before bounding; other websites cannot displace this site's history.
  const rows=await db.prepare(`SELECT id FROM keyword_benchmark_runs WHERE user_id=? AND json_extract(case_json,'$.targetUrl')=? AND json_extract(case_json,'$.searchMode')='open-web' AND (? IS NULL OR created_at>=?) AND (? IS NULL OR created_at<?) AND (? IS NULL OR model=?) ORDER BY created_at DESC,id DESC LIMIT 101`).bind(ownerId,site.url,filters.startDate,filters.startDate?Date.parse(filters.startDate):null,filters.endDate,filters.endDate?Date.parse(filters.endDate)+86400000:null,filters.model,filters.model).all<{id:string}>();
  const runs:VisibilityRun[]=[];
  // Sequential bounded reads avoid loading provider evidence for all records at once.
  for(const row of rows.results.slice(0,100)){const run=await getKeywordBenchmarkRun(db,ownerId,row.id);if(run&&keywordSearchMode(run.case.searchMode)==="open-web")runs.push({id:run.id,caseId:run.caseId,suiteId:run.suiteId,case:{query:run.case.query,targetUrl:run.case.targetUrl,language:run.case.language,locale:run.case.locale,rubricVersion:run.case.rubricVersion,searchMode:run.case.searchMode},status:run.status,model:run.model,harnessVersion:run.harnessVersion,createdAt:run.createdAt,answer:run.answer?{text:"",mentions:run.answer.mentions,citations:run.answer.citations}:null});}
  const report=visibilityReport(runs);
  const daily=new Map<string,VisibilityRun[]>();for(const run of runs)if(run.status==="completed"&&run.answer){const day=run.createdAt.slice(0,10);daily.set(day,[...(daily.get(day)??[]),run]);}
  return {website:site,platform:"openai",surface:"openai-managed-agents",searchMode:"open-web",dateRange:{startDate:filters.startDate,endDate:filters.endDate,timeZone:"UTC"},coverage:{attemptsLoaded:runs.length,limit:100,truncated:rows.results.length>100,unresolvedAttempts:runs.filter(r=>r.status==="requires_action").length},methodology:"Latest completed answer per question in the selected window. Exact URL host identity; unknown target identities excluded from visibility. Share of voice counts each identified domain once per answer. Positions follow returned answer order. Daily samples may contain different questions or models and are not a controlled trend. Recommendations are evidence-based rules, not verified fixes or ranking guarantees.",...report,citations:report.citations.filter(c=>filters.sourceType==="all"||c.sourceType===filters.sourceType).slice(0,filters.limit),daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,items])=>({date,...visibilityReport(items).current})),platforms:[{platform:"openai",models:[...new Set(runs.map(r=>r.model))],...report.current}]};
}
