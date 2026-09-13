"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, LockKeyhole, RefreshCw } from "lucide-react";
import type { Scan } from "@/lib/demo-data";
import type { SeoReportSummary } from "@/lib/seo-store";
import type { SearchConsoleReportSummary } from "@/lib/search-console-types";
import { compareKeywordBenchmarkRuns, isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkRun, type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite, type KeywordBenchmarkSuiteSummary, type KeywordSearchMode } from "@/lib/keyword-benchmark-types";
import { visibilityReport } from "@/lib/visibility";
import { keywordRecommendationMetrics } from "@/lib/keyword-search-mode";
import { evaluationHref } from "@/lib/evaluation-navigation";
import { WorkspaceEvaluationSummary } from "./workspace-evaluation-summary";
import "./real-overview.css";

type Site = { id:string; name:string; url:string };
type Load<T> = { state:"loading"|"ready"|"error"; items:T[] };
type Data = { sites:Load<Site>; runs:Load<KeywordBenchmarkRunSummary>; suites:Load<KeywordBenchmarkSuite>; seo:Load<SeoReportSummary>; search:Load<SearchConsoleReportSummary> };
const waiting = <T,>():Load<T> => ({state:"loading",items:[]});
const initial = ():Data => ({sites:waiting(),runs:waiting(),suites:waiting(),seo:waiting(),search:waiting()});
const labels = {queued:"Queued",running:"Running",requires_action:"Needs attention",completed:"Completed",failed:"Failed",cancelled:"Cancelled"};
function normalized(value:string|null|undefined) { try {const url=new URL(value??"");return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;} }
function ordered<T extends {createdAt:string;id:string}>(items:T[]) { return [...items].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||b.id.localeCompare(a.id)); }
function reportHref(run:Pick<KeywordBenchmarkRun,"id"|"suiteId">) { return `/benchmarks?suite=${encodeURIComponent(run.suiteId)}&run=${encodeURIComponent(run.id)}`; }
function date(value:string) { return new Date(value).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
async function read<T>(url:string,signal:AbortSignal):Promise<T> {const response=await fetch(url,{method:"GET",cache:"no-store",signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])});if(!response.ok)throw new Error("Saved data unavailable");return response.json();}
async function list<T>(url:string,key:string,max:number,signal:AbortSignal):Promise<T[]> {const data=await read<Record<string,unknown>>(url,signal);if(!Array.isArray(data[key])||data[key].length>max)throw new Error("Invalid saved list");return data[key] as T[];}
async function settledMap<T,U>(items:T[],work:(item:T)=>Promise<U>) {
  const results:PromiseSettledResult<U>[] = new Array(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(cursor<items.length){const index=cursor++;try{results[index]={status:"fulfilled",value:await work(items[index])};}catch(reason){results[index]={status:"rejected",reason};}}}));return results;
}

export function workspaceOverviewHref(query: Pick<URLSearchParams, "getAll">): string {
  const params = new URLSearchParams({ view: "workspace" });
  const websites = query.getAll("website");
  if (websites.length === 1 && isKeywordBenchmarkId(websites[0])) params.set("website", websites[0]);
  const scopes = query.getAll("scope");
  if (scopes.length === 1 && scopes[0] === "reviewed-domains") params.set("scope", scopes[0]);
  return `/overview?${params}`;
}

export function RealOverview({ownerId,scans,scansLoading,scansError,onRetryScans,onOpenScan}:{ownerId:string|null;scans:Scan[];scansLoading:boolean;scansError:string;onRetryScans:()=>void;onOpenScan:(scan:Scan)=>void}) {
  const query = useSearchParams();
  const signInHref = `/login?next=${encodeURIComponent(workspaceOverviewHref(query))}`;
  if(!ownerId)return <section className="panel real-overview-signin"><LockKeyhole size={23}/><h2>Sign in to see your website’s results</h2><p>Your saved search observations, website checks and reports stay private to your account.</p><Link className="button primary" href={signInHref}>Sign in to your workspace <ArrowRight size={14}/></Link></section>;
  return <OwnedOverview key={ownerId} scans={scans} scansLoading={scansLoading} scansError={scansError} onRetryScans={onRetryScans} onOpenScan={onOpenScan}/>;
}

