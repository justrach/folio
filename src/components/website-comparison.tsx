"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { KeywordSearchMode } from "@/lib/keyword-benchmark-types";
import type { WebsiteComparisonSnapshot } from "@/lib/keyword-benchmark-store";
import "./website-comparison.css";

type Site = { id: string; name: string; url: string };

async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: "GET", cache: "no-store", signal });
  if (!response.ok) throw new Error("Saved data unavailable");
  return response.json();
}

/**
 * Read-only multi-website summary behind an explicit owner action.
 * One backend GET only; never starts, reconciles, or cancels runs.
 */
export function WebsiteComparison({ sites, scope, model }: { sites: Site[]; scope: KeywordSearchMode; model: string }) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<WebsiteComparisonSnapshot[] | null>(null);
  const [failed, setFailed] = useState(0);
  const [loading, setLoading] = useState(false);
  const key = `${sites.map((site) => site.id).join(",")}:${scope}:${model}`;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(0);
    const params = new URLSearchParams({ searchMode: scope });
    if (model) params.set("model", model);
    void read<{ snapshots: WebsiteComparisonSnapshot[]; failedReads: number }>(`/api/benchmarks/comparison?${params}`, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(page.snapshots) || page.snapshots.length > 100) throw new Error("Invalid saved list");
        for (const row of page.snapshots) {
          if (
            typeof row.websiteId !== "string" ||
            typeof row.url !== "string" ||
            ![row.answered, row.identified, row.appeared, row.unknown, row.sourceCount].every(
              (count) => Number.isSafeInteger(count) && count >= 0,
            ) ||
            (row.appearanceRate !== null && !Number.isInteger(row.appearanceRate)) ||
            !sites.some((site) => site.id === row.websiteId)
          )
            throw new Error("Invalid saved observation");
        }
        setSnapshots(page.snapshots);
        setFailed(Number.isSafeInteger(page.failedReads) && page.failedReads >= 0 ? page.failedReads : 0);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSnapshots(null);
          setFailed((value) => value + 1);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, key, sites, scope, model]);

  if (sites.length < 2) return null;
  return (
    <section className="panel website-comparison" aria-label="Compare your websites over time">
      <header>
        <div>
          <h2>Compare your websites</h2>
          <p>
            Side-by-side saved answers per website, latest completed answer per question. Unknown identities are excluded from
            rates. This describes recorded answers, not search rank or causality. Reads the saved backend summary only when
            you open it; it starts no paid work.
          </p>
        </div>
        {!open && (
          <button type="button" className="button secondary" onClick={() => setOpen(true)}>
            Compare websites
          </button>
        )}
      </header>
      {open && loading && <p role="status">Reading saved website summaries…</p>}
      {open && !loading && snapshots === null && (
        <p role="alert">Saved website summaries could not be loaded. Refresh the page to try again.</p>
      )}
      {open && !loading && snapshots !== null && (
        <>
          {failed > 0 && (
            <p role="alert">
              {failed} saved {failed === 1 ? "record could" : "records could"} not be read. Figures include only
              successfully loaded answers.
            </p>
          )}
          <div className="website-comparison-table-scroll" role="region" aria-label="Saved website comparison" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Website</th>
                  <th scope="col">Appeared</th>
                  <th scope="col">Completed answers</th>
                  <th scope="col">Distinct cited pages</th>
                  <th scope="col">Open</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((row) => {
                  const site = sites.find((item) => item.id === row.websiteId);
                  return (
                    <tr key={row.websiteId}>
                      <th scope="row">{site?.name || row.url}</th>
                      <td>
                        {row.appearanceRate === null
                          ? "Not measured"
                          : `${row.appearanceRate}% (${row.appeared} of ${row.identified})`}
                        {row.unknown > 0 && <small> · {row.unknown} unknown excluded</small>}
                      </td>
                      <td>{row.answered}</td>
                      <td>{row.answered ? row.sourceCount : "Not measured"}</td>
                      <td>
                        <Link href={`/overview?view=workspace&website=${encodeURIComponent(row.websiteId)}`}>
                          Open website <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
