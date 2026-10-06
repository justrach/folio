"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Globe2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { evaluationHref } from "@/lib/evaluation-navigation";
import type { SearchConsoleReportSummary } from "@/lib/search-console-types";
import { WebsiteSeoSummary } from "./website-seo-summary";
import { WebsiteResearchPanel } from "./website-research-panel";
import "./owned-websites.css";

type Site = { id: string; name: string; url: string; isPublic: boolean; seoScore: number | null };

async function read<T>(url: string, signal: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal, cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Your website could not be loaded. Please try again.");
  return result as T;
}

function propertyUrl(property: string) {
  try { return new URL(property.startsWith("sc-domain:") ? `https://${property.slice(10)}/` : property).href; }
  catch { return null; }
}

export function OwnedWebsites({ onAudit }: { onAudit?: (url: string) => void }) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p role="status">Loading your websites…</p>;
  if (!session) return null;
  return <OwnerWebsites key={session.user.id} onAudit={onAudit} />;
}

function OwnerWebsites({ onAudit }: { onAudit?: (url: string) => void }) {
  const query = useSearchParams();
  const selectedId = query.get("site");
  const [sites, setSites] = useState<Site[]>([]);
  const [reports, setReports] = useState<SearchConsoleReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedNotice, setSavedNotice] = useState("");
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
    const url = new URL(window.location.href); url.searchParams.set("site", id); url.searchParams.delete("research");
    window.history.pushState(null, "", url.pathname + url.search);
  }
  async function saveWebsite() {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || pending.current || loading) return;
    pending.current = true; setBusy(true); setSaving(true); setSaveError(""); setSavedNotice("");
    try {
      const { site } = await read<{ site: Site }>("/api/sites", signal, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: websiteUrl.trim() }),
      });
      if (!signal.aborted) {
        setSites(previous => [site, ...previous.filter(item => item.id !== site.id)]);
        select(site.id); setWebsiteUrl(""); setSavedNotice("Website saved privately. Review the research steps below; no audit or paid research has started.");
      }
    } catch (failure) {
      if (!signal.aborted) setSaveError(`${failure instanceof Error ? failure.message : "The website could not be saved."} Your URL is retained. Retry Save website or refresh your saved list first if the outcome is unknown.`);
    } finally { pending.current = false; if (!signal.aborted) { setBusy(false); setSaving(false); } }
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
        <form className="owned-website-save" onSubmit={event => { event.preventDefault(); void saveWebsite(); }} aria-label="Save a website">
          <label htmlFor="owned-website-url">Website URL</label>
          <div><input id="owned-website-url" name="url" type="url" required placeholder="https://example.com/" autoComplete="url" value={websiteUrl} disabled={busy} onChange={event => { setWebsiteUrl(event.target.value); setSaveError(""); setSavedNotice(""); }} /><button className="button primary" type="submit" disabled={busy || loading || !websiteUrl.trim()}>{saving ? "Saving website…" : "Save website"}</button></div>
          <p className="owned-website-note">Save private website context only. No page capture, audit, query generation, or paid research starts until you explicitly choose it.</p>
          {saveError && <p role="alert">{saveError}</p>}
          {savedNotice && <p role="status">{savedNotice}</p>}
        </form>
        {!!sites.length && <label className="owned-website-selector">Selected website<select aria-label="Selected website" disabled={busy} value={selected?.id ?? ""} onChange={event => select(event.target.value)}>
          {!selected && <option value="">Select one of your websites</option>}
          {sites.map(site => <option key={site.id} value={site.id}>{site.name} · {new URL(site.url).hostname}</option>)}
        </select></label>}
        {selected && <>
          <div className="owned-website-title"><h3>{new URL(selected.url).hostname}</h3><span>{selected.isPublic ? "Technical scan shared" : "Private website"}</span></div>
          <p>{selected.seoScore == null ? "Technical readiness has not been measured yet." : `Latest technical readiness: ${selected.seoScore}/100.`}</p>
          <p className="owned-website-next">Next: discover customer queries and review one before starting research. Technical checks are optional and separate.</p>
          <div className="owned-website-actions">
            <a href="#website-research" className="button primary">Open website research <ArrowRight size={15} /></a>
            <Link href={`/overview?view=workspace&website=${encodeURIComponent(selected.id)}`} className="button secondary">View results <ArrowRight size={15} /></Link>
            {onAudit && <button className="button secondary" onClick={() => onAudit(selected.url)}>Audit website</button>}
            <Link href={evaluationHref({ targetUrl: selected.url })} className="button secondary">Evaluate website <ArrowRight size={15} /></Link>
            <Link href={`/evaluations?view=search&website=${encodeURIComponent(selected.id)}`} className="button secondary">Search questions <ArrowRight size={15} /></Link>
            {matchingReport && <Link href={`/search-console?report=${encodeURIComponent(matchingReport.id)}`} className="button secondary">Open search report</Link>}
          </div>
          {matchingReport && <p className="owned-website-note">Your saved Search Console report covers {matchingReport.startDate} – {matchingReport.endDate}. Evaluations use separately captured website evidence.</p>}
        </>}
        {!loading && !sites.length && !connected.length && <p>No saved websites yet. Save a URL above to prepare private research, or <Link href="/search-console">open Search Console</Link>.</p>}
        {!!connected.length && <div className="owned-connected-sites"><h3>Connected through Search Console</h3><p>Open a connected website to bring its reports and evaluations together.</p>
          {connected.map(report => <div key={report.id}><span>{report.property.replace(/^sc-domain:/, "")}</span><button className="button secondary" disabled={busy} onClick={() => openConnected(report.id)}>Open website <ArrowRight size={15} /></button></div>)}
        </div>}
      </div>
    </section>
    {selected && <WebsiteResearchPanel key={`research:${selected.id}`} websiteId={selected.id} targetUrl={selected.url} />}
    {selected && <WebsiteSeoSummary key={selected.id} targetUrl={selected.url} />}
  </div>;
}
