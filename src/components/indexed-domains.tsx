"use client";

import { useEffect, useState } from "react";
import { WorkspaceState } from "./workspace-state";
import "./indexed-domains.css";
import { InkSpinner } from "./workspace-sketches";

type Domain = { domain: string; hosts: number; pages: number; lastFetched: string | null };

/** The shared index, by domain: what the crawler actually holds. */
export function IndexedDomains() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [totals, setTotals] = useState<{ pages: number; hosts: number } | null>(null);
  // A failed read is not an empty index: keep the two states apart.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/index-domains?limit=60", { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Index read failed")))
      .then((data: { domains?: Domain[]; totalPages?: number; totalHosts?: number } | null) => {
        if (!data || !Array.isArray(data.domains)) throw new Error("Index read returned no domain list");
        setDomains(data.domains);
        setTotals({ pages: data.totalPages ?? 0, hosts: data.totalHosts ?? 0 });
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);

  if (failed) return <WorkspaceState title="The index could not be loaded" actions={<button type="button" className="button secondary" onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>Try again</button>}>
    <p>Nothing was changed. Try again to read the saved index.</p>
  </WorkspaceState>;
  if (domains === null) return <p className="indexed-domains-state" role="status"><InkSpinner />Loading indexed domains…</p>;
  if (domains.length === 0) return <WorkspaceState title="The index has no pages yet.">
    <p>Domains appear here once the crawler has saved pages for them.</p>
  </WorkspaceState>;

  return (
    <section className="indexed-domains" aria-label="Indexed domains">
      <header>
        <h2>Indexed domains</h2>
        <p>
          {totals?.hosts ? `${totals.hosts} hosts` : `${domains.length} domains`} · {totals?.pages
            ? `${totals.pages.toLocaleString()} pages`
            : `${domains.reduce((sum, item) => sum + item.pages, 0).toLocaleString()} pages`} · crawled, not submitted
        </p>
      </header>
      <ol>
        {domains.map(item => (
          <li key={item.domain}>
            <span className="indexed-rank" aria-hidden />
            <strong>{item.domain}</strong>
            <span className="indexed-pages">{item.pages.toLocaleString()} pages{item.hosts > 1 ? ` · ${item.hosts} hosts` : ""}</span>
            <span className="indexed-date">
              {item.lastFetched ? new Date(item.lastFetched).toLocaleDateString() : "—"}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