function OwnedOverview({scans,scansLoading,scansError,onRetryScans,onOpenScan}:Omit<Parameters<typeof RealOverview>[0],"ownerId">) {
  const query=useSearchParams();
  const hints=query.getAll("website");const selectedHint=hints.length===1&&isKeywordBenchmarkId(hints[0])?hints[0]:null;
  const scope:KeywordSearchMode=query.get("scope")==="reviewed-domains"?"reviewed-domains":"open-web";
  const [data,setData]=useState<Data>(initial);
  const [refresh,setRefresh]=useState(0);
  const [detail,setDetail]=useState<{key:string;state:"loading"|"ready";runs:KeywordBenchmarkRun[];failed:number}>({key:"",state:"loading",runs:[],failed:0});
  const selected=hints.length?data.sites.items.find(site=>site.id===selectedHint):data.sites.items[0];
  const selectionKey=`${selected?.id??""}:${scope}:${refresh}`;
  useEffect(()=>{
    const controller=new AbortController();setData(initial());
    const load=<T,>(key:Exclude<keyof Data,"suites">,url:string,field:string,max:number) => list<T>(url,field,max,controller.signal).then(items=>{if(!controller.signal.aborted)setData(previous=>({...previous,[key]:{state:"ready",items}}));}).catch(()=>{if(!controller.signal.aborted)setData(previous=>({...previous,[key]:{state:"error",items:[]}}));});
    void load<Site>("sites","/api/sites","sites",100);
    void load<KeywordBenchmarkRunSummary>("runs","/api/benchmarks/runs","runs",100);
    void load<SeoReportSummary>("seo","/api/seo-reports","reports",100);
    void load<SearchConsoleReportSummary>("search","/api/search-console/reports","reports",50);
    void list<KeywordBenchmarkSuiteSummary>("/api/benchmarks","suites",20,controller.signal).then(async summaries=>{
      const results=await settledMap(summaries,async item=>{
        if(!isKeywordBenchmarkId(item.id))throw new Error("Invalid suite");
        const {suite}=await read<{suite:KeywordBenchmarkSuite}>(`/api/benchmarks/${encodeURIComponent(item.id)}`,controller.signal);
        if(suite.id!==item.id||!Array.isArray(suite.cases))throw new Error("Invalid suite");return suite;
      });
      if(!controller.signal.aborted)setData(previous=>({...previous,suites:{state:results.some(item=>item.status==="rejected")?"error":"ready",items:results.flatMap(item=>item.status==="fulfilled"?[item.value]:[])}}));
    }).catch(()=>{if(!controller.signal.aborted)setData(previous=>({...previous,suites:{state:"error",items:[]}}));});
    return()=>controller.abort();
  },[refresh]);
  const target=normalized(selected?.url);
  const attempts=ordered(data.runs.items.filter(run=>run.publication==="private"&&isKeywordBenchmarkId(run.id)&&isKeywordBenchmarkId(run.caseId)&&isKeywordBenchmarkId(run.suiteId)&&normalized(run.case.targetUrl)===target&&target!==null&&keywordSearchMode(run.case.searchMode)===scope));
  const latest=new Map<string,KeywordBenchmarkRunSummary>();
  const completed=new Map<string,KeywordBenchmarkRunSummary>();
  for(const run of attempts){if(!latest.has(run.caseId))latest.set(run.caseId,run);if(run.status==="completed"&&!completed.has(run.caseId))completed.set(run.caseId,run);}
  const requestedIds=[...completed.values()].map(run=>run.id).sort().join(",");
  // Read each latest completed answer plus up to two prior answers for one query.
  // No overview request reconciles, cancels, starts, or returns provider tools.
  const historyCase=[...completed.keys()].find(id=>attempts.filter(run=>run.caseId===id&&run.status==="completed").length>1);
  const historySummaries=historyCase?attempts.filter(run=>run.caseId===historyCase&&run.status==="completed").slice(0,3):[];
  const historyIds=historySummaries.map(run=>run.id).join(",");
  useEffect(()=>{
    setDetail({key:selectionKey,state:"loading",runs:[],failed:0});
    if(!selected||data.runs.state!=="ready")return;
    const controller=new AbortController();
    const summaries=[...new Map([...completed.values(),...historySummaries].map(run=>[run.id,run])).values()];
    void settledMap(summaries,async summary=>{
      const {run}=await read<{run:KeywordBenchmarkRun}>(`/api/benchmarks/runs/${encodeURIComponent(summary.id)}`,controller.signal);
      if(run.id!==summary.id||run.caseId!==summary.caseId||run.suiteId!==summary.suiteId||run.publication!=="private"||run.status!=="completed"||normalized(run.case.targetUrl)!==target||keywordSearchMode(run.case.searchMode)!==scope||!Array.isArray(run.answer?.mentions)||!Array.isArray(run.answer?.citations))throw new Error("Invalid saved observation");
      keywordRecommendationMetrics(run);return run;
    }).then(results=>{if(!controller.signal.aborted)setDetail({key:selectionKey,state:"ready",runs:results.flatMap(item=>item.status==="fulfilled"?[item.value]:[]),failed:results.filter(item=>item.status==="rejected").length});});
    return()=>controller.abort();
    // IDs are derived from this exact owner/website/scope snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectionKey,requestedIds,historyIds,data.runs.state]);
  const records=detail.key===selectionKey?detail.runs:[];
  const observations=[...completed.values()].flatMap(summary=>{const run=records.find(item=>item.id===summary.id);return run?[{run,metrics:keywordRecommendationMetrics(run)}]:[];});
  const suggestions=visibilityReport(observations.map(item=>item.run)).recommendations;
  const identified=observations.filter(item=>item.metrics.targetNamed!=="unknown");
  const appeared=identified.filter(item=>item.metrics.targetNamed==="yes").length;
  const unknown=observations.length-identified.length;
  const sourceCount=new Set(observations.flatMap(item=>item.run.answer!.citations.map(citation=>citation.url))).size;
  const cases=new Map<string,{id:string;suiteId:string;query:string}>();
  for(const suite of data.suites.items)for(const item of suite.cases)if(normalized(item.targetUrl)===target&&target!==null&&keywordSearchMode(item.searchMode)===scope)cases.set(item.id,item);
  for(const item of attempts)if(!cases.has(item.caseId))cases.set(item.caseId,{id:item.caseId,suiteId:item.suiteId,query:item.case.query});
  const pending=[...latest.values()].filter(run=>run.status==="queued"||run.status==="running").length;
  const attention=[...latest.values()].filter(run=>run.status==="requires_action").length;
  const failed=[...latest.values()].filter(run=>run.status==="failed").length;
  const cancelled=[...latest.values()].filter(run=>run.status==="cancelled").length;
  const unrun=[...cases.keys()].filter(id=>!latest.has(id)).length;
  const loading=data.runs.state==="loading"||detail.key!==selectionKey||detail.state==="loading";
  const metricsReady=data.runs.state==="ready"&&!loading;
  const selectedScans=ordered(scans.filter(scan=>normalized(scan.url)===target));
  const selectedSeo=selected?data.seo.items.filter(report=>report.domain.toLowerCase()===new URL(selected.url).hostname.toLowerCase()):[];
  const selectedSearch=selected?data.search.items.filter(report=>{
    try{return report.property.startsWith("sc-domain:")?new URL(selected.url).hostname===report.property.slice(10):selected.url.startsWith(new URL(report.property).href);}catch{return false;}
  }):[];
  const history=ordered(records.filter(run=>run.caseId===historyCase)).reverse();
  const comparableHistory=history.length>1&&history.every(run=>compareKeywordBenchmarkRuns(history[0],run).comparable);
  function select(website:string,nextScope=scope){const params=new URLSearchParams({view:"workspace",website});if(nextScope!=="open-web")params.set("scope",nextScope);window.history.pushState(null,"",`/overview?${params}`);}
  return <div className="real-overview">
    <div className="real-overview-select"><label>Selected website<select aria-label="Selected website" value={selected?.id??""} disabled={data.sites.state==="loading"} onChange={event=>select(event.target.value)}><option value="" disabled>Choose your website</option>{data.sites.items.map(site=><option key={site.id} value={site.id}>{site.name||site.url} · {site.url}</option>)}</select></label><button className="button secondary" onClick={()=>setRefresh(value=>value+1)} aria-label="Refresh saved overview"><RefreshCw size={14}/>Refresh saved data</button></div>
    {data.sites.state==="loading"&&<p role="status">Loading your saved websites…</p>}
    {data.sites.state==="error"&&<p role="alert">Your saved websites could not be loaded. Refresh to try again.</p>}
    {data.sites.state==="ready"&&!selected&&<section className="panel real-overview-empty"><h2>{data.sites.items.length?"Choose an owned website":"Add your first website"}</h2><p>{data.sites.items.length?"This website selection is unavailable for the current account.":"Your overview starts with a website saved in your workspace."}</p><Link className="button primary" href="/websites">Open My websites<ArrowRight size={14}/></Link></section>}
    {selected&&<>
      <section className="panel real-search-overview" aria-label="Saved search overview"><header><div><h2>Search observations</h2><p>{selected.url}</p></div><Link className="button primary" href={`/benchmarks?website=${encodeURIComponent(selected.id)}`}>Open search questions<ArrowRight size={14}/></Link></header>
        <div className="real-search-scopes" aria-label="Search scope"><button type="button" aria-pressed={scope==="open-web"} onClick={()=>select(selected.id,"open-web")}>Open-web observations</button><button type="button" aria-pressed={scope==="reviewed-domains"} onClick={()=>select(selected.id,"reviewed-domains")}>Reviewed documentation</button></div>
        <p className="real-overview-scope-note">{scope==="open-web"?"Astra · OpenAI web search":"Astra · Reviewed documentation"}</p>
        {data.runs.state==="error"?<p role="alert">Saved keyword history could not be loaded. No search metrics are available.</p>:<>
          {loading&&<p role="status" className="real-overview-loading">Reading saved observations…</p>}
          <dl className="real-overview-metrics"><div><dt>Appeared in answers</dt><dd>{metricsReady&&identified.length?`${Math.round(appeared/identified.length*100)}%`:"Not measured"}</dd><p>{metricsReady?`${appeared} of ${identified.length} completed answers.`:"Waiting for saved answers."}{metricsReady&&unknown>0?` ${unknown} unknown ${unknown===1?"identity is":"identities are"} excluded.`:""}</p></div><div><dt>Questions with completed answers</dt><dd>{metricsReady?observations.length:"—"}<small>{data.suites.state==="ready"?` / ${cases.size} loaded`:""}</small></dd><p>Latest completed result per question.</p></div><div><dt>Distinct cited pages</dt><dd>{metricsReady&&observations.length?sourceCount:"Not measured"}</dd><p>Distinct sources across these answers.</p></div></dl>
          {metricsReady&&<p className="real-overview-attempts" aria-label="Latest attempt states"><span>{pending} pending</span><span>{attention} need attention</span><span>{failed} failed</span><span>{cancelled} cancelled</span>{data.suites.state==="ready"&&<span>{unrun} not run</span>}</p>}
          {detail.key===selectionKey&&detail.failed>0&&<p role="alert" className="real-overview-loading">{detail.failed} completed {detail.failed===1?"record could":"records could"} not be read. The figures include only successfully loaded answers.</p>}
          {data.suites.state==="error"&&<p role="alert" className="real-overview-loading">Some question suites could not be loaded; unrun-question counts are unavailable.</p>}
          <div className="real-query-list" aria-label="Search observations by question">{[...cases.values()].map(item=>{
            const attempt=latest.get(item.id);const observation=observations.find(value=>value.run.caseId===item.id);
            return <article key={item.id}><div><h3>{observation?.run.case.query??attempt?.case.query??item.query}</h3><p>{observation?`Last completed ${date(observation.run.createdAt)}`:"No completed observation loaded"}</p>{attempt&&<small>Latest attempt: {labels[attempt.status]} · {date(attempt.createdAt)}</small>}</div><dl><div><dt>Target position</dt><dd>{observation?(observation.metrics.targetNamed==="yes"?observation.metrics.targetPositions.map(position=>`#${position}`).join(", "):observation.metrics.targetNamed==="no"?"Not listed":"Unknown"):"Not measured"}</dd></div><div><dt>Target cited</dt><dd>{observation?(observation.metrics.targetCited===true?"Yes":observation.metrics.targetCited===false?"No":"Unknown"):"Not measured"}</dd></div></dl><div className="real-query-actions">{observation&&<Link href={reportHref(observation.run)} aria-label={`Open observation for ${item.query}`}>Open answer<ArrowRight size={13}/></Link>}{attempt&&attempt.id!==observation?.run.id?<Link href={reportHref(attempt)} aria-label={`Review latest attempt for ${item.query}`}>Review latest attempt<ArrowRight size={13}/></Link>:!attempt&&<Link href={`/benchmarks?suite=${encodeURIComponent(item.suiteId)}`}>Prepare this question<ArrowRight size={13}/></Link>}</div></article>;
          })}</div>
          {!loading&&!cases.size&&data.suites.state!=="loading"&&<div className="real-overview-empty"><h3>No {scope==="open-web"?"open-web":"reviewed-documentation"} questions loaded for this website.</h3><p>Save a question suite to begin. Opening the setup will not start a run.</p></div>}
        </>}

      </section>
      {metricsReady&&<section className="real-recommendations"><h2>Recommended next steps</h2><p>Based on your saved answers. Review each source before making changes.</p>{suggestions.length?<ol>{suggestions.map(item=><li key={item.id}><h3>{item.title}</h3><p>{item.action}</p><small>{item.basis}</small><p><Link href={`/benchmarks?run=${encodeURIComponent(item.runId)}`}>Read the supporting answer →</Link></p></li>)}</ol>:<p>{observations.length?"No missing-mention or missing-citation recommendation was identified in these answers.":"Complete a search observation to get recommendations supported by its answer."}</p>}<Link href="/docs/api">Use these results through the API →</Link></section>}
      <details className="real-overview-history"><summary>Details and history<ChevronDown size={15}/></summary><p>These figures use the latest completed answer per question. A newer unfinished attempt does not replace it. Website identity uses exact host matching; unknown identities are excluded from the rate. Sources may cite other websites. These saved API observations do not measure consumer chat websites, other providers, general search rank, or product quality. Up to 20 suites and the 100 most recent account attempts are loaded.</p>{comparableHistory?<><p>Same query and matching saved execution settings. Changes are observations, not proof of cause.</p><table><caption>{history[0].case.query}</caption><thead><tr><th>Recorded</th><th>Target position</th><th>Answer</th></tr></thead><tbody>{history.map(run=>{const metrics=keywordRecommendationMetrics(run);return <tr key={run.id}><td>{date(run.createdAt)}</td><td>{metrics.targetNamed==="yes"?metrics.targetPositions.map(value=>`#${value}`).join(", "):metrics.targetNamed==="no"?"Not listed":"Unknown"}</td><td><Link href={reportHref(run)}>Open saved answer</Link></td></tr>;})}</tbody></table></>:<p>No comparable history is available in the loaded records. At least two completed observations of the same question and execution settings are needed; no trend is inferred from unrelated questions.</p>}</details>
      <section className="real-evidence-overview" aria-label="Separate website evidence"><h2>Website reports</h2><div>
        <article><h3>Technical audits</h3>{scansError?<><p>Saved audits unavailable.</p><button onClick={onRetryScans}>Retry audits</button></>:scansLoading?<p>Loading saved audits…</p>:<><strong>{selectedScans.length} saved {selectedScans.length===1?"audit":"audits"}</strong><p>{selectedScans[0]?`Latest readiness: ${selectedScans[0].seoScore}/100 · ${date(selectedScans[0].createdAt)}`:"Technical readiness has not been measured for this exact URL."}</p>{selectedScans[0]&&<button onClick={()=>onOpenScan(selectedScans[0])}>Open latest audit<ArrowRight size={13}/></button>}</>}<Link href={evaluationHref({targetUrl:selected.url})}>Evaluate this website<ArrowRight size={13}/></Link></article>
        <article><h3>Search & backlinks</h3><strong>{data.seo.state==="ready"?`${selectedSeo.length} saved reports`:data.seo.state==="loading"?"Loading…":"Unavailable"}</strong><p>Saved search and backlink estimates.</p><Link href={`/search-data?target=${encodeURIComponent(selected.url)}`}>Open saved SEO reports<ArrowRight size={13}/></Link></article>
        <article><h3>Search Console</h3><strong>{data.search.state==="ready"?`${selectedSearch.length} saved snapshots`:data.search.state==="loading"?"Loading…":"Unavailable"}</strong><p>Saved Google performance snapshots.</p><Link href={selectedSearch[0]?`/search-console?report=${encodeURIComponent(selectedSearch[0].id)}`:"/search-console"}>Open Search Console<ArrowRight size={13}/></Link></article>
      </div></section>
      <WorkspaceEvaluationSummary key={selected.id} initialTargetUrl={selected.url} filterTargetUrl={selected.url}/>
    </>}
  </div>;
}
