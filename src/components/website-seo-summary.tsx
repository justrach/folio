"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import "./website-seo-summary.css";

type Metrics = { backlinks: number | null; referringDomains: number | null; organicKeywords: number | null; estimatedVisits: number | null };
type Summary = { domain: string; fetchedAt: string; metrics: Metrics; partial: boolean; saved: boolean; result: Record<string, unknown> };
type View = { key: string; loading: boolean; ready: boolean; updating: boolean; summary: Summary | null; notice: string | null; error: string | null };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const dateValid = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

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
function readSummary(value: unknown, domain: string, saved: boolean): Summary {
  const result = record(value), organic = record(result?.organic), backlinks = record(result?.backlinks);
  if (!result || hostname(typeof result.domain === "string" ? result.domain : undefined) !== domain ||
    !dateValid(result.fetchedAt) || !["complete", "partial", "error"].includes(String(result.status)) ||
    !organic || !backlinks || !["success", "empty", "error"].includes(String(organic.status)) ||
    !["success", "empty", "error"].includes(String(backlinks.status))) throw new Error("Invalid report");
  const organicData = organic.status === "success" ? record(organic.data) : null;
  const backlinkData = backlinks.status === "success" ? record(backlinks.data) : null;
  return { domain, fetchedAt: result.fetchedAt, saved, result, partial: result.status !== "complete", metrics: {
    backlinks: number(backlinkData?.backlinks), referringDomains: number(backlinkData?.referringDomains),
    organicKeywords: number(organicData?.organicKeywords), estimatedVisits: number(organicData?.estimatedMonthlyTraffic),
  } };
}
function emptyView(key: string): View { return { key, loading: true, ready: false, updating: false, summary: null, notice: null, error: null }; }

/** Saved website context only. A lookup starts solely from the labelled update button. */
export function WebsiteSeoSummary({ targetUrl }: { targetUrl?: string }) {
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
      const saved = matching.find(report => report.state === "complete");
      const notice = matching[0]?.state === "pending" ? "The latest update is unconfirmed. Review it in saved reports before starting another update." : null;
      if (!saved) { if (live()) setState(previous => previous.key === key ? { ...previous, loading: false, notice } : previous); return; }
      const detail = await fetch(`/api/seo-reports/${encodeURIComponent(String(saved.id))}`, { cache: "no-store", signal: controller.signal });
      const report = record(record(await detail.json())?.report);
      if (!detail.ok || !report || report.id !== saved.id || report.publication !== "private" || report.state !== "complete" ||
        hostname(typeof report.domain === "string" ? report.domain : undefined) !== domain) throw new Error("Invalid saved report");
      const summary = readSummary(report.result, domain, true);
      if (live()) setState(previous => previous.key === key ? { ...previous, loading: false, summary, notice } : previous);
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
      setState(previous => previous.key === requestedKey ? { ...previous, summary, updating: false,
        notice: summary.saved ? null : "This result was not saved. Download it before leaving; another update can charge again." } : previous);
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
  return <section className="panel website-seo-summary" aria-label="Website search and backlinks">
    <div className="website-seo-heading"><div><h2>Search and backlinks</h2><p>{domain ?? "Choose a saved website to see its search data."}</p></div>
      {ownerId && domain && <Link className="button secondary" href={href}>Open reports <ArrowUpRight size={13} /></Link>}
    </div>
    {isPending ? <p role="status">Loading your website data…</p>
      : !ownerId ? <p><Link href="/login">Sign in</Link> to see private website reports.</p>
      : !domain ? <p><Link href="/websites">Choose a website</Link> to view saved search estimates and backlinks.</p>
      : <>
        {view.loading ? <p role="status">Loading saved website data…</p> : view.summary ? <>
          <dl className="website-seo-metrics">{([
            ["Backlinks", view.summary.metrics.backlinks], ["Referring domains", view.summary.metrics.referringDomains],
            ["Ranking keywords", view.summary.metrics.organicKeywords], ["Estimated monthly visits", view.summary.metrics.estimatedVisits],
          ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? "Unavailable" : format.format(value)}</dd></div>)}</dl>
          <p className="website-seo-captured">Captured {new Date(view.summary.fetchedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {view.summary.saved ? "Private saved report" : "Not saved"}</p>
          <p className="website-seo-note">Search estimates use Google · United States · English. Counts reflect indexed data; unavailable values are not zero.</p>
          {view.summary.partial && <p role="status">Some data is unavailable. The available results are shown above.</p>}
          {!view.summary.saved && <button type="button" className="button secondary" onClick={download}>Download private report</button>}
        </> : !view.error && <p>No saved search report is available for this website. Update it to see search estimates and backlinks.</p>}
        {view.notice && <p role="status" className="website-seo-notice">{view.notice}</p>}
        {view.error && <p role="alert" className="website-seo-notice">{view.error}</p>}
        <div className="website-seo-actions"><button type="button" className="button primary" onClick={update} disabled={!view.ready || view.loading || view.updating}>
          {view.updating ? <Loader2 className="spin" size={14} /> : <RefreshCw size={14} />}{view.updating ? "Updating website data…" : "Update website data"}</button>
          <p>{view.ready ? "Runs one new lookup and may incur a charge. Nothing updates automatically." : "Updates are unavailable right now. Saved reports remain readable."}</p>
        </div>
      </>}
  </section>;
}
