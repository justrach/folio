"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { isKeywordBenchmarkBlocking, isKeywordBenchmarkId, type KeywordBenchmarkRun, type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite, type KeywordBenchmarkSuiteSummary } from "@/lib/keyword-benchmark-types";
import { KeywordObservationReport } from "./keyword-observation-report";
import { QuestionSuiteEditor } from "./question-suite-editor";
import "./keyword-benchmarks-panel.css";

type Site = { id: string; name: string; url: string };
type Template = { id: string; name: string; description?: string; cases: unknown[] };
type Access = { configured: boolean; authorized: boolean; canRun: boolean; maxRunsPerDay: number | null; maxActiveRuns: number };
type Usage = { attemptsLast24Hours: number; remainingRuns: number | null; activeRuns: number; remainingActiveRuns: number };
type Overview = { suites: KeywordBenchmarkSuiteSummary[]; templates: Template[]; access: Access; usage: Usage };
type RecoverySnapshot = { recovery: { runId: string; sessionId: string | null }; run: KeywordBenchmarkRun; receivedAt: string };
class KeywordRecoveryError extends Error {
  constructor(message: string, readonly snapshot: RecoverySnapshot) { super(message); this.name = "KeywordRecoveryError"; }
}
const active = isKeywordBenchmarkBlocking;
const statusLabel = (status: string) => ({ queued: "Queued", running: "Working", requires_action: "Needs attention", completed: "Completed", failed: "Failed", cancelled: "Cancelled" })[status] ?? status;
const date = (value: string) => new Date(value).toLocaleString();
function safeLink(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function request<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (response.status === 503 && body?.recovery && body?.run?.publication === "private" &&
    isKeywordBenchmarkId(body.recovery.runId) && body.run.id === body.recovery.runId &&
    isKeywordBenchmarkId(body.run.suiteId) && isKeywordBenchmarkId(body.run.caseId) &&
    (body.recovery.sessionId === null || typeof body.recovery.sessionId === "string") && body.run.sessionId === body.recovery.sessionId) {
    throw new KeywordRecoveryError(typeof body.error === "string" ? body.error : "The latest outcome could not be saved.", {
      recovery: { runId: body.recovery.runId, sessionId: body.recovery.sessionId }, run: body.run, receivedAt: new Date().toISOString(),
    });
  }
  if (!response.ok || !body) throw new Error(body?.error ?? "This request could not be confirmed. Refresh the saved state before trying again.");
  return body as T;
}

export function KeywordBenchmarksPanel({ targetUrl, websiteId, basePath = "/benchmarks" }: { targetUrl?: string; websiteId?: string; basePath?: "/benchmarks" | "/evaluations" }) {
  const { data: session, isPending } = useSession();
  const query = useSearchParams();
  const returnParams = new URLSearchParams();
  for (const key of ["suite", "run", "website"]) {
    const values = query.getAll(key);
    if (values.length === 1 && isKeywordBenchmarkId(values[0])) returnParams.set(key, values[0]);
  }
  if (basePath === "/evaluations") returnParams.set("view", "search");
  const returnTo = `${basePath}${returnParams.size ? `?${returnParams}` : ""}`;
  if (isPending) return <p role="status" className="benchmark-loading">Loading your workspace…</p>;
  if (!session?.user.id) return <section className="panel benchmark-empty"><h2>Your keyword observations stay private.</h2><p>Sign in to use a saved website, choose questions, and compare recorded answers.</p><Link className="button primary" href={`/login?next=${encodeURIComponent(returnTo)}`}>Sign in to your workspace <ArrowRight size={14}/></Link></section>;
  return <OwnedBenchmarks key={session.user.id} targetUrl={targetUrl} websiteId={websiteId} basePath={basePath}/>;
}

