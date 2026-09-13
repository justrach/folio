"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowDownToLine, ArrowRight, Check, Globe, Loader2, Search, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { SearchConsoleProperty, SearchConsoleReport, SearchConsoleReportSummary, SearchConsoleRow } from "@/lib/search-console-types";
import "./search-console.css";

type Connection = { configured: boolean; signedIn: boolean; connected: boolean; message: string };

async function readJson<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error.slice(0,500) : "Search Console is unavailable. Please try again.");
  return data as T;
}

function focusReport(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}

export function SearchConsolePanel() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <div className="gsc-loading" role="status"><Loader2 className="spin" size={18} /> Loading your connection…</div>;
  // Remount every owner-bound request and selection, including on logout.
  return <OwnerSearchConsole key={session?.user.id ?? "signed-out"} ownerId={session?.user.id ?? null} />;
}

function OwnerSearchConsole({ ownerId }: { ownerId: string | null }) {
  const router = useRouter();
  const query = useSearchParams();
  const selectedId = query.get("report") ?? "";
  const [connection, setConnection] = useState<Connection | null>(null);
  const [properties, setProperties] = useState<SearchConsoleProperty[]>([]);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [property, setProperty] = useState("");
  const [reports, setReports] = useState<SearchConsoleReportSummary[]>([]);
  const [report, setReport] = useState<SearchConsoleReport | null>(null);
  const [error, setError] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportRefresh, setReportRefresh] = useState(0);
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const actionPending = useRef(false);
  const reportElement = useRef<HTMLElement | null>(null);
  const focusRequestedFor = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const cancelFocus = () => { focusRequestedFor.current = null; };
    window.addEventListener("popstate", cancelFocus);
    return () => {
      controller.abort();
      window.removeEventListener("popstate", cancelFocus);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    readJson<Connection>("/api/search-console",controller.signal).then(data => { if (!controller.signal.aborted) setConnection(data); }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    if (ownerId) readJson<{reports:SearchConsoleReportSummary[]}>("/api/search-console/reports",controller.signal)
      .then(data => { if (!controller.signal.aborted) setReports(data.reports); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [ownerId, refresh]);

  useEffect(() => {
    setReport(null);
    setReportError("");
    if (!ownerId || !selectedId) { setReading(false); return; }
    const controller = new AbortController();
    setReading(true);
    readJson<{report:SearchConsoleReport}>(`/api/search-console/reports/${encodeURIComponent(selectedId)}`,controller.signal)
      .then(data => { if (!controller.signal.aborted) setReport(data.report); })
      .catch(error => { if (!controller.signal.aborted) setReportError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [ownerId, selectedId, reportRefresh]);

  useEffect(() => {
    if (report?.id !== selectedId || focusRequestedFor.current !== selectedId) return;
    focusReport(reportElement.current);
    focusRequestedFor.current = null;
  }, [report, selectedId]);

  function selectReport(id: string) {
    if (report?.id === id && selectedId === id) {
      focusReport(reportElement.current);
      return;
    }
    focusRequestedFor.current = id;
    if (selectedId === id) {
      // A failed read can be retried without adding an identical history entry.
      if (!reading) setReportRefresh(value => value + 1);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("report",id);
    window.history.pushState(null,"",url.pathname+url.search);
  }

  async function action(name: string, work: (signal: AbortSignal) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || actionPending.current) return;
    actionPending.current = true;
    setBusy(name); setError("");
    try { await work(signal); }
    catch (error) { if (!signal.aborted) setError(error instanceof Error ? error.message : "This action could not be completed."); }
    finally { actionPending.current = false; if (!signal.aborted) setBusy(""); }
  }

  async function connect() {
    await action("connect", async signal => {
      const result = ownerId
        ? await authClient.linkSocial({ provider:"google", scopes:["https://www.googleapis.com/auth/webmasters.readonly"], callbackURL:"/api/search-console/finish", additionalParams:{prompt:"consent",access_type:"offline"} })
        : await authClient.signIn.social({provider:"google",callbackURL:"/search-console"});
      if (!signal.aborted && result.error) throw new Error(result.error.message ?? "Google could not be connected.");
    });
  }

  const visibleReport = ownerId && report?.id === selectedId ? report : null;
  return <div className="gsc-workspace">
    <section className="panel gsc-connection">
      <div className="panel-heading gsc-connection-heading"><h2>Google Search Console</h2><span className={`status-pill ${connection?.connected ? "pass" : ""}`}>{connection?.connected ? "Connected" : connection ? "Not connected" : "Checking connection…"}</span></div>
      <div className="gsc-body">
        <ol className="gsc-steps" aria-label="Search Console setup">
          <li aria-current={!ownerId ? "step" : undefined} data-complete={!!ownerId}><span>{ownerId ? <Check size={16}/> : "1"}</span>Sign in</li>
          <li aria-current={ownerId && !connection?.connected ? "step" : undefined} data-complete={!!connection?.connected}><span>{connection?.connected ? <Check size={16}/> : "2"}</span>Connect Google</li>
          <li aria-current={connection?.connected ? "step" : undefined}><span>3</span>Import website</li>
        </ol>
        <div className="gsc-setup-intro">
          <div className="gsc-setup-icon" aria-hidden="true">{connection?.connected ? <Globe size={30}/> : <Search size={30}/>}</div>
          <div><h3>{!ownerId ? "Your search traffic, in one place" : connection?.connected ? "Choose your website" : "Connect your Google account"}</h3>
          <p>{!ownerId ? "Sign in to bring your Google search data into Folio." : connection?.connected ? "Select a Search Console property, then import its last 28 days." : "Allow read-only access to see your website’s search performance."}</p></div>
        </div>
        {connection?.message && (!connection.configured || connection.message.startsWith("Disconnected")) && <p className="gsc-muted">{connection.message}</p>}
        {query.get("connected") === "google" && connection?.connected && <p className="gsc-notice" role="status"><Check size={16}/> Google Search Console is connected.</p>}
        {query.get("error") && <p className="gsc-error" role="alert">Google connection was not completed. Try connecting again with the same Google account and allow read-only Search Console access.</p>}
        {error && <p className="gsc-error" role="alert">{error}</p>}
        <div className="gsc-actions">
          {connection?.configured && !connection.connected && <button className="button primary" type="button" disabled={!!busy} onClick={connect}>{busy === "connect" ? <Loader2 size={16} className="spin"/> : <ArrowRight size={16}/>} {ownerId ? "Connect Google Search Console" : "Sign in with Google"}</button>}
          {!ownerId && <Link href="/login?next=%2Fsearch-console" className="button secondary">Sign in with email</Link>}
          {ownerId && connection?.connected && <>
            <button className="button primary" type="button" disabled={!!busy} onClick={() => action("properties",async signal => {
              const data = await readJson<{properties:SearchConsoleProperty[]}>("/api/search-console/properties",signal);
              if (signal.aborted) return;
              setProperties(data.properties); setPropertiesLoaded(true);
              setProperty(current => data.properties.some(p=>p.siteUrl===current) ? current : data.properties[0]?.siteUrl ?? "");
            })}>{busy === "properties" && <Loader2 size={16} className="spin"/>} Load Search Console properties</button>
            <details className="gsc-access"><summary>Manage access</summary><p>Disconnecting removes Folio’s stored tokens. Your Google identity and saved reports remain.</p><button className="button secondary" type="button" disabled={!!busy} onClick={() => action("disconnect",async signal => {
              await readJson("/api/search-console/connection",signal,{method:"DELETE"});
              if (signal.aborted) return;
              setProperties([]); setPropertiesLoaded(false); setProperty("");
              setConnection(current=>current ? {...current,connected:false,message:"Disconnected from Search Console. Your saved reports are still available."} : null);
            })}>Disconnect Search Console</button></details>
          </>}
          {error && <button className="button secondary" type="button" onClick={()=>{setError("");setRefresh(n=>n+1);}}>Retry connection</button>}
        </div>
        {ownerId && connection?.connected && propertiesLoaded && <form className="gsc-import" onSubmit={event => {
          event.preventDefault();
          if (!property) return;
          void action("import",async signal => {
            const data = await readJson<{report:SearchConsoleReport}>("/api/search-console/reports",signal,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({property})});
            if (signal.aborted) return;
            setReports(current=>[data.report,...current.filter(r=>r.id!==data.report.id)]);
            selectReport(data.report.id);
          });
        }}>
          {properties.length ? <>
            <label htmlFor="gsc-property">Search Console property</label>
            <select id="gsc-property" value={property} onChange={e=>setProperty(e.target.value)} disabled={!!busy}>{properties.map(item=><option value={item.siteUrl} key={item.siteUrl}>{item.siteUrl}</option>)}</select>
            <p className="gsc-muted">Imports finalized data for a 28-day window ending three days ago. A URL-prefix property covers only that prefix. Choose the exact property you want to measure.</p>
            <button className="button primary" type="submit" disabled={!!busy || !property}>{busy === "import" && <Loader2 className="spin" size={16}/>} Import search data</button>
          </> : <p>No Search Console properties are available to this Google account. Add or verify your website in <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Google Search Console</a>, then load properties again.</p>}
        </form>}
        <div className="gsc-trust"><ShieldCheck size={15}/><span>Read-only · Your website stays untouched</span></div>
        <details className="gsc-access"><summary>What can Folio access?</summary><p>Imports read Search Console data; they do not change your website or start an AI evaluation. Disconnecting removes Folio’s stored Search Console tokens; Google identity and saved reports remain.</p></details>
      </div>
    </section>
    {ownerId && reports.length > 0 && <section className="panel gsc-history">
      <div className="panel-heading"><h2>Saved search reports</h2><span>{reports.length}</span></div>
      <div className="gsc-body">
        <p className="gsc-muted">Reopening a saved report uses its original observations. It does not request new data from Google.</p>
        {reports.length ? <ul>{reports.map(item=><li key={item.id}><button type="button" aria-label={`Open Search Console report for ${item.property}`} aria-pressed={selectedId===item.id} onClick={()=>selectReport(item.id)}><strong>{item.property}</strong><span>{item.startDate} – {item.endDate}</span><small>{item.status === "partial" ? "Partial report" : "Saved report"} · imported {new Date(item.fetchedAt).toLocaleDateString()}</small></button></li>)}</ul> : <p>Your imported reports will appear here.</p>}
      </div>
    </section>}
    {ownerId && reading && <p className="gsc-loading" role="status"><Loader2 size={18} className="spin"/> Loading saved report…</p>}
    {ownerId && reportError && <p className="gsc-error" role="alert">{reportError}</p>}
    {visibleReport && <ReportView report={visibleReport} reportRef={reportElement} busy={!!busy} onUseWebsite={() => action("website", async signal => {
      const {site} = await readJson<{site:{id:string}}>("/api/sites/from-search-console",signal,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reportId:visibleReport.id})});
      if (!signal.aborted) router.push(`/websites?site=${encodeURIComponent(site.id)}`);
    })}/>}
  </div>;
}

function metric(value: number | undefined | null, percent=false) {
  if (value == null || !Number.isFinite(value)) return "Not available";
  return percent ? `${(value*100).toLocaleString(undefined,{maximumFractionDigits:2})}%` : value.toLocaleString(undefined,{maximumFractionDigits:2});
}

function ReportView({report,reportRef,busy,onUseWebsite}:{report:SearchConsoleReport;reportRef:RefObject<HTMLElement | null>;busy:boolean;onUseWebsite:()=>void}) {
  function download() {
    const url=URL.createObjectURL(new Blob([JSON.stringify({source:"Google Search Console · private measured search data",report},null,2)],{type:"application/json"}));
    const anchor=document.createElement("a"); anchor.href=url; anchor.download=`folio-search-console-${report.id}.json`; anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="panel gsc-report" aria-label="Search Console report" ref={reportRef} tabIndex={-1}>
    <div className="panel-heading"><div><span className="eyebrow">MEASURED GOOGLE SEARCH DATA</span><h2>{report.property}</h2></div><button className="button secondary" type="button" onClick={download}><ArrowDownToLine size={15}/> Download private search report</button></div>
    <div className="gsc-body">
      <button className="button primary" disabled={busy} onClick={onUseWebsite}>Use this website <ArrowRight size={15}/></button>
      <p>{report.startDate} – {report.endDate} · Web search · Finalized data</p>
      <p className="gsc-muted">Imported {new Date(report.fetchedAt).toLocaleString()}. Search Console reporting dates use Pacific Time. This report is separate from technical readiness scores and search estimates.</p>
      {report.status === "partial" && <p className="gsc-notice" role="status">Partial report: some observations are unavailable or reached the row limit.</p>}
      {report.warnings.length>0 && <ul className="gsc-warnings">{report.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
      <dl className="gsc-metrics">{[["Clicks",metric(report.totals?.clicks)],["Impressions",metric(report.totals?.impressions)],["Click-through rate",metric(report.totals?.ctr,true)],["Average position",metric(report.totals?.position)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="gsc-muted">Tables show up to {report.rowLimit.toLocaleString()} returned rows per view.</p>
      <SearchTable title="Top searches" firstColumn="Search query" rows={report.queries}/>
      <SearchTable title="Top pages" firstColumn="Page" rows={report.pages}/>
      <SearchTable title="Daily performance" firstColumn="Date" rows={report.daily}/>
    </div>
  </section>;
}

function SearchTable({title,firstColumn,rows}:{title:string;firstColumn:string;rows:SearchConsoleRow[]}) {
  const [expanded,setExpanded]=useState(false);
  const visible=expanded ? rows : rows.slice(0,10);
  return <section className="gsc-table-section"><h3>{title}</h3>{rows.length ? <>
    <div className="gsc-table-scroll" tabIndex={0} role="region" aria-label={title}><table><thead><tr>{[firstColumn,"Clicks","Impressions","CTR","Average position"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map((row,i)=><tr key={i}><th scope="row">{row.keys.join(" · ")}</th><td>{metric(row.clicks)}</td><td>{metric(row.impressions)}</td><td>{metric(row.ctr,true)}</td><td>{metric(row.position)}</td></tr>)}</tbody></table></div>
    {rows.length>10 && <button type="button" className="button secondary" onClick={()=>setExpanded(v=>!v)}>{expanded ? "Show fewer rows" : `Show all ${rows.length} returned rows`}</button>}
  </> : <p className="gsc-muted">No rows were returned for this view. This does not establish zero search activity; check the report warnings.</p>}</section>;
}
