"use client";
import { useEffect, useState } from "react";
import type { CostSummary } from "@/lib/provider-costs";
import "./cost-summary.css";
const dollars = (micros: number | null) => micros === null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(micros / 1_000_000);
const sourceName = (source: string) => ({keyword:"Question runs",evaluation:"Website evaluations",seo:"Search & backlinks"}[source] ?? source);
export function CostSummaryPanel() {
  const [data,setData] = useState<CostSummary | null>(null), [error,setError] = useState("");
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    fetch("/api/costs", { signal:controller.signal, cache:"no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Cost history is unavailable.");
      if (!controller.signal.aborted) setData(body);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [refresh]);
  return <section className="cost-summary" aria-labelledby="cost-title">
    <header><div><span className="eyebrow">YOUR PRIVATE USAGE · USD</span><h2 id="cost-title">What your runs cost</h2></div><button className="button secondary" onClick={()=>setRefresh(value=>value+1)}>Refresh costs</button></header>
    <p>All-time saved usage for this account. Reading this summary starts no paid work. These are operating costs, not a customer bill or credit balance.</p>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Loading saved costs…</p> : <>
      {!data.groups.length ? <p>No provider usage recorded yet.</p> : <div className="cost-table-wrap"><table><caption>Totals by provider, model and workflow</caption><thead><tr><th>Workflow / model</th><th>Attempts</th><th>Token estimate</th><th>Provider-reported</th><th>Missing or partial</th></tr></thead><tbody>{data.groups.map(group=><tr key={`${group.source}-${group.model}`}><th scope="row">{sourceName(group.source)}<small>{group.model ?? group.provider}</small></th><td>{group.runs}</td><td>{dollars(group.estimated_token_micros)}<small>{group.estimated_runs} with token estimates</small></td><td>{dollars(group.reported_known_micros)}<small>{group.reported_complete_runs} complete reported costs</small></td><td>{group.unknown_runs} attempts</td></tr>)}</tbody></table></div>}
      <p className="cost-note">Token estimates use standard short-context rates dated 18 September 2026. Missing cache detail assumes uncached input. Search, sandbox, cache-write charges and context-tier adjustments are excluded. Provider-reported costs may be partial and are not invoice-confirmed. Unknown is never $0; the two cost columns are not a combined total.</p>
      {!!data.recent.length && <details><summary>Recent attempts ({data.recent.length}, up to {data.recentLimit})</summary><div className="cost-table-wrap"><table><thead><tr><th>Started</th><th>Workflow / model</th><th>Status</th><th>Token estimate</th><th>Provider-reported</th></tr></thead><tbody>{data.recent.map(row=><tr key={`${row.source}-${row.source_id}`}><td>{new Date(row.source_created_at).toLocaleDateString()}</td><th scope="row">{sourceName(row.source)}<small>{row.model ?? row.provider}</small></th><td>{row.status}</td><td>{dollars(row.estimated_token_micros)}</td><td>{dollars(row.reported_known_micros)}{row.reported_known_micros !== null && !row.reported_complete ? " (partial)" : ""}</td></tr>)}</tbody></table></div></details>}
    </>}
  </section>;
}
