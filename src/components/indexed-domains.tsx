"use client";

import { useEffect, useState } from "react";
import "./indexed-domains.css";

type Domain = { domain: string; hosts: number; pages: number; lastFetched: string | null };

/** The shared index, by domain: what the crawler actually holds. */
export function IndexedDomains() {
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [totals, setTotals] = useState<{ pages: number; hosts: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/index-domains?limit=60", { signal: controller.signal })
      .then(response => response.ok ? response.json() : { domains: [] })
      .then((data: { domains?: Domain[]; totalPages?: number; totalHosts?: number }) => {
        setDomains(Array.isArray(data.domains) ? data.domains : []);
        setTotals({ pages: data.totalPages ?? 0, hosts: data.totalHosts ?? 0 });
      })
      .catch(() => { if (!controller.signal.aborted) setDomains([]); });
    return () => controller.abort();
  }, []);

  if (domains === null) return <p className="indexed-domains-state">Loading indexed domains…</p>;
  if (domains.length === 0) return <p className="indexed-domains-state">The index has no pages yet.</p>;

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
