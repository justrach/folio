"use client";
import { KeywordPublication } from "./keyword-publication";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, CircleDashed, ExternalLink } from "lucide-react";
import { compareKeywordBenchmarkRuns, type KeywordBenchmarkRun } from "@/lib/keyword-benchmark-types";
import { keywordRecommendationMetrics } from "@/lib/keyword-search-mode";

import { PublicWebsiteComparison } from "./public-website-comparison";

const active = (run: KeywordBenchmarkRun) => ["queued", "running", "requires_action"].includes(run.status);
const statusLabel = (status: string) => ({ queued: "Queued", running: "Working", requires_action: "Needs attention", completed: "Completed", failed: "Failed", cancelled: "Cancelled" })[status] ?? status;
const date = (value: string) => new Date(value).toLocaleString();
function safeLink(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function modelLabel(run: KeywordBenchmarkRun) { return run.model === "gpt-6-astra" ? "Astra" : run.model; }
function presenceLabel(value: "yes" | "no" | "unknown") { return value === "yes" ? "Yes" : value === "no" ? "Not listed" : "Unknown"; }
function citationLabel(value: boolean | null) { return value === true ? "Yes" : value === false ? "Not cited" : "Unknown"; }

export function KeywordObservationReport({ run, baseline, busy, onRefresh, onCancel, onPrepare }: {
  run: KeywordBenchmarkRun; baseline: KeywordBenchmarkRun | null; busy: boolean;
  onRefresh: () => void; onCancel: () => void; onPrepare: () => void;
}) {
  const metrics = keywordRecommendationMetrics(run);
  const completed = run.status === "completed" && Boolean(run.answer);
  const openWeb = run.case.searchMode === "open-web";
  return <section className="panel benchmark-report" aria-label="Keyword observation">
    <header className="benchmark-report-heading"><div className="benchmark-report-kind"><span>{run.kind === "baseline" ? "Baseline observation" : "Fresh observation"}</span><span>{statusLabel(run.status)} · {date(run.createdAt)}</span></div><h2>{run.case.query}</h2><p className="benchmark-target">Your website <strong>{run.case.targetUrl ?? "No website target supplied"}</strong></p></header>
    <div className="benchmark-report-actions">
      {completed ? <button className="button primary" type="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({format:"folio-private-keyword-observation-v1",run},null,2)],{type:"application/json"}));
        const anchor = document.createElement("a"); anchor.href=url;anchor.download=`folio-keyword-${run.id}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}><ArrowDownToLine size={14}/> Download private observation</button> : <button className="button primary" type="button" disabled={busy} onClick={onRefresh}>Refresh progress</button>}
      <button className="button secondary" type="button" disabled={busy} onClick={onPrepare}>Prepare another observation <ArrowRight size={14}/></button>
      {active(run) && <button className="button secondary" type="button" disabled={busy || Boolean(run.cancelAttemptAt)} onClick={onCancel}>Cancel observation</button>}
    </div>
    {run.error && <p role="alert" className="benchmark-error">{run.error}</p>}
    {run.cancelAttemptAt && active(run) && <p role="status" className="benchmark-inline-note">Cancellation was requested; stopping is not yet confirmed.</p>}
    {completed ? <>
      <section className="benchmark-presence" aria-label="Target presence"><div><h3>Did your site appear?</h3><p>Matched by website address.</p></div><dl><div><dt>Target in recommendations</dt><dd>{presenceLabel(metrics.targetNamed)}</dd><small>{metrics.targetNamed === "yes" ? `Returned at ${metrics.targetPositions.map(value => `position ${value}`).join(", ")}` : metrics.targetNamed === "unknown" ? "Some identities could not be matched." : "No listed URL matched your site."}</small></div><div><dt>Target cited as a source</dt><dd>{citationLabel(metrics.targetCited)}</dd><small>In the returned source links.</small></div></dl></section>
      <PublicWebsiteComparison key={run.id} run={run} />
      <KeywordPublication key={`publication-${run.id}`} runId={run.id} />
      {baseline && <Comparison baseline={baseline} fresh={run}/>}
    </> : <KeywordProgress run={run}/>}

    {completed && run.answer && <div className="benchmark-evidence-layout">
      <section className="benchmark-recommendations" aria-label="Returned recommendations"><h3>Recommendations</h3><p className="benchmark-muted">Ordered as returned by Astra for this question.</p>
        {metrics.recommendations.length ? <ol>{metrics.recommendations.map(item => {
          const mention = run.answer!.mentions[item.position - 1];
          return <li key={`${item.position}-${item.name}`}><details><summary><span className="benchmark-position">{item.position}</span><span><strong>{item.name}</strong><small>{item.domain ?? "Website identity unknown"}{item.matchesTarget === true ? " · Your site" : ""}</small></span><span className="benchmark-recommendation-source-count">{item.citationUrls.length} {item.citationUrls.length === 1 ? "source" : "sources"}<ChevronDown size={14}/></span></summary><div><p>{mention.reason || "No explanation was returned for this entry."}</p>{safeLink(item.url) && <a href={safeLink(item.url)!} target="_blank" rel="noreferrer">Open listed website <ExternalLink size={12}/></a>}{item.citationUrls.length ? <ul aria-label={`Sources returned for ${item.name}`}>{item.citationUrls.map((url,index) => <li key={`${url}-${index}`}><SourceLink url={url}/></li>)}</ul> : <p className="benchmark-muted">No citations were linked to this recommendation.</p>}</div></details></li>;
        })}</ol> : <p>No product mentions were recorded.</p>}
      </section>
      <aside className="benchmark-sources" aria-label="Returned citations"><h3>Sources in the answer <span>{metrics.citationCount}</span></h3>{run.answer.citations.length ? <ol>{run.answer.citations.map((item,index) => <li key={`${item.url}-${index}`}><SourceLink url={item.url} title={item.title}/>{item.quote && <details><summary>Read returned excerpt<ChevronDown size={12}/></summary><blockquote>{item.quote}</blockquote></details>}</li>)}</ol> : <p>No citations were returned.</p>}</aside>
    </div>}
    {completed && run.answer && <details className="benchmark-disclosure benchmark-full-answer"><summary>Read the full recorded answer<ChevronDown size={15}/></summary><p className="benchmark-answer-text">{run.answer.text}</p></details>}
    <section className="benchmark-flow-section" aria-label="Observation method"><h3>Search setup for this observation</h3><ol className="benchmark-flow"><li><span>Question</span><strong>Your saved query</strong></li><li aria-hidden="true"><ArrowRight size={18}/></li><li><span>{modelLabel(run)} · OpenAI API</span><strong>{openWeb ? "OpenAI web search" : "Reviewed documentation"}</strong></li><li aria-hidden="true"><ArrowRight size={18}/></li><li><span>{completed ? "Recorded output" : "Requested output"}</span><strong>Ordered recommendations + citations</strong></li></ol><p className="benchmark-muted">{openWeb ? "OpenAI web search · no domain filter." : "Search was limited to reviewed domains. This saved run cannot establish visibility across the wider web."}</p></section>
    <section className="benchmark-coverage" aria-label="Provider coverage"><h3>Where this was measured</h3><dl><div><dt>OpenAI API · {modelLabel(run)}</dt><dd>{completed ? "Recorded answer" : "No completed answer yet"}</dd></div><div><dt>Claude · Gemini · Perplexity</dt><dd>Not connected · unmeasured</dd></div></dl><p>API observations; consumer chat websites are not measured.</p></section>
    <details className="benchmark-disclosure benchmark-method-details"><summary>Matching, evidence and run details<ChevronDown size={15}/></summary><div><p>Target matching compares returned URL hostnames after removing www and a trailing dot. It does not infer aliases or match subdomains. Missing or invalid recommendation URLs leave identity unknown; a named tool, a recommendation, and a source citation are distinct observations.</p><p>Recommendation position is only the order returned for this query and source corpus. It is not Google rank, a quality score, or proof that a website change caused an answer to change. Returned excerpts have not been independently matched against captured source text; citation presence does not establish factual or semantic support.</p>{!openWeb && <p>Reviewed domains: {run.allowedDomains.join(", ") || "Not recorded"}.</p>}{run.answer?.evidence?.length ? <><h4>Recorded evidence annotations</h4><ul>{run.answer.evidence.map(item => <li key={item.id}><strong>{item.outcome}</strong> · {item.detail}</li>)}</ul></> : null}{run.answer?.limitations?.length ? <><h4>Returned limitations</h4><ul>{run.answer.limitations.map((item,index) => <li key={index}>{item}</li>)}</ul></> : null}<p>Reported cost: {run.usage.costUsd === null ? "Not available" : `$${run.usage.costUsd.toFixed(4)}`}. Unknown cost is not zero.</p><p>Saved {date(run.createdAt)} · last updated {date(run.updatedAt)}.</p>{completed && <button className="button secondary" type="button" disabled={busy} onClick={onRefresh}>Refresh progress</button>}</div></details>
  </section>;
}

function SourceLink({url,title}:{url:string;title?:string}) { const href=safeLink(url); return href ? <a href={href} target="_blank" rel="noreferrer">{title || href}<ExternalLink size={12}/></a> : <span>{title || "Unavailable source URL"}</span>; }

function Comparison({baseline,fresh}:{baseline:KeywordBenchmarkRun;fresh:KeywordBenchmarkRun}) {
  const comparison=compareKeywordBenchmarkRuns(baseline,fresh);
  return <section className="benchmark-comparison" aria-label="Baseline comparison"><h3>What changed from the baseline?</h3><p className="benchmark-muted">{comparison.comparable ? "The recorded inputs and run settings match. These differences are observations, not proof of cause." : "The inputs or run settings differ; a direct change comparison is unavailable."}</p><div className="benchmark-answer-pair">{[{label:"Baseline",run:baseline},{label:"Fresh observation",run:fresh}].map(({label,run}) => {
    const metrics=keywordRecommendationMetrics(run);
    return <div key={label}><h4>{label}</h4><small>{date(run.createdAt)}</small><dl><div><dt>Target in recommendations</dt><dd>{presenceLabel(metrics.targetNamed)}{metrics.targetPositions.length ? ` · ${metrics.targetPositions.map(value => `position ${value}`).join(", ")}` : ""}</dd></div><div><dt>Target cited</dt><dd>{citationLabel(metrics.targetCited)}</dd></div><div><dt>Named tools</dt><dd>{metrics.recommendations.map(item=>item.name).join(", ") || "None recorded"}</dd></div><div><dt>Returned citations</dt><dd>{metrics.citationCount}</dd></div></dl></div>;
  })}</div>{comparison.comparable ? <details className="benchmark-disclosure"><summary>Citation and recommendation changes<ChevronDown size={14}/></summary><dl className="benchmark-differences"><dt>New mentions</dt><dd>{comparison.addedMentions.join(", ") || "None"}</dd><dt>Mentions no longer returned</dt><dd>{comparison.removedMentions.join(", ") || "None"}</dd><dt>Added citation URLs</dt><dd><ChangedSources urls={comparison.addedCitations}/></dd><dt>Removed citation URLs</dt><dd><ChangedSources urls={comparison.removedCitations}/></dd></dl></details> : <ul className="benchmark-muted">{comparison.reasons.map(reason => <li key={reason}>{reason.replace(/environmentFingerprint|harnessVersion|environmentType/g,"run settings").replace("surface","observation method")}</li>)}</ul>}<details className="benchmark-disclosure"><summary>Read both recorded answers<ChevronDown size={14}/></summary><div className="benchmark-answer-pair"><div><h4>Baseline answer</h4><p className="benchmark-answer-text">{baseline.answer?.text ?? "No completed answer"}</p></div><div><h4>Fresh answer</h4><p className="benchmark-answer-text">{fresh.answer?.text ?? "No completed answer"}</p></div></div></details></section>;
}
function ChangedSources({urls}:{urls:string[]}) { return urls.length ? <ul>{urls.map(url=><li key={url}><SourceLink url={url}/></li>)}</ul> : <>None</>; }

function KeywordProgress({run}:{run:KeywordBenchmarkRun}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=> {if(!active(run))return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[run.status]);
  const seconds=Math.max(0,Math.floor(((active(run)?now:Date.parse(run.updatedAt))-Date.parse(run.createdAt))/1000));
  const elapsed=Number.isFinite(seconds)?`${Math.floor(seconds/60)}m ${seconds%60}s`:"Not available";
  const steps=[{label:"Request saved",done:Boolean(run.createdAt)},{label:"Session recorded",done:Boolean(run.sessionId)},{label:"Answer recorded",done:run.status==="completed"&&Boolean(run.answer)}];
  return <section className="benchmark-progress" aria-label="Observation progress"><div><h3>{run.status==="requires_action"?"Review the saved attempt":active(run)?"Your observation is in progress":"No completed answer was recorded"}</h3><span>{active(run)?"Elapsed since request":"Elapsed to recorded outcome"}: {elapsed}</span></div><ol>{steps.map(item=><li key={item.label} data-complete={item.done}>{item.done?<Check size={15}/>:<CircleDashed size={15}/>}<span>{item.label}<small>{item.done?"Recorded":"Not recorded"}</small></span></li>)}</ol><p>{active(run)?"The answer is not available yet.":"No completed answer was recorded."} Missing observations are not a zero score.</p>{active(run)&&<p className="benchmark-muted">While this page is visible, Folio retrieves this existing task every 10 seconds and requests cancellation after its saved deadline. Closing this page stops these checks; this observation has no server-side deadline scheduler. No new observation starts automatically.</p>}</section>;
}
