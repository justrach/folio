"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import "./website-seo-summary.css";

/** value: measured; none: the provider has no data for this domain (not zero); missing: this part of the lookup failed. */
type MetricState = "value" | "none" | "missing";
type Metric = { label: string; value: number | null; state: MetricState; hint: string };
type Summary = { domain: string; fetchedAt: string; metrics: Metric[]; partial: boolean; failed: boolean; saved: boolean; result: Record<string, unknown> };
type View = { key: string; loading: boolean; ready: boolean; updating: boolean; summary: Summary | null; notice: string | null; error: string | null };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const dateValid = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const small = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
/** Exact below 100,000; shortened (1.47M) above, with the exact count in the tooltip. */
const formatCount = (value: number) => value >= 100_000 ? compact.format(value) : value >= 100 ? full.format(value) : small.format(value);
const when = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Mirrors the server's www/trailing-dot normalization; never matches parent/sibling suffixes. */
function hostname(input?: string): string | null {
  if (!input?.trim() || input.length > 2_048) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port || host.length > 253 || !host.includes(".") ||
      !host.split(".").every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label)) || /^\d+(?:\.\d+){3}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)) return null;
    return host;
  } catch { return null; }
}
function metric(label: string, value: unknown, source: string, hints: { value: string; none: string }): Metric {
  const measured = number(value);
  const state: MetricState = source === "success" && measured !== null ? "value" : source === "empty" ? "none" : "missing";
  return { label, value: state === "value" ? measured : null, state,
    hint: state === "value" ? hints.value : state === "none" ? hints.none : "Not retrieved in this update" };
}
function readSummary(value: unknown, domain: string, saved: boolean): Summary {
  const result = record(value), organic = record(result?.organic), backlinks = record(result?.backlinks);
  if (!result || hostname(typeof result.domain === "string" ? result.domain : undefined) !== domain ||
    !dateValid(result.fetchedAt) || !["complete", "partial", "error"].includes(String(result.status)) ||
    !organic || !backlinks || !["success", "empty", "error"].includes(String(organic.status)) ||
    !["success", "empty", "error"].includes(String(backlinks.status))) throw new Error("Invalid report");
  const o = organic.status === "success" ? record(organic.data) : null;
  const b = backlinks.status === "success" ? record(backlinks.data) : null;
  const broken = number(b?.brokenBacklinks), trafficValue = number(o?.estimatedTrafficValueUsd);
  // Plain labels with what each number means; the exact provider terms stay in the saved report.
  const metrics = [
    metric("Backlinks", b?.backlinks, String(backlinks.status), { value: broken ? `Links from other websites · ${formatCount(broken)} broken` : "Links from other websites", none: "No links found yet" }),
    metric("Linking websites", b?.referringDomains, String(backlinks.status), { value: "Separate websites those links come from", none: "No website links here yet" }),
    metric("Google searches", o?.organicKeywords, String(organic.status), { value: "US searches that show it in the results", none: "Not shown for any US search yet" }),
    metric("Visits from Google", o?.estimatedMonthlyTraffic, String(organic.status), { value: trafficValue ? `Estimated a month · worth about $${formatCount(Math.round(trafficValue))} in ads` : "Estimated clicks a month", none: "No clicks from Google yet" }),
  ];
  const failed = metrics.every(item => item.state === "missing");
  return { domain, fetchedAt: result.fetchedAt, saved, result, failed, partial: !failed && metrics.some(item => item.state === "missing"), metrics };
}
function emptyView(key: string): View { return { key, loading: true, ready: false, updating: false, summary: null, notice: null, error: null }; }

