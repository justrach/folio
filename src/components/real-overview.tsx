"use client";

import { UiSelect } from "./ui/select";
import Link from "next/link";
import { WorkspaceEmptyArt } from "./workspace-empty-art";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, LockKeyhole, RefreshCw } from "lucide-react";
import type { Scan } from "@/lib/demo-data";
import type { SeoReportSummary } from "@/lib/seo-store";
import type { SearchConsoleReportSummary } from "@/lib/search-console-types";
import { compareKeywordBenchmarkRuns, isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkRun, type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite, type KeywordBenchmarkSuiteSummary, type KeywordSearchMode } from "@/lib/keyword-benchmark-types";
import { visibilityReport } from "@/lib/visibility";
import { keywordRecommendationMetrics } from "@/lib/keyword-search-mode";
import { evaluationHref } from "@/lib/evaluation-navigation";
import { WorkspaceEvaluationSummary } from "./workspace-evaluation-summary";
import { OverviewVisualCards } from "./overview-visual-cards";
import { OverviewQuestionControls } from "./overview-question-controls";
import { OverviewSetupGuide } from "./overview-setup-guide";
import { OverviewBrief } from "./overview-brief";
import { OverviewWindowBar, type ExportFile } from "./overview-window-bar";
import { ALL_LOADED, dailySeries, exportFilename, inWindow, toCsv, utcDay, windowBounds, windowLabel, type DateWindow } from "@/lib/overview-window";
import { filterCounts, filterQuestions, parseQuestionView, questionOutcome, QUESTION_VIEW_KEY, searchTokens, type QuestionFilter, type QuestionView } from "@/lib/overview-question-filters";
import "./real-overview.css";
import "./overview-question-controls.css";
import "./overview-window-bar.css";

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

function selectedModel(query: Pick<URLSearchParams, "getAll">): string {
  const models = query.getAll("model");
  return models.length === 1 && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(models[0]) ? models[0] : "";
}

export function workspaceOverviewHref(query: Pick<URLSearchParams, "getAll">): string {
  const params = new URLSearchParams({ view: "workspace" });
  const websites = query.getAll("website");
  if (websites.length === 1 && isKeywordBenchmarkId(websites[0])) params.set("website", websites[0]);
  const scopes = query.getAll("scope");
  if (scopes.length === 1 && scopes[0] === "reviewed-domains") params.set("scope", scopes[0]);
  const model = selectedModel(query);
  if (model) params.set("model", model);
  return `/overview?${params}`;
}

export function RealOverview({ownerId,scans,scansLoading,scansError,onRetryScans,onOpenScan}:{ownerId:string|null;scans:Scan[];scansLoading:boolean;scansError:string;onRetryScans:()=>void;onOpenScan:(scan:Scan)=>void}) {
  const query = useSearchParams();
  const signInHref = `/login?next=${encodeURIComponent(workspaceOverviewHref(query))}`;
  if(!ownerId)return <section className="panel real-overview-signin"><WorkspaceEmptyArt/><LockKeyhole size={23}/><h2>Sign in to see your website’s results</h2><p>Start with a free page check, choose your customer questions, then review the answers you collect. Your saved results stay private to your account.</p><div className="overview-setup-actions"><Link className="button primary squishy-control" href="/start">Set up my website <ArrowRight size={14}/></Link><Link className="button secondary squishy-control" href={signInHref}>Sign in to your workspace <ArrowRight size={14}/></Link><Link href="/overview?view=demo">Explore the sample demo</Link></div></section>;
  return <OwnedOverview key={ownerId} scans={scans} scansLoading={scansLoading} scansError={scansError} onRetryScans={onRetryScans} onOpenScan={onOpenScan}/>;
}

