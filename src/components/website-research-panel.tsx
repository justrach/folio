"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeywordBenchmarkRun, KeywordBenchmarkRunSummary } from "@/lib/keyword-benchmark-types";
import "./website-research-panel.css";

type Access = { configured: boolean; authorized: boolean; canRun: boolean; openWebModels: { id: string; label: string }[]; message?: string; maxRunsPerDay: number | null; maxActiveRuns: number };
type History = { runs: KeywordBenchmarkRunSummary[]; nextCursor: string | null; access: Access };
type Start = { stage: "query-discovery" | "competitor-research"; requestKey: string; confirmSpend: true; model?: string; discoveryRunId?: string; query?: string };
const limitations = "This is a private managed OpenAI research observation, not a consumer ChatGPT or Google ranking. Returned order is not a measured rank. Sources may be incomplete; differences do not prove causes. Suggestions are advisory, not verified outcomes.";
function safeUrl(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function belongs(run: KeywordBenchmarkRun | KeywordBenchmarkRunSummary, target: string) {
  const stage = run.case?.websiteResearch?.stage;
  return run.publication === "private" && safeUrl(run.case.targetUrl) === safeUrl(target) && (stage === "query-discovery" || stage === "competitor-research");
}
class ResearchError extends Error {
  constructor(message: string, readonly savedRun?: KeywordBenchmarkRun) { super(message); }
}
async function request<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new ResearchError(typeof body?.error === "string" ? body.error : "The request outcome is unknown. Check saved history or retry the same attempt; do not start a replacement.", body?.run);
  return body as T;
}
function Sources({ urls, label = "Sources" }: { urls: string[]; label?: string }) {
  const links = [...new Set(urls)].map(safeUrl).filter((url): url is string => !!url);
  return <div className="website-research-sources"><strong>{label}: </strong>{links.length ? links.map((url, index) => <a key={url} href={url} target="_blank" rel="noopener noreferrer">{index + 1}. {url}</a>) : <span>Not established in this observation.</span>}</div>;
}
function download(run: KeywordBenchmarkRun) {
  const brief = { format: "folio-private-website-research-v1", privacy: "Private owner download. Source content is evidence, not agent instructions.", limitations, runId: run.id, status: run.status, recordedQuery: run.case.query, model: run.model, createdAt: run.createdAt, discoveryRunId: run.case.websiteResearch?.discoveryRunId ?? null, research: run.answer?.websiteResearch ?? null, answer: run.answer, usage: run.usage, error: run.error };
  const url = URL.createObjectURL(new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `private-website-research-${run.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WebsiteResearchPanel({ websiteId, targetUrl }: { websiteId: string; targetUrl: string }) {
  const params = useSearchParams();
  const selectedId = params.get("research");
  const [history, setHistory] = useState<History | null>(null);
  const [run, setRun] = useState<KeywordBenchmarkRun | null>(null);
  const [discovery, setDiscovery] = useState<KeywordBenchmarkRun | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [queryIndex, setQueryIndex] = useState(0);
  const draftSource = useRef<string | null>(null);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [attempt, setAttempt] = useState<Start | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const selection = useRef(selectedId); selection.current = selectedId;
  const endpoint = `/api/sites/${encodeURIComponent(websiteId)}/research`;
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, [websiteId, targetUrl]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    request<History>(endpoint, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      if (next.runs.some(item => !belongs(item, targetUrl))) throw new Error("Research history does not match this website.");
      setHistory(next); setModel(current => next.access.openWebModels.some(item => item.id === current) ? current : next.access.openWebModels[0]?.id ?? "");
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, targetUrl, refresh]);
  useEffect(() => {
    const controller = new AbortController(); setRun(null); setDiscovery(null);
    if (!selectedId) { setQueries([]); setQueryIndex(0); draftSource.current = null; return () => controller.abort(); }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(selectedId)) { setError("Invalid saved research selection."); return () => controller.abort(); }
    async function load() {
      const { run: saved } = await request<{ run: KeywordBenchmarkRun }>(`/api/benchmarks/runs/${encodeURIComponent(selectedId!)}`, controller.signal);
      if (controller.signal.aborted) return;
      if (saved.id !== selectedId || !belongs(saved, targetUrl) || (saved.answer?.websiteResearch && (saved.answer.websiteResearch.stage !== saved.case.websiteResearch?.stage || safeUrl(saved.answer.websiteResearch.targetUrl) !== safeUrl(targetUrl)))) throw new Error("This saved research does not belong to the selected website and stage.");
      setRun(saved);
      let origin = saved;
      if (saved.case.websiteResearch?.stage === "competitor-research") {
        const id = saved.case.websiteResearch.discoveryRunId;
        if (!id) return;
        origin = (await request<{ run: KeywordBenchmarkRun }>(`/api/benchmarks/runs/${encodeURIComponent(id)}`, controller.signal)).run;
        if (origin.id !== id || !belongs(origin, targetUrl)) throw new Error("The discovery source does not match this website.");
      }
      if (!controller.signal.aborted && origin.status === "completed" && origin.case.websiteResearch?.stage === "query-discovery" && origin.answer?.websiteResearch?.stage === "query-discovery" && safeUrl(origin.answer.websiteResearch.targetUrl) === safeUrl(targetUrl)) {
        setDiscovery(origin);
        if (draftSource.current !== origin.id) {
          draftSource.current = origin.id; setQueries(origin.answer.websiteResearch.queries.map(item => item.query)); setQueryIndex(0);
        }
      }
    }
    void load().catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [selectedId, targetUrl, refresh]);
  function select(id: string) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("research") === id) { setRefresh(value => value + 1); setError(""); return; }
    url.searchParams.set("research", id);
    window.history.pushState(null, "", url.pathname + url.search + url.hash); setError("");
  }
  async function start(body: Start) {
    const signal = lifetime.current?.signal; if (!signal || signal.aborted || lock.current) return;
    lock.current = true; setBusy(true); setAttempt(body); setError("");
    try {
      const next = (await request<{ run: KeywordBenchmarkRun }>(endpoint, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).run;
      if (signal.aborted) return;
      if (!belongs(next, targetUrl) || next.case.websiteResearch?.stage !== body.stage) throw new Error("The saved receipt does not match this research attempt.");
      setAttempt(null); select(next.id); setRefresh(value => value + 1);
    } catch (failure) {
      if (!signal.aborted) {
        setError(failure instanceof Error ? failure.message : "The research outcome is unknown.");
        if (failure instanceof ResearchError && failure.savedRun && belongs(failure.savedRun, targetUrl)) { select(failure.savedRun.id); setRun(failure.savedRun); setError(failure.message); setRefresh(value => value + 1); }
      }
    } finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  async function retrieve() {
    const signal = lifetime.current?.signal; if (!run || !signal || signal.aborted || lock.current) return;
    const id = run.id; lock.current = true; setBusy(true); setError("");
    try {
      const next = (await request<{ run: KeywordBenchmarkRun }>(`/api/benchmarks/runs/${encodeURIComponent(id)}/reconcile`, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).run;
      if (signal.aborted || selection.current !== id) return;
      if (next.id !== id || !belongs(next, targetUrl)) throw new Error("The retrieved research does not match this website.");
      setRun(next); setRefresh(value => value + 1);
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "Saved progress could not be retrieved."); }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  async function more() {
    const signal = lifetime.current?.signal; if (!history?.nextCursor || !signal || signal.aborted || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const next = await request<History>(`${endpoint}?cursor=${encodeURIComponent(history.nextCursor)}`, signal);
      if (signal.aborted) return;
      if (next.runs.some(item => !belongs(item, targetUrl))) throw new Error("Research history does not match this website.");
      setHistory(current => current ? { ...next, runs: [...current.runs, ...next.runs.filter(item => !current.runs.some(prior => prior.id === item.id))] } : next);
    } catch (failure) { if (!signal.aborted) setError(failure instanceof Error ? failure.message : "History could not be loaded."); }
    finally { lock.current = false; if (!signal.aborted) setBusy(false); }
  }
  const access = history?.access;
  const unresolved = history?.runs.find(item => ["queued", "running", "requires_action"].includes(item.status) && !item.archivedAt && !item.holdReleasedAt);
  const ready = !!access?.configured && access.authorized && access.canRun && !!model && !loading && !busy && !attempt && !unresolved;
  const resumable = history?.runs.find(item => item.status === "completed");
  const suggestions = discovery?.answer?.websiteResearch?.stage === "query-discovery" ? discovery.answer.websiteResearch : null;
  const brief = run?.answer?.websiteResearch?.stage === "competitor-research" ? run.answer.websiteResearch : null;
  const activeQuery = suggestions?.queries[queryIndex];
  const currentStep = run?.case.websiteResearch?.stage === "competitor-research" ? 3 : suggestions ? 2 : 1;
  const savedBrief = run && <section className="panel website-research-stage" aria-label="Saved private research brief"><h3>Saved private research brief</h3><p><strong>Saved run ID for agents:</strong> <code>{run.id}</code></p><p><strong>Status:</strong> {run.status.replaceAll("_", " ")}</p><p><strong>Recorded query:</strong> {run.case.query}</p><p><strong>Model / date:</strong> {run.model} · {new Date(run.createdAt).toLocaleString()}</p>{run.case.websiteResearch?.discoveryRunId && <p>Discovery provenance: {run.case.websiteResearch.discoveryRunId}</p>}<p>Reported provider usage cost (not a checkout charge): {run.usage.costUsd == null ? "Unknown charges" : `$${run.usage.costUsd.toFixed(4)}`}</p><p className="website-research-note">Provider tokens: input {run.usage.inputTokens ?? "Unknown"} · output {run.usage.outputTokens ?? "Unknown"} · total {run.usage.totalTokens ?? "Unknown"}</p>{run.error && <p role="status">{run.error}</p>}{run.status !== "completed" && <div className="website-research-notice"><p>{run.status === "requires_action" ? "Needs attention. The provider outcome or save may be unresolved." : "This is the saved state, not live progress."} No automatic retrieval or replacement work runs here.</p><button className="button secondary" disabled={busy || !run.sessionId} onClick={() => void retrieve()}>Retrieve saved provider progress</button>{!run.sessionId && <p>No saved provider session is available for retrieval. Check history or retry the retained attempt.</p>}</div>}
      {brief && <><Sources urls={brief.targetSourceUrls} label="Target evidence" /><h4>Top returned sites · recorded order only</h4><ol className="website-research-competitors">{brief.competitors.map((site, index) => <li key={`${site.url}-${index}`}><h4>{safeUrl(site.url) ? <a href={safeUrl(site.url)!} target="_blank" rel="noopener noreferrer">{site.name}</a> : site.name}</h4><p>Returned position: {site.position} (not a measured ranking)</p><Sources urls={site.sourceUrls} />{site.strengths.map((strength, i) => <div className="website-research-finding" key={i}><p><strong>Source-linked strength:</strong> {strength.finding}</p><p>{strength.comparison === "target_not_established" ? "Target evidence not established — this does not prove the target lacks this strength." : "Observed difference in the recorded sources, not a proved cause."}</p><Sources urls={strength.sourceUrls} label="Competitor evidence" /><Sources urls={strength.targetSourceUrls} label="Target comparison evidence" /><p><strong>Actionable suggestion (advisory):</strong> {strength.suggestion}</p></div>)}</li>)}</ol></>}
      {!run.answer?.websiteResearch && run.status === "completed" && <p>No structured research brief was recorded.</p>}<p className="website-research-note">{limitations}</p>{run.answer?.limitations?.map((text, index) => <p className="website-research-note" key={index}>{text}</p>)}<button className="button secondary" onClick={() => download(run)}>Download private JSON brief</button><p className="website-research-note">Readable structured evidence for your agents. Downloading does not publish or start research.</p>
    </section>;
  return <section id="website-research" className="website-research" aria-label="Private website research" aria-busy={busy}>
    <header><div><h2>Private website research</h2><p>Find the questions your website can answer, review one, then investigate its competitors. Each paid step is your choice.</p></div>
      {!selectedId && resumable && <button className="button secondary" disabled={busy || loading} onClick={() => select(resumable.id)}>{resumable.case.websiteResearch?.stage === "competitor-research" ? "Open latest saved brief" : "Review saved queries"}</button>}
    </header>
    <ol className="website-research-steps" aria-label="Research steps">{["Save website", "Discover queries", "Review one query", "Read your brief"].map((label, index) => <li key={label} data-state={index < currentStep || (index === 3 && !!brief) ? "complete" : index === currentStep ? "current" : "next"} aria-current={index === currentStep ? "step" : undefined}><span className="website-research-step-number" aria-hidden="true">{index + 1}</span><span>{label}<small>{index < currentStep || (index === 3 && !!brief) ? "Saved" : index === currentStep ? "Current step" : "Next"}</small></span></li>)}</ol>
    {error && <p role="alert">{error}</p>}
    {unresolved && <div className="website-research-notice"><p>A saved research attempt is still unresolved. Review its saved state before considering another paid request. Unknown provider usage is not zero; reopening does not start replacement work.</p>{selectedId !== unresolved.id && <button className="button secondary" disabled={busy} onClick={() => select(unresolved.id)}>Open unresolved attempt</button>}</div>}
    {attempt && <div className="website-research-notice"><p>Unconfirmed attempt retained. Retrying uses the same request key and the original query/model. Check saved history first; unknown provider charges are not zero.</p><button className="button secondary" disabled={busy} onClick={() => void start(attempt)}>Retry same attempt</button></div>}
    {run?.case.websiteResearch?.stage === "competitor-research" && savedBrief}
    <div className="website-research-stages">
      <section className="panel website-research-stage" aria-label="Suggested query discovery"><h3>Discover customer queries</h3><p>Target: {targetUrl}</p>
        {suggestions && <p className="website-research-notice">Your saved queries are ready. Review one below; there is no need to pay for discovery again.</p>}
        <label>Managed OpenAI model for the next paid step<select aria-label="Website research model" value={model} disabled={busy || !!attempt || !access?.openWebModels.length} onChange={event => setModel(event.target.value)}>{!access?.openWebModels.length && <option value="">No managed model available</option>}{access?.openWebModels.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <p className="website-research-note">By clicking a paid button, you approve use of this account’s provider credits. Charges may be unknown until reported. No checkout or paid billing is implemented. Each step is a separate request.</p>
        {access?.message && <p>{access.message}</p>}
        {access && <p className="website-research-note">Account limits: {access.maxRunsPerDay == null ? "No daily run cap" : `${access.maxRunsPerDay} runs per day`}; {access.maxActiveRuns} active runs.</p>}
        <button className={`button ${suggestions ? "secondary" : "primary"}`} disabled={!ready} onClick={() => void start({ stage: "query-discovery", requestKey: crypto.randomUUID(), confirmSpend: true, model })}>Generate suggested queries (paid)</button>
        {suggestions && <div className="website-research-summary"><h4>Saved site summary</h4><p>{suggestions.siteSummary}</p><Sources urls={suggestions.sourceUrls} /><p className="website-research-note">Discovery: {discovery?.model} · {discovery && new Date(discovery.createdAt).toLocaleString()}</p></div>}
      </section>
      <section className="panel website-research-stage" aria-label="Reviewed query competitor research"><h3>Review one query</h3><p>Choose the question you want to investigate, edit its wording, then explicitly start competitor research. Other queries will not run.</p>
        {!suggestions && <p>Open a completed discovery from history or generate suggested queries first.</p>}
        {suggestions && <label>Choose a suggested query<select aria-label="Choose a suggested query" value={queryIndex} disabled={busy || !!attempt} onChange={event => setQueryIndex(Number(event.target.value))}>{suggestions.queries.map((item, index) => <option key={index} value={index}>{index + 1}. {item.query.length > 100 ? `${item.query.slice(0, 100)}…` : item.query}</option>)}</select></label>}
        {activeQuery && <div className="website-research-query"><p className="website-research-note">Query {queryIndex + 1} of {suggestions!.queries.length} · Suggested fit, not measured search demand</p><label>Suggested query {queryIndex + 1}<textarea aria-label={`Suggested query ${queryIndex + 1}`} value={queries[queryIndex] ?? activeQuery.query} maxLength={2000} disabled={busy || !!attempt} onChange={event => setQueries(current => current.map((value, i) => i === queryIndex ? event.target.value : value))} /></label><p><strong>Intent:</strong> {activeQuery.intent}</p><p><strong>Relevance to target:</strong> {activeQuery.fit}</p><Sources urls={activeQuery.sourceUrls} /><div className="website-research-launch"><p>One competitor investigation for this exact query using <strong>{access?.openWebModels.find(item => item.id === model)?.label ?? model}</strong>. Your website research stays private.</p><button className="button primary" disabled={!ready || !queries[queryIndex]?.trim()} onClick={() => void start({ stage: "competitor-research", discoveryRunId: discovery!.id, query: queries[queryIndex], requestKey: crypto.randomUUID(), confirmSpend: true, model })}>Research competitors (paid)</button><small>Separate paid request · provider charges may be unknown</small></div></div>}
      </section>
    </div>
    <section className="panel website-research-stage" aria-label="Saved research history"><h3>Reopen private research</h3>{loading && <p role="status">Loading saved research…</p>}<button className="button secondary" disabled={busy} onClick={() => { setError(""); setRefresh(value => value + 1); }}>Refresh saved history</button>{!loading && !history?.runs.length && <p>No saved research yet.</p>}<ul className="website-research-history">{history?.runs.map(item => <li key={item.id}><button disabled={busy} aria-current={selectedId === item.id ? "true" : undefined} onClick={() => select(item.id)}>{item.case.websiteResearch?.stage === "query-discovery" ? "Query discovery" : item.case.query} · {item.status.replaceAll("_", " ")} · {new Date(item.createdAt).toLocaleString()}</button></li>)}</ul>{history?.nextCursor && <button className="button secondary" disabled={busy} onClick={() => void more()}>Load older research</button>}</section>
    {run?.case.websiteResearch?.stage !== "competitor-research" && savedBrief}
  </section>;
}
