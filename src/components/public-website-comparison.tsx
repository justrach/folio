"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { KeywordBenchmarkRun } from "@/lib/keyword-benchmark-types";
import { assertPublicDashboardData, type PublicDashboardData } from "@/lib/public-dashboard";
import { publicWebsiteComparison } from "@/lib/public-website-comparison";

export function PublicWebsiteComparison({ run }: { run: KeywordBenchmarkRun }) {
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    void fetch("/api/public/benchmarks", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("The public index is unavailable. Your private result is still available below.");
      const value: unknown = await response.json(); assertPublicDashboardData(value);
      if (!controller.signal.aborted) setData(value);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The public index is unavailable."); });
    return () => controller.abort();
  }, [revision]);
  const match = data ? publicWebsiteComparison(run, data.queries, data.observations) : null;
  return <section className="benchmark-public-comparison" aria-label="Compare with the public index">
    <h3>How does this answer compare with the public index?</h3>
    <p>Your evaluation stays private. This view reads already-published results and starts no model work.</p>
    {error ? <p role="alert">{error}</p> : !match ? <p role="status">Reading published observations…</p> : <>
      <p>{match.reason}</p>
      {match.observation && <><p><strong>{match.observation.model}</strong> · public observation from <time dateTime={match.observation.observedAt}>{new Date(match.observation.observedAt).toLocaleString()}</time></p>
        <div className="benchmark-public-table" tabIndex={0} role="region" aria-label="Published recommendations for this question"><table>
          <caption>Positions in the public answer, not search-engine rankings. Compare with your private answer below.</caption>
          <thead><tr><th scope="col">Position</th><th scope="col">Recommended website</th><th scope="col">Returned reason</th></tr></thead>
          <tbody>{match.observation.recommendations.map((item, index) => <tr key={index}><td>{item.position}</td><th scope="row">{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a> : item.name}</th><td>{item.reason || "No reason returned."}</td></tr>)}</tbody>
        </table></div>{!match.observation.recommendations.length && <p>The published answer returned no recommendations.</p>}
        <Link href={`/overview?query=${encodeURIComponent(match.observation.queryId)}&model=${encodeURIComponent(match.observation.model)}`}>Inspect the public question, sources and history</Link>
      </>}
    </>}
    <button type="button" className="button secondary" onClick={() => setRevision(value => value + 1)}>Refresh public comparison</button>
  </section>;
}
