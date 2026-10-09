"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { KeywordSearchMode } from "@/lib/keyword-benchmark-types";
import type { WebsiteComparisonSnapshot } from "@/lib/keyword-benchmark-store";
import type { DomainSeoMetrics } from "@/lib/seo-store";
import "./website-comparison.css";

type Site = { id: string; name: string; url: string };
type Row = WebsiteComparisonSnapshot & { seo: DomainSeoMetrics | null };
const count = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nullableMetric = (value: unknown, max = Number.MAX_SAFE_INTEGER) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max);
/** Saved DataForSEO metrics or null; malformed values reject the whole list rather than displaying a guess. */
function validSeo(seo: unknown): seo is DomainSeoMetrics | null {
  if (seo === null) return true;
  const value = seo as Record<string, unknown>;
  return typeof value === "object" && typeof value.reportId === "string" && typeof value.retrievedAt === "string" && Number.isFinite(Date.parse(value.retrievedAt)) &&
    nullableMetric(value.domainRank, 100) && nullableMetric(value.referringDomains) && nullableMetric(value.backlinks) &&
    nullableMetric(value.organicKeywords) && nullableMetric(value.estimatedMonthlyTraffic);
}
const show = (value: number | null | undefined, missing: string) => value === null || value === undefined ? missing : value > 0 && value < 1 ? "<1" : count.format(value);

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
  const [snapshots, setSnapshots] = useState<Row[] | null>(null);
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
    void read<{ snapshots: Row[]; failedReads: number }>(`/api/benchmarks/comparison?${params}`, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(page.snapshots) || page.snapshots.length > 100) throw new Error("Invalid saved list");
        for (const row of page.snapshots) {
          if (
            typeof row.websiteId !== "string" ||
            typeof row.url !== "string" ||
            !Array.isArray(row.latestRuns) ||
            row.latestRuns.length > 500 ||
            row.latestRuns.some(
              (item) =>
                !item ||
                typeof item.id !== "string" ||
                typeof item.suiteId !== "string" ||
                !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
                !/^[A-Za-z0-9_-]{1,128}$/.test(item.suiteId),
            ) ||
            ![row.answered, row.identified, row.appeared, row.unknown, row.sourceCount].every(
              (count) => Number.isSafeInteger(count) && count >= 0,
            ) ||
            (row.appearanceRate !== null && !Number.isInteger(row.appearanceRate)) ||
            !validSeo(row.seo ?? null) ||
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
            rates. Domain rank, referring domains and traffic come from each site's latest saved DataForSEO report. This
            describes recorded observations, not causality. Reads saved data only when you open it; it starts no paid work.
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
                  <th scope="col">Domain rank <small>DataForSEO · 0–100</small></th>
                  <th scope="col">Referring domains</th>
                  <th scope="col">Est. monthly traffic</th>
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
                        {row.seo ? show(row.seo.domainRank, "Unavailable") : "No saved report"}
                        {row.seo && <small> · {new Date(row.seo.retrievedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</small>}
                      </td>
                      <td>{row.seo ? show(row.seo.referringDomains, "Unavailable") : "—"}</td>
                      <td>{row.seo ? show(row.seo.estimatedMonthlyTraffic, "Unavailable") : "—"}</td>
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
                        {row.latestRuns.length > 0 && (
                          <Link
                            href={`/benchmarks?suite=${encodeURIComponent(row.latestRuns[0].suiteId)}&run=${encodeURIComponent(row.latestRuns[0].id)}`}
                            aria-label={`Open latest answer for ${site?.name || row.url}`}
                          >
                            Latest answer <ArrowRight size={12} />
                          </Link>
                        )}
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
