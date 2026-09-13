"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { evaluationHref } from "@/lib/evaluation-navigation";
import type { SearchConsoleReportSummary } from "@/lib/search-console-types";
import { WebsiteSeoSummary } from "./website-seo-summary";
import "./owned-websites.css";

type Site = { id: string; name: string; url: string; isPublic: boolean; seoScore: number | null };

async function read<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error("Your website could not be loaded. Please try again.");
  return result as T;
}

function propertyUrl(property: string) {
  try { return new URL(property.startsWith("sc-domain:") ? `https://${property.slice(10)}/` : property).href; }
  catch { return null; }
}

export function OwnedWebsites() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p role="status">Loading your websites…</p>;
  if (!session) return null;
  return <OwnerWebsites key={session.user.id} />;
}

function OwnerWebsites() {
  const query = useSearchParams();
  const selectedId = query.get("site");
  const [sites, setSites] = useState<Site[]>([]);
  const [reports, setReports] = useState<SearchConsoleReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    Promise.allSettled([
      read<{ sites: Site[] }>("/api/sites", controller.signal),
      read<{ reports: SearchConsoleReportSummary[] }>("/api/search-console/reports", controller.signal),
    ]).then(([siteResult, reportResult]) => {
      if (controller.signal.aborted) return;
      if (siteResult.status === "fulfilled") setSites(siteResult.value.sites);
      else setError("Your websites could not be loaded.");
      if (reportResult.status === "fulfilled") setReports(reportResult.value.reports);
      else setError("Some connected websites could not be loaded.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);
  const selected = selectedId ? sites.find(site => site.id === selectedId) : sites[0];
  const connected = reports.filter((report, i) => reports.findIndex(other => other.property === report.property) === i &&
    !sites.some(site => site.url === propertyUrl(report.property)));
  const matchingReport = selected ? reports.find(report => {
    const url = propertyUrl(report.property);
    return url && (report.property.startsWith("sc-domain:") ? new URL(selected.url).hostname === new URL(url).hostname : selected.url.startsWith(url));
  }) : null;
  function select(id: string) {
    const url = new URL(window.location.href); url.searchParams.set("site", id);
    window.history.pushState(null, "", url.pathname + url.search);
  }
  async function openConnected(reportId: string) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const { site } = await read<{ site: Site }>("/api/sites/from-search-console", signal, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportId }),
      });
      if (!signal.aborted) { setSites(previous => [site, ...previous.filter(item => item.id !== site.id)]); select(site.id); }
    } catch { if (!signal.aborted) setError("This connected website could not be opened. Please try again."); }
    finally { pending.current = false; if (!signal.aborted) setBusy(false); }
  }
  return <div className="owned-websites">
    <section className="panel owned-website-list" aria-label="Your websites">
      <div className="panel-heading"><h2>Your websites</h2><Globe2 size={20} /></div>
      <div className="owned-website-body">
        {loading && <p role="status">Loading saved websites…</p>}
        {error && <p role="alert">{error} <button className="text-link" onClick={() => setRefresh(n => n + 1)}>Retry websites</button></p>}
        {!!sites.length && <label className="owned-website-selector">Selected website<select aria-label="Selected website" value={selected?.id ?? ""} onChange={event => select(event.target.value)}>
          {!selected && <option value="">Select one of your websites</option>}
          {sites.map(site => <option key={site.id} value={site.id}>{site.name} · {new URL(site.url).hostname}</option>)}
        </select></label>}
        {selected && <>
          <div className="owned-website-title"><h3>{new URL(selected.url).hostname}</h3><span>{selected.isPublic ? "Technical scan shared" : "Private website"}</span></div>
          <p>{selected.seoScore == null ? "Technical readiness has not been measured yet." : `Latest technical readiness: ${selected.seoScore}/100.`}</p>
          <div className="owned-website-actions">
            <Link href={evaluationHref({ targetUrl: selected.url })} className="button primary">Evaluate website <ArrowRight size={15} /></Link>
            <Link href={`/benchmarks?website=${encodeURIComponent(selected.id)}`} className="button secondary">Keyword evaluations <ArrowRight size={15} /></Link>
            {matchingReport && <Link href={`/search-console?report=${encodeURIComponent(matchingReport.id)}`} className="button secondary">Open search report</Link>}
          </div>
          {matchingReport && <p className="owned-website-note">Your saved Search Console report covers {matchingReport.startDate} – {matchingReport.endDate}. Evaluations use separately captured website evidence.</p>}
        </>}
        {!loading && !sites.length && !connected.length && <p>No saved websites yet. <Link href="/search-console">Open Search Console</Link> or run a website audit.</p>}
        {!!connected.length && <div className="owned-connected-sites"><h3>Connected through Search Console</h3><p>Open a connected website to bring its reports and evaluations together.</p>
          {connected.map(report => <div key={report.id}><span>{report.property.replace(/^sc-domain:/, "")}</span><button className="button secondary" disabled={busy} onClick={() => openConnected(report.id)}>Open website <ArrowRight size={15} /></button></div>)}
        </div>}
      </div>
    </section>
    {selected && <WebsiteSeoSummary key={selected.id} targetUrl={selected.url} />}
  </div>;
}