function OwnedOverview({scans,scansLoading,scansError,onRetryScans,onOpenScan}:Omit<Parameters<typeof RealOverview>[0],"ownerId">) {
  const query=useSearchParams();
  const hints=query.getAll("website");const selectedHint=hints.length===1&&isKeywordBenchmarkId(hints[0])?hints[0]:null;
  const scope:KeywordSearchMode=query.get("scope")==="reviewed-domains"?"reviewed-domains":"open-web";
  const model=selectedModel(query);
  const [data,setData]=useState<Data>(initial);
  const [refresh,setRefresh]=useState(0);
  const [questionQuery,setQuestionQuery]=useState("");
  const [questionFilters,setQuestionFilters]=useState<ReadonlySet<QuestionFilter>>(()=>new Set());
  const [questionView,setQuestionView]=useState<QuestionView>("list");
  useEffect(()=>{try{setQuestionView(parseQuestionView(localStorage.getItem(QUESTION_VIEW_KEY)));}catch{/* Storage is optional. */}},[]);
  const deferredQuery=useDeferredValue(questionQuery);
  const [dateWindow,setDateWindow]=useState<DateWindow>(ALL_LOADED);
  const [now,setNow]=useState(()=>Date.now());
  const bounds=windowBounds(dateWindow,now);
  const windowed=dateWindow.preset!=="all";
  const [pageSelection,setPageSelection]=useState({key:"",cursor:"",retry:0});
  const [coverage,setCoverage]=useState<{key:string;next:string|null;models:string[];loading:boolean;error:boolean}>({key:"",next:null,models:[],loading:false,error:false});
  const [detail,setDetail]=useState<{key:string;state:"loading"|"ready";runs:KeywordBenchmarkRun[];failed:number}>({key:"",state:"loading",runs:[],failed:0});
  const selected=hints.length?data.sites.items.find(site=>site.id===selectedHint):data.sites.items[0];
  const selectionKey=`${selected?.id??""}:${scope}:${model}:${refresh}`;
  useEffect(()=>{
    const controller=new AbortController();setData(initial());
    const load=<T,>(key:Exclude<keyof Data,"suites">,url:string,field:string,max:number) => list<T>(url,field,max,controller.signal).then(items=>{if(!controller.signal.aborted)setData(previous=>({...previous,[key]:{state:"ready",items}}));}).catch(()=>{if(!controller.signal.aborted)setData(previous=>({...previous,[key]:{state:"error",items:[]}}));});
    void load<Site>("sites","/api/sites","sites",100);

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
  const pageCursor=pageSelection.key===selectionKey?pageSelection.cursor:"";
  useEffect(()=>{
    if (!selected) return;
    const controller=new AbortController();
    setCoverage(previous=>({...previous,key:selectionKey,next:previous.key===selectionKey?previous.next:null,models:previous.key===selectionKey?previous.models:[],loading:true,error:false}));
    if(!pageCursor)setData(previous=>({...previous,runs:waiting()}));
    const params=new URLSearchParams({websiteId:selected.id,searchMode:scope});
    if(model)params.set("model",model);if(pageCursor)params.set("cursor",pageCursor);
    void read<{runs:KeywordBenchmarkRunSummary[];models?:string[];nextCursor?:string|null}>(`/api/benchmarks/runs?${params}`,controller.signal).then(page=>{
      if(!Array.isArray(page.runs)||page.runs.length>100)throw new Error("Invalid history page");
      if(controller.signal.aborted)return;
      setData(previous=>({...previous,runs:{state:"ready",items:pageCursor?[...new Map([...previous.runs.items,...page.runs].map(run=>[run.id,run])).values()]:page.runs}}));
      setCoverage({key:selectionKey,next:page.nextCursor??null,models:page.models??[],loading:false,error:false});
    }).catch(()=>{if(!controller.signal.aborted){setCoverage(previous=>({...previous,key:selectionKey,loading:false,error:true}));if(!pageCursor)setData(previous=>({...previous,runs:{state:"error",items:[]}}));}});
    return()=>controller.abort();
  },[selectionKey,pageCursor,pageSelection.retry,selected?.id,scope,model]);
  const currentCoverage=coverage.key===selectionKey?coverage:{key:selectionKey,next:null,models:[],loading:true,error:false};
  const historyComplete=data.runs.state==="ready"&&!currentCoverage.loading&&!currentCoverage.error&&currentCoverage.next===null;
  const target=normalized(selected?.url);
  const siteAttempts=ordered((coverage.key===selectionKey?data.runs.items:[]).filter(run=>run.publication==="private"&&isKeywordBenchmarkId(run.id)&&isKeywordBenchmarkId(run.caseId)&&isKeywordBenchmarkId(run.suiteId)&&normalized(run.case.targetUrl)===target&&target!==null&&keywordSearchMode(run.case.searchMode)===scope));
  const models=[...new Set([...currentCoverage.models,...siteAttempts.map(run=>run.model),...(model?[model]:[])])].sort();
  const attempts=siteAttempts.filter(run=>!model||run.model===model);
  const windowAttempts=windowed?attempts.filter(run=>inWindow(run.createdAt,bounds)):attempts;
  const windowLatest=new Map<string,KeywordBenchmarkRunSummary>();
  const windowCompleted=new Map<string,KeywordBenchmarkRunSummary>();
  for(const run of windowAttempts){if(!windowLatest.has(run.caseId))windowLatest.set(run.caseId,run);if(run.status==="completed"&&!windowCompleted.has(run.caseId))windowCompleted.set(run.caseId,run);}
  const latest=new Map<string,KeywordBenchmarkRunSummary>();
  const completed=new Map<string,KeywordBenchmarkRunSummary>();
  for(const run of attempts){if(!latest.has(run.caseId))latest.set(run.caseId,run);if(run.status==="completed"&&!completed.has(run.caseId))completed.set(run.caseId,run);}
  const requestedIds=[...new Set([...completed.values(),...windowCompleted.values()].map(run=>run.id))].sort().join(",");
  // Read each latest completed answer plus up to two prior answers for one query.
  // No overview request reconciles, cancels, starts, or returns provider tools.
  const historyCase=[...completed.keys()].find(id=>attempts.filter(run=>run.caseId===id&&run.status==="completed").length>1);
  const historySummaries=historyCase?attempts.filter(run=>run.caseId===historyCase&&run.status==="completed").slice(0,3):[];
  const historyIds=historySummaries.map(run=>run.id).join(",");
  useEffect(()=>{
    setDetail({key:selectionKey,state:"loading",runs:[],failed:0});
    if(!selected||data.runs.state!=="ready")return;
    const controller=new AbortController();
    const summaries=[...new Map([...completed.values(),...windowCompleted.values(),...historySummaries].map(run=>[run.id,run])).values()];
    void settledMap(summaries,async summary=>{
      const {run}=await read<{run:KeywordBenchmarkRun}>(`/api/benchmarks/runs/${encodeURIComponent(summary.id)}`,controller.signal);
      if(run.model!==summary.model||(model&&run.model!==model)||run.id!==summary.id||run.caseId!==summary.caseId||run.suiteId!==summary.suiteId||run.publication!=="private"||run.status!=="completed"||normalized(run.case.targetUrl)!==target||keywordSearchMode(run.case.searchMode)!==scope||!Array.isArray(run.answer?.mentions)||!Array.isArray(run.answer?.citations))throw new Error("Invalid saved observation");
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
  const windowText=windowLabel(bounds,day=>new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"}));
  const windowScans=windowed?selectedScans.filter(scan=>inWindow(scan.createdAt,bounds)):selectedScans;
  const windowCases=new Set(windowAttempts.map(run=>run.caseId));
  const questionRows=[...cases.values()].map(item=>{const attempt=(windowed?windowLatest:latest).get(item.id);const summary=(windowed?windowCompleted:completed).get(item.id);const run=records.find(value=>value.id===summary?.id);const observation=run?{run,metrics:keywordRecommendationMetrics(run)}:undefined;
    return {id:item.id,item,attempt,observation,query:observation?.run.case.query??attempt?.case.query??item.query,outcome:questionOutcome(observation?observation.metrics.targetNamed:null),needsReview:attempt?.status==="failed"||attempt?.status==="requires_action"};});
  const questionTokens=searchTokens(deferredQuery);
  const windowRows=windowed?questionRows.filter(row=>windowCases.has(row.id)):questionRows;
  const visibleQuestions=filterQuestions(windowRows,questionTokens,questionFilters);
  const host=selected?new URL(selected.url).hostname:"website";
  const today=utcDay(now);
  const exports:ExportFile[]=[
    {kind:"questions",label:"Questions shown",filename:exportFilename(host,"questions",windowed?bounds:{from:null,to:null},today),rows:visibleQuestions.length,build:()=>toCsv(["question","outcome","target_positions","target_cited","last_completed_utc","latest_attempt_status","latest_attempt_utc","model"],visibleQuestions.map(row=>[row.query,row.outcome,row.observation&&row.observation.metrics.targetNamed==="yes"?row.observation.metrics.targetPositions.join(" "):"",row.observation?(row.observation.metrics.targetCited===null?"unknown":row.observation.metrics.targetCited?"yes":"no"):"",row.observation?.run.createdAt??"",row.attempt?.status??"",row.attempt?.createdAt??"",row.observation?.run.model??row.attempt?.model??""]))},
    {kind:"attempts",label:"All attempts in window",filename:exportFilename(host,"attempts",windowed?bounds:{from:null,to:null},today),rows:windowAttempts.length,build:()=>toCsv(["recorded_utc","question","status","model"],windowAttempts.map(run=>[run.createdAt,run.case.query,run.status,run.model]))},
    {kind:"audits",label:"Audits in window",filename:exportFilename(host,"audits",windowed?bounds:{from:null,to:null},today),rows:windowScans.length,build:()=>toCsv(["recorded_utc","url","readiness_score"],windowScans.map(scan=>[scan.createdAt,scan.url,scan.seoScore]))},
  ];
  function changeView(next:QuestionView){setQuestionView(next);try{localStorage.setItem(QUESTION_VIEW_KEY,next);}catch{/* The choice still works for this tab. */}}
  function toggleFilter(key:QuestionFilter){setQuestionFilters(previous=>{const next=new Set(previous);if(!next.delete(key))next.add(key);return next;});}
  function removeToken(token:string){setQuestionQuery(previous=>searchTokens(previous).filter(value=>value!==token).map(value=>value.includes(" ")?`"${value}"`:value).join(" "));}
  function select(website:string,nextScope=scope,nextModel=model){const params=new URLSearchParams({view:"workspace",website});if(nextScope!=="open-web")params.set("scope",nextScope);if(nextModel)params.set("model",nextModel);window.history.pushState(null,"",`/overview?${params}`);}
  const setupState = data.sites.state==="error" || selected && (data.runs.state==="error" || data.suites.state==="error" || detail.key===selectionKey && detail.failed>0) ? "error" : data.sites.state==="loading" || selected && (loading || data.suites.state==="loading") ? "loading" : "ready";
  const activeAttempt=[...latest.values()].find(run=>run.status==="running"||run.status==="queued");
  const reviewAttempt=[...latest.values()].find(run=>run.status==="requires_action"||run.status==="failed");
  return <div className="real-overview">
    {!selected && !data.sites.items.length && <OverviewSetupGuide state={setupState} questions={0} answers={0} onRetry={()=>setRefresh(value=>value+1)}/>}
    {selected && <OverviewBrief
      title={setupState === "loading" ? "Reading your saved checks…" : setupState === "error" ? "Let’s recover your saved evidence." : reviewAttempt ? "One saved attempt needs a closer look." : activeAttempt ? "Your search is in progress." : observations.length ? "Your answers are ready to review." : "Let’s find out what customers hear."}
      checked={setupState !== "ready" ? "Saved search records are still being checked. Missing records are not zero results." : `${observations.length} completed answers across ${cases.size} loaded questions. ${scansLoading ? "Page audits are loading." : scansError ? "Page audits are unavailable." : `${selectedScans.length} saved page audits.`}${!historyComplete ? " Older or unreadable records may be missing." : ""}`}
      found={setupState !== "ready" ? "The summary is incomplete. Your existing records have not been changed." : `${identified.length ? `${appeared} of ${identified.length} identified answers named your site.` : "AI recommendation appearance is not measured yet."}${unknown ? ` ${unknown} ${unknown===1?"answer has":"answers have"} unknown identity.` : ""}${reviewAttempt ? " A newer attempt needs review; earlier completed answers remain available." : ""}${!scansLoading && !scansError && selectedScans[0] ? ` Latest technical readiness: ${selectedScans[0].seoScore}/100. That is a separate HTML check.` : ""}`}
      next={setupState === "error" ? "Retry reading saved records before deciding whether to run anything again." : reviewAttempt ? "Open the existing attempt to see what happened before deciding whether to retry." : activeAttempt ? "Check the existing search’s progress. No new run is needed." : observations.length ? "Read an answer and its cited sources before changing your page." : cases.size ? "Review your saved questions and run settings before collecting an answer." : "Choose one customer question you want your website to answer."}
      action={setupState === "error" ? "Retry saved setup" : setupState === "loading" ? "Loading saved records…" : reviewAttempt ? "Review search attempt" : activeAttempt ? "View search progress" : observations.length ? "Review latest answer" : cases.size ? "Review and run questions" : "Choose my questions"}
      href={setupState !== "ready" ? undefined : reviewAttempt ? reportHref(reviewAttempt) : activeAttempt ? reportHref(activeAttempt) : observations[0] ? reportHref(observations[0].run) : `/benchmarks?website=${encodeURIComponent(selected.id)}`}
      busy={setupState === "loading"} onAction={()=>setRefresh(value=>value+1)} note="Saved evidence for this website and selected scope. Opening the next step starts no paid work."
    />}

    {selected && <p className="overview-results-label"><strong>Your actual results</strong> · {selected.url} · Saved evidence only. Unmeasured results stay empty.</p>}
    {!!data.sites.items.length&&<div className="real-overview-select"><label>Selected website<UiSelect aria-label="Selected website" value={selected?.id??""} disabled={data.sites.state==="loading"} onChange={event=>select(event.target.value)}><option value="" disabled>Choose your website</option>{data.sites.items.map(site=><option key={site.id} value={site.id}>{site.name||site.url} · {site.url}</option>)}</UiSelect></label><button className="button secondary" onClick={()=>{setNow(Date.now());setRefresh(value=>value+1);}} aria-label="Refresh saved overview"><RefreshCw size={14}/>Refresh saved data</button></div>}
    {data.sites.state==="loading"&&<p role="status">Loading your saved websites…</p>}
    {data.sites.state==="error"&&<p role="alert">Your saved websites could not be loaded. Refresh to try again.</p>}
    {data.sites.state==="ready"&&!selected&&!!data.sites.items.length&&<section className="panel real-overview-empty"><h2>Choose an owned website</h2><p>This website selection is unavailable for the current account.</p><Link className="button primary" href="/websites">Open My websites<ArrowRight size={14}/></Link></section>}
    {selected&&<>
      <section className="panel real-search-overview" aria-label="Saved search overview"><header><div><h2>Search observations</h2><p>{selected.url}</p></div><Link className="button secondary" href={`/benchmarks?website=${encodeURIComponent(selected.id)}`}>Open search questions<ArrowRight size={14}/></Link></header>
        <div className="real-search-scopes" aria-label="Search scope"><button type="button" aria-pressed={scope==="open-web"} onClick={()=>select(selected.id,"open-web")}>Open-web observations</button><button type="button" aria-pressed={scope==="reviewed-domains"} onClick={()=>select(selected.id,"reviewed-domains")}>Reviewed documentation</button></div>
        <div className="real-overview-context">
        <div className="real-overview-select real-overview-scope-note"><label>Answer model<UiSelect aria-label="Answer model" value={model} onChange={event=>select(selected.id,scope,event.target.value)}><option value="">All models</option>{models.map(value=><option key={value} value={value}>{value}</option>)}</UiSelect></label></div>
        <p className="real-overview-scope-note">{scope==="open-web"?"OpenAI web search":"Reviewed documentation"} · {model||"All models"}. {model?"Only answers and attempts from this exact model are included.":"Uses the latest completed answer per question across models. This is a mixed-model summary, not a comparison between models."}</p>
        </div>
        {!cases.size&&data.suites.state==="ready"&&data.runs.state==="ready" ? <div className="real-overview-empty"><h2>Your answers will appear here.</h2><p>Choose your questions using the setup above. Once a search completes, you’ll see its answer, sources, and whether your website appeared.</p><p>A page audit measures technical readiness separately from search answers.</p></div> : data.runs.state==="error"?<p role="alert">Saved keyword history could not be loaded. No search metrics are available.</p>:<>
          {loading&&<p role="status" className="real-overview-loading">Reading saved observations…</p>}
          {metricsReady&&<OverviewWindowBar window={dateWindow} bounds={bounds} label={windowText} series={dailySeries(attempts,bounds,now)} inWindow={{questions:windowed?windowRows.length:questionRows.filter(row=>row.attempt).length,attempts:windowAttempts.length,audits:windowScans.length}} exports={exports} onChange={setDateWindow}/>}
          <details className="real-overview-metric-details"><summary>Charts and trends<ChevronDown size={15}/></summary>
          <OverviewVisualCards state={metricsReady?"ready":"loading"} named={observations.map(item=>item.metrics.targetNamed)} cited={observations.map(item=>item.metrics.targetCited)} answers={observations.map(item=>({citationUrls:item.run.answer!.citations.map(citation=>citation.url)}))} targetDomain={observations[0]?.metrics.targetDomain??(target?new URL(target).hostname.replace(/^www\./,""):null)} attempts={windowAttempts} latest={[...latest.values()].map(run=>run.status)} unrun={data.suites.state==="ready"?unrun:null} historyPartial={!historyComplete} windowNote={windowed?windowText:undefined} scans={windowScans} scansState={scansError?"error":scansLoading?"loading":"ready"}/>
          </details>
          <details className="real-overview-metric-details"><summary>Summary details<ChevronDown size={15}/></summary><dl className="real-overview-metrics"><div><dt>Appeared in answers</dt><dd>{metricsReady&&identified.length?`${Math.round(appeared/identified.length*100)}%`:"Not measured"}</dd><p>{metricsReady?`${appeared} of ${identified.length} completed answers.`:"Waiting for saved answers."}{metricsReady&&unknown>0?` ${unknown} unknown ${unknown===1?"identity is":"identities are"} excluded.`:""}</p></div><div><dt>Questions with completed answers</dt><dd>{metricsReady?observations.length:"—"}<small>{data.suites.state==="ready"?` / ${cases.size} loaded`:""}</small></dd><p>Latest completed result per question{model?" for the selected model":" across models"}.</p></div><div><dt>Distinct cited pages</dt><dd>{metricsReady&&observations.length?sourceCount:"Not measured"}</dd><p>Distinct sources across these answers.</p></div></dl></details>
          {metricsReady&&<p className="real-overview-attempts" aria-label="Latest attempt states"><span>{pending} pending</span><span>{attention} need attention</span><span>{failed} failed</span><span>{cancelled} cancelled</span>{data.suites.state==="ready"&&<span>{unrun} {historyComplete?"not run":"with no attempt loaded"}</span>}</p>}
          {detail.key===selectionKey&&detail.failed>0&&<p role="alert" className="real-overview-loading">{detail.failed} completed {detail.failed===1?"record could":"records could"} not be read. The figures include only successfully loaded answers.</p>}
          {data.suites.state==="error"&&<p role="alert" className="real-overview-loading">Some question suites could not be loaded; unrun-question counts are unavailable.</p>}
          {windowRows.length>0&&<OverviewQuestionControls query={questionQuery} tokens={questionTokens} filters={questionFilters} counts={filterCounts(windowRows)} shown={visibleQuestions.length} total={windowRows.length} scopeLabel={`${scope==="open-web"?"open-web":"reviewed documentation"}, ${model||"all models"}${historyComplete?"":", partial history"}${windowed?`, ${windowText}`:""}`} view={questionView} onQuery={setQuestionQuery} onRemoveToken={removeToken} onToggle={toggleFilter} onClear={()=>{setQuestionQuery("");setQuestionFilters(new Set());}} onView={changeView}/>}
          <div className="real-query-list" data-view={questionView} key={questionView} aria-label="Search observations by question">{visibleQuestions.map(({item,attempt,observation,query:title,outcome})=>{
            return <article key={item.id} data-outcome={outcome}><div><h3>{title}</h3><p>{observation?`Last completed ${date(observation.run.createdAt)} · ${observation.run.model}`:"No completed observation loaded"}</p>{attempt&&<small>Latest attempt: {labels[attempt.status]} · {date(attempt.createdAt)} · {attempt.model}</small>}</div><dl><div><dt>Target position</dt><dd>{observation?(observation.metrics.targetNamed==="yes"?observation.metrics.targetPositions.map(position=>`#${position}`).join(", "):observation.metrics.targetNamed==="no"?"Not listed":"Unknown"):"Not measured"}</dd></div><div><dt>Target cited</dt><dd>{observation?(observation.metrics.targetCited===true?"Yes":observation.metrics.targetCited===false?"No":"Unknown"):"Not measured"}</dd></div></dl><div className="real-query-actions">{observation&&<Link href={reportHref(observation.run)} aria-label={`Open observation for ${item.query}`}>Open answer<ArrowRight size={13}/></Link>}{attempt&&attempt.id!==observation?.run.id?<Link href={reportHref(attempt)} aria-label={`Review latest attempt for ${item.query}`}>Review latest attempt<ArrowRight size={13}/></Link>:!attempt&&<Link href={`/benchmarks?suite=${encodeURIComponent(item.suiteId)}`}>{historyComplete?"Prepare this question":"Open saved question"}<ArrowRight size={13}/></Link>}</div></article>;
          })}</div>
          {questionRows.length>0&&!visibleQuestions.length&&<div className="oqc-empty"><p>{windowRows.length?"No loaded questions match these filters.":`No loaded question has a saved attempt in ${windowText}.`}</p><button type="button" className="button secondary" onClick={()=>{setQuestionQuery("");setQuestionFilters(new Set());if(!windowRows.length)setDateWindow(ALL_LOADED);}}>{windowRows.length?"Clear filters":"Show all loaded history"}</button></div>}
          <p className="real-overview-loading" aria-label="Saved history coverage">{data.runs.state==="ready"&&coverage.key===selectionKey?data.runs.items.length:"No"} saved attempts loaded for this website, scope{model?", and model":""}. {currentCoverage.loading?"Loading saved history…":currentCoverage.error?"History is unavailable.":currentCoverage.next?"Older attempts remain; counts describe the loaded history only.":"All matching saved attempts loaded."}</p>
          {currentCoverage.error&&pageCursor&&<p role="alert">Older saved attempts could not be loaded. Your loaded answers remain available.</p>}
          {currentCoverage.next&&<button type="button" className="button secondary" disabled={currentCoverage.loading} onClick={()=>setPageSelection(previous=>({key:selectionKey,cursor:currentCoverage.next!,retry:previous.retry+1}))}>{currentCoverage.loading?"Loading older attempts…":"Load older attempts"}</button>}
          {!loading&&!cases.size&&data.suites.state!=="loading"&&<div className="real-overview-empty"><h3>No {scope==="open-web"?"open-web":"reviewed-documentation"} questions loaded for this website.</h3><p>Save a question suite to begin. Opening the setup will not start a run.</p></div>}
        </>}

      </section>
      {metricsReady&&cases.size>0&&<details className="real-recommendations"><summary>More findings to investigate</summary><p>Based on your saved answers. Review each source before making changes.</p>{suggestions.length?<ol>{suggestions.map(item=><li key={item.id}><h3>{item.title}</h3><p>{item.action}</p><small>{item.basis}</small><p><Link href={`/benchmarks?run=${encodeURIComponent(item.runId)}`}>Read the supporting answer →</Link></p></li>)}</ol>:<p>{observations.length?"No missing-mention or missing-citation recommendation was identified in these answers.":"Complete a search observation to get recommendations supported by its answer."}</p>}<Link href="/docs/api">Use these results through the API →</Link></details>}
      <details className="real-overview-history"><summary>Details and history<ChevronDown size={15}/></summary><p>These figures use the latest completed answer per question{model?" for the selected model":" across models"}. A newer unfinished attempt does not replace it. Website identity uses exact host matching; unknown identities are excluded from the rate. Sources may cite other websites. These saved API observations do not measure consumer chat websites, other providers, general search rank, or product quality. Up to 20 suites are loaded. Saved attempts are filtered by this website, scope, and selected model before pagination; use Load older attempts to include earlier history.</p>{comparableHistory?<><p>Same query and matching saved execution settings. Changes are observations, not proof of cause.</p><table><caption>{history[0].case.query}</caption><thead><tr><th>Recorded</th><th>Target position</th><th>Answer</th></tr></thead><tbody>{history.map(run=>{const metrics=keywordRecommendationMetrics(run);return <tr key={run.id}><td>{date(run.createdAt)}</td><td>{metrics.targetNamed==="yes"?metrics.targetPositions.map(value=>`#${value}`).join(", "):metrics.targetNamed==="no"?"Not listed":"Unknown"}</td><td><Link href={reportHref(run)}>Open saved answer</Link></td></tr>;})}</tbody></table></>:<p>No comparable history is available in the loaded records. At least two completed observations of the same question and execution settings are needed; no trend is inferred from unrelated questions.</p>}</details>
      <section className="real-evidence-overview" aria-label="Separate website evidence"><h2>Website reports</h2><div>
        <article><h3>Technical audits</h3>{scansError?<><p>Saved audits unavailable.</p><button onClick={onRetryScans}>Retry audits</button></>:scansLoading?<p>Loading saved audits…</p>:<><strong>{selectedScans.length} saved {selectedScans.length===1?"audit":"audits"}</strong><p>{selectedScans[0]?`Latest readiness: ${selectedScans[0].seoScore}/100 · ${date(selectedScans[0].createdAt)}`:"Technical readiness has not been measured for this exact URL."}</p>{selectedScans[0]&&<button onClick={()=>onOpenScan(selectedScans[0])}>Open latest audit<ArrowRight size={13}/></button>}</>}<Link href={evaluationHref({targetUrl:selected.url})}>Evaluate this website<ArrowRight size={13}/></Link></article>
        <article><h3>Search & backlinks</h3><strong>{data.seo.state==="ready"?`${selectedSeo.length} saved reports`:data.seo.state==="loading"?"Loading…":"Unavailable"}</strong><p>Saved search and backlink estimates.</p><Link href={`/search-data?target=${encodeURIComponent(selected.url)}`}>Open saved SEO reports<ArrowRight size={13}/></Link></article>
        <article><h3>Search Console</h3><strong>{data.search.state==="ready"?`${selectedSearch.length} saved snapshots`:data.search.state==="loading"?"Loading…":"Unavailable"}</strong><p>Saved Google performance snapshots.</p><Link href={selectedSearch[0]?`/search-console?report=${encodeURIComponent(selectedSearch[0].id)}`:"/search-console"}>Open Search Console<ArrowRight size={13}/></Link></article>
      </div></section>
      <WorkspaceEvaluationSummary key={selected.id} initialTargetUrl={selected.url} filterTargetUrl={selected.url}/>
    </>}
  </div>;
}