function OwnedBenchmarks({ targetUrl, websiteId, basePath }: { targetUrl?: string; websiteId?: string; basePath: "/benchmarks" | "/evaluations" }) {
  const query = useSearchParams();
  const suiteHint = query.get("suite");
  const runHint = query.get("run");
  const targetHint = safeLink(targetUrl ?? query.get("target"));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [suite, setSuite] = useState<KeywordBenchmarkSuite | null>(null);
  const [automaticSuiteId, setAutomaticSuiteId] = useState("");
  const [automaticSuiteContext, setAutomaticSuiteContext] = useState<string | null>(null);
  const appliedSiteContext = useRef<string | null>(null);
  const [runs, setRuns] = useState<KeywordBenchmarkRunSummary[]>([]);
  const [run, setRun] = useState<KeywordBenchmarkRun | null>(null);
  const [baseline, setBaseline] = useState<KeywordBenchmarkRun | null>(null);
  const [baselineChoices, setBaselineChoices] = useState<Record<string, string>>({});
  const [seoCase, setSeoCase] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recovery, setRecovery] = useState<RecoverySnapshot | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [caseChoice, setCaseChoice] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [customQuestionsOpen, setCustomQuestionsOpen] = useState(false);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const pendingAction = useRef(false);
  const retrievalLock = useRef(false);
  const selectedKey = useRef("");
  const targetContext = websiteId ? `website:${websiteId}` : targetHint ? `target:${targetHint}` : "";
  const suiteId = isKeywordBenchmarkId(suiteHint) ? suiteHint : suiteHint === null && automaticSuiteContext === targetContext ? automaticSuiteId : "";
  const runId = isKeywordBenchmarkId(runHint) ? runHint : "";
  selectedKey.current = `${suiteId}/${runId}`;
  const currentSuite = suite?.id === suiteId ? suite : null;
  const currentRun = run?.id === runId && run.suiteId === suiteId ? run : null;
  const site = sites.find(item => item.id === siteId);
  const ready = Boolean(!recovery && overview?.access.canRun && (overview.usage.remainingRuns === null || overview.usage.remainingRuns > 0) && overview.usage.remainingActiveRuns > 0 && !runs.some(active));

  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([request<Overview>("/api/benchmarks", controller.signal), request<{sites: Site[]}>("/api/sites", controller.signal)])
      .then(async ([next, owned]) => {
        if (controller.signal.aborted) return;
        setOverview(next); setSites(owned.sites);
        setTemplateId(current => next.templates.some(item => item.id === current) ? current : next.templates[0]?.id ?? "");
        const requestedSite = owned.sites.find(item => websiteId ? item.id === websiteId : targetHint && safeLink(item.url) === targetHint);
        const followContext = appliedSiteContext.current !== targetContext;
        appliedSiteContext.current = targetContext;
        setSiteId(current => followContext && targetContext ? requestedSite?.id ?? "" : owned.sites.some(item => item.id === current) ? current : requestedSite?.id ?? (owned.sites.length === 1 ? owned.sites[0].id : ""));
        setAutomaticSuiteContext(targetContext);
        if (!websiteId && !targetHint) setAutomaticSuiteId(next.suites[0]?.id ?? "");
        else if (suiteHint === null) {
          setAutomaticSuiteId("");
          if (requestedSite) {
            const candidates = await Promise.allSettled(next.suites.map(item => request<{suite:KeywordBenchmarkSuite}>(`/api/benchmarks/${encodeURIComponent(item.id)}`, controller.signal)));
            if (controller.signal.aborted) return;
            const match = candidates.find((value,index) => value.status === "fulfilled" && value.value.suite.id === next.suites[index].id && value.value.suite.cases.length > 0 && value.value.suite.cases.every(item => safeLink(item.targetUrl) === safeLink(requestedSite.url)));
            setAutomaticSuiteId(match?.status === "fulfilled" ? match.value.suite.id : "");
          }
        }
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [refresh, targetHint, websiteId, suiteHint]);

  useEffect(() => {
    setSuite(null); setRuns([]); setBaselineChoices({});
    if (!suiteId) return;
    const controller = new AbortController();
    let reading = false;
    let hasActive = false;
    async function load() {
      if (reading || document.visibilityState === "hidden") return;
      reading = true;
      try {
        const [detail, history] = await Promise.all([
          request<{suite:KeywordBenchmarkSuite}>(`/api/benchmarks/${encodeURIComponent(suiteId)}`, controller.signal),
          request<{runs:KeywordBenchmarkRunSummary[]}>(`/api/benchmarks/runs?suiteId=${encodeURIComponent(suiteId)}`, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        if (detail.suite.id !== suiteId || history.runs.some(item => item.suiteId !== suiteId || item.publication !== "private")) throw new Error("The saved observations do not match this suite.");
        setSuite(detail.suite); setRuns(history.runs); hasActive = history.runs.some(active);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Saved observations could not be loaded."); }
      finally { reading = false; }
    }
    void load();
    const timer = window.setInterval(() => { if (hasActive) void load(); }, 10_000);
    const visible = () => { if (hasActive) void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [suiteId, refresh]);

  useEffect(() => {
    setRun(null); setBaseline(null);
    if (!runId || !suiteId) return;
    const controller = new AbortController();
    let reading = false;
    let keepPolling = false;
    async function load(reconcile = false) {
      if (reading || document.visibilityState === "hidden" || (reconcile && (pendingAction.current || retrievalLock.current))) return;
      reading = true;
      if (reconcile) retrievalLock.current = true;
      try {
        const { run: next } = await request<{run:KeywordBenchmarkRun}>(`/api/benchmarks/runs/${encodeURIComponent(runId)}${reconcile ? "/reconcile" : ""}`, controller.signal, reconcile ? {method:"POST",headers:{"Content-Type":"application/json"},body:"{}"} : undefined);
        if (controller.signal.aborted) return;
        if (next.id !== runId || next.suiteId !== suiteId || next.publication !== "private") throw new Error("This observation does not match the selected suite.");
        setRun(current => current?.id === next.id && current.revision > next.revision ? current : next);
        if (keepPolling && !active(next)) setRefresh(value => value + 1);
        keepPolling = active(next);
        if (next.baselineRunId) {
          const previous = await request<{run:KeywordBenchmarkRun}>(`/api/benchmarks/runs/${encodeURIComponent(next.baselineRunId)}`, controller.signal);
          if (!controller.signal.aborted && previous.run.id === next.baselineRunId && previous.run.suiteId === suiteId && previous.run.caseId === next.caseId && previous.run.publication === "private") setBaseline(previous.run);
        }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "This observation could not be loaded."); }
      finally { reading = false; if (reconcile) retrievalLock.current = false; }
    }
    void load();
    const timer = window.setInterval(() => { if (keepPolling) void load(true); }, 10_000);
    const visible = () => { if (keepPolling) void load(true); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [runId, suiteId, refresh]);

  function select(nextSuite: string, nextRun?: string) {
    const params = new URLSearchParams({ suite: nextSuite });
    if (basePath === "/evaluations") params.set("view", "search");
    if (nextRun) { params.set("run", nextRun); setSettingsOpen(false); }
    setCaseChoice("");
    window.history.pushState(null, "", `${basePath}?${params}`);
    setError(""); setNotice("");
  }
  async function action(name: string, work: (signal: AbortSignal) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pendingAction.current) return;
    if (retrievalLock.current && (name === "reconcile" || name === "cancel")) { setNotice("Progress is already being retrieved. Try again when the saved state updates."); return; }
    pendingAction.current = true; setBusy(name); setError(""); setNotice("");
    try { await work(signal); }
    catch (failure) {
      if (!signal.aborted) {
        if (failure instanceof KeywordRecoveryError) setRecovery(failure.snapshot);
        setError(failure instanceof Error ? failure.message : "This action could not be confirmed.");
      }
    }
    finally { pendingAction.current = false; if (!signal.aborted) setBusy(""); }
  }
  function start(caseId: string, kind: "baseline" | "fresh", baselineRunId?: string) {
    if (!ready || runs.some(item => item.caseId === caseId && item.holdReleasedAt && item.status === "requires_action" && !item.sessionId)
      || (kind === "fresh" && !baselineRunId)) return;
    void action(`start-${caseId}`, async signal => {
      const result = await request<{run:KeywordBenchmarkRun}>("/api/benchmarks/runs", signal, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({caseId,kind,...(seoCase === `${suiteId}/${caseId}` ? {useSeoTools:true} : {}),...(baselineRunId ? {baselineRunId} : {})}) });
      if (signal.aborted) return;
      if (result.run.suiteId !== suiteId || result.run.caseId !== caseId || result.run.publication !== "private") throw new Error("The returned observation does not match this question.");
      select(result.run.suiteId, result.run.id); setRun(result.run); setRefresh(value => value + 1);
      setNotice("Observation saved. Its progress and answer stay in your private history.");
    });
  }
  function refreshRun(kind: "reconcile" | "cancel") {
    if (!currentRun) return;
    const selected = currentRun;
    void action(kind, async signal => {
      const result = await request<{run:KeywordBenchmarkRun}>(`/api/benchmarks/runs/${encodeURIComponent(selected.id)}/${kind}`, signal, { method:"POST", headers:{"Content-Type":"application/json"}, body:"{}" });
      if (signal.aborted || selectedKey.current !== `${selected.suiteId}/${selected.id}`) return;
      if (result.run.id !== selected.id || result.run.suiteId !== selected.suiteId || result.run.publication !== "private") throw new Error("The returned observation does not match this selection.");
      setRun(result.run); setRefresh(value => value + 1);
      setNotice(kind === "cancel" && active(result.run) ? "Cancellation requested. The run is not yet confirmed as stopped." : "Saved progress updated.");
    });
  }
  const selectedCase = currentSuite?.cases.find(item => item.id === caseChoice) ?? currentSuite?.cases.find(item => item.id === currentRun?.caseId) ?? currentSuite?.cases[0];
  const selectedCaseUnresolved = runs.some(item => item.caseId === selectedCase?.id && item.holdReleasedAt && item.status === "requires_action" && !item.sessionId);
  const baselines = runs.filter(item => item.caseId === selectedCase?.id && item.kind === "baseline" && item.status === "completed");
  const baselineId = selectedCase && baselines.some(item => item.id === baselineChoices[selectedCase.id]) ? baselineChoices[selectedCase.id] : baselines[0]?.id ?? "";
  const caseRuns = (caseId: string) => runs.filter(item => item.caseId === caseId);
  const answeredQuestions = currentSuite?.cases.filter(item => caseRuns(item.id).some(value => value.status === "completed")).length ?? 0;
  const attentionQuestions = currentSuite?.cases.filter(item => ["requires_action", "failed"].includes(caseRuns(item.id)[0]?.status ?? "")).length ?? 0;
  const selectedTemplate = overview?.templates.find(item => item.id === templateId);
  return <div className="benchmark-workspace">
    {error && <p className="benchmark-error" role="alert">{error}</p>}
    {recovery && <section className="panel benchmark-recovery" aria-label="Unsaved observation recovery"><h2>Keep this private recovery snapshot</h2><p>The latest returned state could not be saved. This snapshot is held only in this browser view; it is not a confirmed saved report. Download it before leaving.</p><p>The task may already be running and incurring charges. Do not start a replacement. The saved reservation may contain an earlier state; the download preserves the returned recovery identifiers and candidate outcome.</p><div className="benchmark-actions"><button className="button primary" type="button" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({format:"folio-private-keyword-recovery-v1",persisted:false,...recovery},null,2)],{type:"application/json"}));
      const anchor = document.createElement("a"); anchor.href=url; anchor.download=`folio-keyword-recovery-${recovery.recovery.runId}.json`; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}><ArrowDownToLine size={14}/> Download private recovery snapshot</button><button className="button secondary" type="button" onClick={() => select(recovery.run.suiteId,recovery.recovery.runId)}>Open saved reservation</button></div></section>}
    {notice && <p className="benchmark-notice" role="status">{notice}</p>}
    {(suiteHint && !isKeywordBenchmarkId(suiteHint)) || (runHint && !isKeywordBenchmarkId(runHint)) ? <p role="alert">This saved-observation link is invalid. Choose a suite below.</p> : null}
    <nav className="benchmark-notebook" aria-label="Keyword notebook"><div className="benchmark-notebook-heading">
      {overview?.suites.length ? <label>Keyword suite<select value={suiteId} disabled={!!busy} onChange={event => select(event.target.value)}><option value="" disabled>Choose a saved suite</option>{overview.suites.map(item => <option key={item.id} value={item.id}>{item.name} · {item.caseCount} questions</option>)}</select></label> : <p>{overview ? "Save a suite to begin." : "Loading your saved suites…"}</p>}
      <button type="button" className="benchmark-refresh" disabled={!!busy} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh saved history"><RefreshCw size={15}/></button>
    </div>{runs.length > 0 && <div className="benchmark-history" aria-label="Saved keyword observations">{runs.map(item => <button key={item.id} type="button" disabled={!!busy} aria-pressed={item.id === runId} aria-label={`Open ${item.kind} observation for ${item.case.query}`} onClick={() => select(item.suiteId,item.id)}><strong>{item.case.query}</strong><span>{item.kind === "baseline" ? "Baseline" : "Fresh"} · {statusLabel(item.status)} · {date(item.createdAt)}</span></button>)}</div>}</nav>
    {overview?.suites.length && !suiteId && !runId ? <p className="benchmark-muted">Choose a saved suite. No suite was selected automatically for this website.</p> : null}
    {runId && !currentRun && <p role="status" className="benchmark-loading">Opening saved observation…</p>}
    {currentRun && <KeywordObservationReport run={currentRun} baseline={baseline} busy={!!busy} onRefresh={() => refreshRun("reconcile")} onCancel={() => refreshRun("cancel")} onPrepare={() => {setSettingsOpen(true); requestAnimationFrame(() => {settingsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}); settingsRef.current?.querySelector("summary")?.focus();});}}/>}
    {currentSuite && <details ref={settingsRef} className="panel benchmark-question-settings" open={!runId || settingsOpen} onToggle={event => { if (runId) setSettingsOpen(event.currentTarget.open); }}><summary>{runId ? "Questions and run settings" : "Choose a question to observe"}<ChevronDown size={16}/></summary><section className="benchmark-cases" aria-label="Keyword questions">
      <p className="benchmark-question-coverage">{answeredQuestions} of {currentSuite.cases.length} questions have a completed answer{attentionQuestions > 0 ? ` · ${attentionQuestions} latest ${attentionQuestions === 1 ? "attempt needs" : "attempts need"} attention` : ""}.</p>
      <div className="benchmark-question-list" aria-label="Saved questions">{currentSuite.cases.map(item => <button key={item.id} type="button" aria-label={item.query} aria-pressed={item.id===selectedCase?.id} onClick={() => setCaseChoice(item.id)}>{item.query}<span className="question-result-state">{caseRuns(item.id)[0] ? statusLabel(caseRuns(item.id)[0].status) : "Draft · not started"}</span></button>)}</div>
      {selectedCase && <div className="benchmark-selected-question"><h2>{selectedCase.query}</h2><p className="benchmark-muted">{selectedCase.targetUrl ?? "No website target"} · {selectedCase.language} · {selectedCase.locale}</p><p className="benchmark-muted">{selectedCase.searchMode === "open-web" ? "Search scope: open web" : "Search scope: reviewed documentation"}. The recorded answer is private.</p>
        {selectedCase.searchMode === "open-web" && selectedCase.targetUrl && <label><input type="checkbox" checked={seoCase === `${suiteId}/${selectedCase.id}`} disabled={!!busy} onChange={event => setSeoCase(event.target.checked ? `${suiteId}/${selectedCase.id}` : "")}/> Let this agent look up search and backlinks for this website. Allows one additional paid DataForSEO overview; repeated tool calls reuse it.</label>}
        {baselines.length > 0 && <label>Baseline for {selectedCase.query}<select value={baselineId} onChange={event => setBaselineChoices(value => ({...value,[selectedCase.id]:event.target.value}))}>{baselines.map(item => <option value={item.id} key={item.id}>{date(item.createdAt)}</option>)}</select></label>}
        <div className="benchmark-actions"><button className="button secondary" type="button" disabled={!ready || selectedCaseUnresolved || !!busy} onClick={() => start(selectedCase.id,"baseline")}>Run baseline</button><button className="button primary" type="button" disabled={!ready || selectedCaseUnresolved || !baselineId || !!busy} onClick={() => start(selectedCase.id,"fresh",baselineId)}>Run fresh observation</button></div>
        {selectedCaseUnresolved && <p className="benchmark-muted">This question has an unresolved earlier attempt. Choose a different question while it is reviewed.</p>}
        {!baselineId && <p className="benchmark-muted">A completed baseline is needed before a fresh comparison.</p>}
      </div>}
      {overview && <p className="benchmark-run-allowance">{overview.access.canRun ? `${overview.usage.remainingRuns === null ? "No daily limit" : `${overview.usage.remainingRuns} runs remaining in the rolling 24-hour allowance`}. ${overview.usage.activeRuns} active.` : "New agent runs are not currently available for this workspace. Saved observations remain readable."} Each explicit start can incur usage charges. Only one observation can be active at a time.</p>}
    </section></details>}
    {overview && <details className="benchmark-disclosure benchmark-new-suite" open={!overview.suites.length}><summary>Save a new question suite<ChevronDown size={15}/></summary>
    <section className="benchmark-setup" aria-label="Save a keyword suite"><h2>Use an existing website</h2><p>Choose a website already saved in your workspace. Saving questions starts no agent work.</p>
      <div className="benchmark-fields"><label>Saved website<select value={siteId} onChange={event => setSiteId(event.target.value)} disabled={!!busy}><option value="">Choose a saved website</option>{sites.map(item => <option key={item.id} value={item.id}>{item.name || item.url} · {item.url}</option>)}</select></label>
      <label>Question template<select value={templateId} onChange={event => setTemplateId(event.target.value)} disabled={!!busy || !overview}><option value="">Choose questions</option>{overview?.templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {site && <p className="benchmark-muted">Target: {site.url}</p>}
      {!customQuestionsOpen && <button className="button secondary" type="button" disabled={!site || !templateId || !!busy} onClick={() => void action("save", async signal => {
        const result = await request<{suite:KeywordBenchmarkSuite}>("/api/benchmarks", signal, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({templateId,websiteId:site!.id})});
        if (signal.aborted) return; select(result.suite.id); setSuite(result.suite); setRefresh(value => value + 1); setNotice("Keyword suite saved. Choose a question to start its baseline when ready.");
      })}>{busy === "save" && <Loader2 size={14}/>} Save keyword suite</button>}
      {!customQuestionsOpen && <button className="benchmark-custom-toggle" type="button" disabled={!site || !!busy} onClick={() => setCustomQuestionsOpen(true)}>Write or edit these questions</button>}
      {customQuestionsOpen && site && <QuestionSuiteEditor key={`${site.id}-${templateId}`} websiteId={site.id}
        initialName={selectedTemplate?.name ?? `${site.name || "Website"} questions`}
        initialQuestions={selectedTemplate?.cases.flatMap(item => item && typeof item === "object" && "query" in item && typeof item.query === "string" ? [item.query] : []) ?? []}
        busy={!!busy} onCancel={() => setCustomQuestionsOpen(false)} onSave={async input => {
          await action("save-custom", async signal => {
            const result = await request<{ suite: KeywordBenchmarkSuite }>("/api/benchmarks", signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
            if (signal.aborted) return;
            select(result.suite.id); setSuite(result.suite); setRefresh(value => value + 1); setCustomQuestionsOpen(false);
            setNotice("Questions saved. No observation has been started.");
          });
        }}/>}
      {overview && !sites.length && <p>No saved websites are available in this account. <Link href="/websites">Open My websites</Link>.</p>}
    </section>
    </details>}
    <p className="benchmark-footer-note">Saved observations belong to this account. Opening, selecting or comparing them starts no new agent work.</p>
  </div>;
}