/** Saved website context only. A lookup starts solely from the labelled update button. */
export function WebsiteSeoSummary({ targetUrl, onUpdated }: { targetUrl?: string; onUpdated?: () => void }) {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const domain = hostname(targetUrl);
  const key = JSON.stringify([ownerId, domain]);
  const currentKey = useRef(key); currentKey.current = key;
  const pendingUpdate = useRef<AbortController | null>(null);
  const [state, setState] = useState<View>(() => emptyView(key));
  const view = !isPending && state.key === key ? state : emptyView(key);

  useEffect(() => {
    pendingUpdate.current?.abort(); pendingUpdate.current = null;
    setState(emptyView(key));
    if (isPending || !ownerId || !domain) return;
    const controller = new AbortController();
    const live = () => !controller.signal.aborted && currentKey.current === key;
    // Availability is a configuration read. History and detail are authenticated owner reads.
    fetch("/api/seo-data", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = record(await response.json());
      if (live()) setState(previous => previous.key === key ? { ...previous, ready: response.ok && data?.configured === true && data?.authorized === true } : previous);
    }).catch(() => { /* Saved reports stay useful while updating is unavailable. */ });
    fetch("/api/seo-reports", { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = record(await response.json());
      if (!response.ok || !Array.isArray(payload?.reports) || payload.reports.length > 50) throw new Error("Invalid report history");
      const matching = payload.reports.map(record).filter((report): report is Record<string, unknown> => Boolean(report &&
        report.publication === "private" && typeof report.id === "string" && report.id.length <= 128 && dateValid(report.createdAt) &&
        hostname(typeof report.domain === "string" ? report.domain : undefined) === domain));
      matching.sort((a, b) => Date.parse(String(b.retrievedAt ?? b.createdAt)) - Date.parse(String(a.retrievedAt ?? a.createdAt)));
      const completed = matching.filter(report => report.state === "complete").slice(0, 3);
      const pending = matching[0]?.state === "pending" ? "The latest update is unconfirmed. Review it in saved reports before starting another update." : null;
      // Newest first; a report whose lookup returned nothing gives way to the last one with numbers.
      let summary: Summary | null = null, skipped: Summary | null = null;
      for (const saved of completed) {
        const detail = await fetch(`/api/seo-reports/${encodeURIComponent(String(saved.id))}`, { cache: "no-store", signal: controller.signal });
        const report = record(record(await detail.json())?.report);
        if (!detail.ok || !report || report.id !== saved.id || report.publication !== "private" || report.state !== "complete" ||
          hostname(typeof report.domain === "string" ? report.domain : undefined) !== domain) throw new Error("Invalid saved report");
        const candidate = readSummary(report.result, domain, true);
        if (!candidate.failed) { summary = candidate; break; }
        skipped ??= candidate;
      }
      const notice = pending ?? (summary && skipped ? `The update on ${when(skipped.fetchedAt)} didn’t return any data. Showing the report from ${when(summary.fetchedAt)}.` : null);
      if (live()) setState(previous => previous.key === key ? { ...previous, loading: false, summary: summary ?? skipped, notice } : previous);
    }).catch(() => {
      if (live()) setState(previous => previous.key === key ? { ...previous, loading: false, error: "Saved website data could not be loaded. Open your reports to try again." } : previous);
    });
    return () => { controller.abort(); pendingUpdate.current?.abort(); pendingUpdate.current = null; };
  }, [key, domain, ownerId, isPending]);

  async function update() {
    if (!ownerId || !domain || !view.ready || view.loading || pendingUpdate.current || isPending) return;
    const controller = new AbortController(); pendingUpdate.current = controller;
    const requestedKey = key;
    setState(previous => ({ ...previous, updating: true, error: null, notice: null }));
    try {
      const response = await fetch("/api/seo-data", { method: "POST", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) });
      const payload = record(await response.json());
      if (controller.signal.aborted || currentKey.current !== requestedKey) return;
      if (!response.ok) throw new Error(response.status === 429 ? "You’ve reached the update limit. Try again later."
        : response.status === 401 || response.status === 403 ? "Website data updates are unavailable for this account."
        : "The update could not be confirmed. Its outcome and charge are unknown; review saved reports before trying again.");
      const summary = readSummary(payload, domain, payload?.saved === true);
      setState(previous => {
        if (previous.key !== requestedKey) return previous;
        // A lookup that returned nothing never replaces numbers already on screen.
        if (summary.failed && previous.summary && !previous.summary.failed)
          return { ...previous, updating: false, notice: "This update didn’t return any data. The previous report is still shown." };
        return { ...previous, summary, updating: false,
          notice: summary.saved ? null : "This result was not saved. Download it before leaving; another update can charge again." };
      });
      // A saved lookup changes the visibility report; it re-reads saved data only.
      if (summary.saved) onUpdated?.();
    } catch (error) {
      if (!controller.signal.aborted && currentKey.current === requestedKey) setState(previous => previous.key === requestedKey ? { ...previous, updating: false,
        error: error instanceof Error && /^(You’ve|Website data updates|The update could)/.test(error.message) ? error.message
          : "The update could not be confirmed. Its outcome and charge are unknown; review saved reports before trying again." } : previous);
    } finally { if (pendingUpdate.current === controller) pendingUpdate.current = null; }
  }
  function download() {
    if (!view.summary) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "folio-private-seo-report-v1", publication: "private", result: view.summary.result }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `folio-seo-${domain}-${view.summary.fetchedAt.slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  const href = domain ? `/search-data?target=${encodeURIComponent(`https://${domain}/`)}` : "/search-data";
  const summary = view.summary;
  return <section className="panel website-seo-summary" aria-label="Website search and backlinks">
    <header className="website-seo-heading">
      <div>
        <h2>Search and backlinks</h2>
        <p className="website-seo-subtitle"><span className="website-seo-domain">{domain ?? "No website selected"}</span>
          {summary && <span>Updated {when(summary.fetchedAt)}{summary.saved ? "" : " · Not saved"}</span>}</p>
      </div>
      {ownerId && domain && <Link className="button secondary" href={href}>Open reports <ArrowUpRight size={13} /></Link>}
    </header>
    {isPending ? <p role="status">Loading your website data…</p>
      : !ownerId ? <p><Link href="/login">Sign in</Link> to see private website reports.</p>
      : !domain ? <p><Link href="/websites">Choose a website</Link> to view saved search estimates and backlinks.</p>
      : <>
        {view.loading ? <p role="status">Loading saved website data…</p>
          : summary?.failed ? <div className="website-seo-callout" role="status"><AlertTriangle size={16} aria-hidden="true" />
            <div><strong>The last update didn’t return any data.</strong>
              <p>The search data provider rejected or didn’t complete the lookup, so nothing was measured. Run the update again; missing values are not zero.</p></div></div>
          : summary ? <>
            <dl className="website-seo-metrics">{summary.metrics.map(item => <div key={item.label} className={`website-seo-metric is-${item.state}`}>
              <dt>{item.label}</dt>
              <dd title={item.value !== null ? full.format(item.value) : undefined}>{item.state === "value" ? formatCount(item.value!) : item.state === "none" ? "None found" : "Unavailable"}</dd>
              <dd className="website-seo-hint">{item.hint}</dd>
            </div>)}</dl>
            {summary.partial && <p role="status" className="website-seo-partial">Some data is unavailable in this report. Missing values are not zero.</p>}
            {!summary.saved && <button type="button" className="button secondary" onClick={download}>Download private report</button>}
          </> : !view.error && <p className="website-seo-empty">No saved search report yet. Update it to see backlinks, rankings and estimated visits for {domain}.</p>}
        {view.notice && <p role="status" className="website-seo-notice">{view.notice}</p>}
        {view.error && <p role="alert" className="website-seo-notice">{view.error}</p>}
        <footer className="website-seo-actions"><button type="button" className="button primary" onClick={update} disabled={!view.ready || view.loading || view.updating}>
          {view.updating ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}{view.updating ? "Updating website data…" : "Update website data"}</button>
          <p>{view.ready ? "Runs one new lookup, which may incur a charge. Nothing updates automatically." : "Updates are unavailable right now. Saved reports remain readable."}</p>
        </footer>
      </>}
  </section>;
}
