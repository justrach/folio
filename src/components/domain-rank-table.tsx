"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import type { DomainSeoMetrics } from "@/lib/seo-store";
import { announceWebsiteProgress } from "./website-checklist";

const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const show = (value: number | null) => value === null ? "Unavailable" : value > 0 && value < 1 ? "<1" : count.format(value);
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function domainOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""); } catch { return null; }
}

/** Saved DataForSEO domain metrics for a target and its competitors. Reading is free;
 * only the labelled button starts paid lookups, and only for domains without a saved report. */
export function DomainRankTable({ domains, targetDomain }: { domains: string[]; targetDomain: string }) {
  const { data: session } = useSession();
  const ownerId = session?.user.id ?? null;
  const unique = [...new Set(domains)].slice(0, 4);
  const key = JSON.stringify([ownerId, unique]);
  const currentKey = useRef(key); currentKey.current = key;
  const [metrics, setMetrics] = useState<Record<string, DomainSeoMetrics> | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    setMetrics(null); setError("");
    if (!ownerId || !unique.length) return;
    const controller = new AbortController();
    const params = new URLSearchParams(); unique.forEach(domain => params.append("domain", domain));
    fetch(`/api/seo-reports/metrics?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = record(await response.json());
      if (!response.ok || !record(payload?.metrics)) throw new Error("Invalid metrics");
      if (!controller.signal.aborted) setMetrics(payload!.metrics as Record<string, DomainSeoMetrics>);
    }).catch(() => { if (!controller.signal.aborted) setError("Saved domain metrics could not be loaded."); });
    fetch("/api/seo-data", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = record(await response.json());
      if (!controller.signal.aborted) setReady(response.ok && data?.configured === true && data?.authorized === true);
    }).catch(() => { /* Saved metrics remain readable. */ });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);

  const missing = metrics ? unique.filter(domain => !metrics[domain]) : [];
  async function lookUp() {
    if (!ready || busy || !missing.length) return;
    const requested = key; setError("");
    for (const [index, domain] of missing.entries()) {
      if (currentKey.current !== requested) return;
      setBusy(`Looking up ${domain} (${index + 1} of ${missing.length})…`);
      const response = await fetch("/api/seo-data", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain }) }).catch(() => null);
      if (!response?.ok) {
        // Stop at the first failure: its outcome and charge are unknown, and nothing is retried.
        setError(response?.status === 429 ? "The hourly DataForSEO lookup limit was reached. Saved results are kept." :
          `The lookup for ${domain} could not be confirmed; its charge is unknown. Review saved reports before trying again.`);
        break;
      }
    }
    if (currentKey.current === requested) { setBusy(""); setRefresh(value => value + 1); announceWebsiteProgress(); }
  }

  if (!ownerId || !unique.length) return null;
  return <div id="website-domain-ranks" className="website-research-domain-ranks" aria-label="DataForSEO domain metrics">
    <h4>Domain authority · DataForSEO</h4>
    {!metrics && !error && <p role="status">Loading saved domain metrics…</p>}
    {metrics && <table><thead><tr><th scope="col">Domain</th><th scope="col">Domain rank (0–100)</th><th scope="col">Referring domains</th><th scope="col">Est. monthly traffic</th><th scope="col">Captured</th></tr></thead>
      <tbody>{unique.map(domain => { const row = metrics[domain]; return <tr key={domain}>
        <th scope="row">{domain}{domain === targetDomain && <small> · your site</small>}</th>
        <td>{row ? show(row.domainRank) : "No saved report"}</td><td>{row ? show(row.referringDomains) : "—"}</td><td>{row ? show(row.estimatedMonthlyTraffic) : "—"}</td>
        <td>{row ? new Date(row.retrievedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}</td></tr>; })}</tbody></table>}
    <p className="website-research-note">DataForSEO Domain Rank is a 0–100 link-authority metric for the exact host (subdomains are measured separately), not Google PageRank or a search position. Unavailable is not zero.</p>
    {metrics && missing.length > 0 && <div className="website-research-launch">
      <button type="button" className="button secondary" disabled={!ready || !!busy} onClick={() => void lookUp()}>Look up {missing.length} missing domain{missing.length === 1 ? "" : "s"} (paid · DataForSEO)</button>
      <small>{ready ? `Up to ${missing.length * 2} paid DataForSEO tasks; each result is saved privately. Nothing runs automatically.` : "DataForSEO lookups are unavailable for this account. Saved results stay readable."}</small></div>}
    {busy && <p role="status">{busy}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
