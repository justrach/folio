"use client";
import { useEffect, useState } from "react";
import { assertPublicDashboardData, type PublicDashboardData } from "@/lib/public-dashboard";
import type { PublicSearchQuery } from "@/lib/public-search-rankings";

export function PublicQuestionPicker({ busy, onChoose }: { busy: boolean; onChoose: (question: PublicSearchQuery) => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/public/benchmarks", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Published questions could not be loaded. Close and reopen to retry.");
      const value: unknown = await response.json(); assertPublicDashboardData(value);
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(cause => { if (!controller.signal.aborted) { setData(null); setError(cause.message); } });
    return () => controller.abort();
  }, [open]);
  const candidates = data?.queries.filter(query => query.resultStatus === "published" && query.query.length <= 300 &&
    `${query.query} ${query.category}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="public-question-picker">
    <summary>Reuse a question from the public index</summary>
    <p>Use the exact wording, language and location to make a later comparison possible. Model and execution settings must also match. Choosing a question replaces the current question draft.</p>
    <label>Find a published question<input value={search} onChange={event => setSearch(event.target.value)} disabled={busy}/></label>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading published questions…</p> : <><p>{candidates.length} matching published questions. Showing up to 8; refine the search to find another.</p>
      <ul>{candidates.slice(0, 8).map(query => <li key={query.id}><button type="button" className="button secondary" disabled={busy} onClick={() => onChoose(query)}>{query.query}</button><small>{query.category} · {query.language} · {query.locale}</small></li>)}</ul></>}
  </details>;
}
