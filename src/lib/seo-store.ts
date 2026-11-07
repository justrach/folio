import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { normalizeSeoDomain, type SeoDetailResult, type SeoOverviewResult } from "./dataforseo";

export type SavedSeoReport = {
  id: string;
  domain: string;
  createdAt: string;
  retrievedAt: string | null;
  publication: "private";
  state: "pending" | "complete";
  result: SeoOverviewResult | null;
  detail: SeoDetailResult | null;
  detailRetrievedAt: string | null;
};

export type SeoReportSummary = Omit<SavedSeoReport, "result" | "detail" | "detailRetrievedAt"> & {
  status: SeoOverviewResult["status"] | "unconfirmed";
  detailState: "collected" | "not_collected";
  totalCostUsd: number | null;
  knownCostUsd: number | null;
  costIsComplete: boolean;
};

export class SeoStoreError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = "SeoStoreError";
  }
}

type Row = {
  id: string;
  domain: string;
  created_at: number;
  retrieved_at: number | null;
  result_json: string | null;
  detail_json: string | null;
  detail_retrieved_at: number | null;
};

type SummaryRow = Omit<Row, "detail_json"> & { has_detail: number };

function requireOwner(ownerId: string) {
  if (!ownerId) throw new SeoStoreError("Sign in to access private SEO reports.", 401);
}

function reportFromRow(row: Row): SavedSeoReport {
  return {
    id: row.id,
    domain: row.domain,
    createdAt: new Date(row.created_at).toISOString(),
    retrievedAt: row.retrieved_at === null ? null : new Date(row.retrieved_at).toISOString(),
    publication: "private",
    state: row.result_json === null ? "pending" : "complete",
    result: row.result_json === null ? null : JSON.parse(row.result_json) as SeoOverviewResult,
    detail: row.detail_json === null ? null : JSON.parse(row.detail_json) as SeoDetailResult,
    detailRetrievedAt: row.detail_retrieved_at === null ? null : new Date(row.detail_retrieved_at).toISOString(),
  };
}

/** Confirm that private storage is available before contacting a paid provider.
 * An interrupted request leaves an honest unconfirmed record, never a free or successful report.
 */
export async function reserveSeoReport(db: D1Database, ownerId: string, domainInput: string): Promise<SavedSeoReport> {
  requireOwner(ownerId);
  const domain = normalizeSeoDomain(domainInput);
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.prepare("INSERT INTO seo_reports (id, user_id, domain, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, ownerId, domain, now).run();
  return reportFromRow({ id, domain, created_at: now, retrieved_at: null, result_json: null, detail_json: null, detail_retrieved_at: null });
}

/** A saved observation is immutable. Refreshing requires a new explicit paid lookup. */
export async function completeSeoReport(db: D1Database, ownerId: string, id: string, result: SeoOverviewResult): Promise<SavedSeoReport> {
  requireOwner(ownerId);
  const retrievedAt = Date.parse(result.fetchedAt);
  const serialized = JSON.stringify(result);
  if (!Number.isFinite(retrievedAt) || serialized.length > 100_000 || result.provider !== "DataForSEO")
    throw new SeoStoreError("The SEO observation cannot be saved.", 400);
  const updated = await db.prepare(`UPDATE seo_reports SET result_json = ?, retrieved_at = ?
    WHERE user_id = ? AND id = ? AND domain = ? AND result_json IS NULL RETURNING *`)
    .bind(serialized, retrievedAt, ownerId, id, result.domain).first<Row>();
  if (!updated) throw new SeoStoreError("This SEO report is already saved or unavailable.");
  return reportFromRow(updated);
}

/** Detail rows are immutable and belong to exactly one completed report. A
 * second collection would be another paid request, so it is refused here. */
export async function saveSeoReportDetail(
  db: D1Database, ownerId: string, id: string, detail: SeoDetailResult,
): Promise<SavedSeoReport> {
  requireOwner(ownerId);
  const retrievedAt = Date.parse(detail.collectedAt);
  const serialized = JSON.stringify(detail);
  if (!Number.isFinite(retrievedAt) || serialized.length > 200_000 || detail.provider !== "DataForSEO")
    throw new SeoStoreError("The SEO detail rows cannot be saved.", 400);
  const updated = await db.prepare(`UPDATE seo_reports SET detail_json = ?, detail_retrieved_at = ?
    WHERE user_id = ? AND id = ? AND domain = ? AND result_json IS NOT NULL AND detail_json IS NULL RETURNING *`)
    .bind(serialized, retrievedAt, ownerId, id, detail.domain).first<Row>();
  if (!updated) throw new SeoStoreError("This SEO report already has saved detail rows or is unavailable.");
  return reportFromRow(updated);
}

/** A report ID never authorizes access; this is also the only read entry point for agent tools. */
export async function getOwnedSeoReport(db: D1Database, ownerId: string, id: string): Promise<SavedSeoReport | null> {
  requireOwner(ownerId);
  const row = await db.prepare("SELECT id, domain, created_at, retrieved_at, result_json, detail_json, detail_retrieved_at FROM seo_reports WHERE user_id = ? AND id = ?")
    .bind(ownerId, id).first<Row>();
  return row ? reportFromRow(row) : null;
}

/** This reads saved observations only. It cannot invoke DataForSEO or charge the account. */
export async function listOwnedSeoReports(db: D1Database, ownerId: string): Promise<SeoReportSummary[]> {
  requireOwner(ownerId);
  // Detail rows can be large; the list only reports whether they were collected.
  const { results } = await db.prepare(`SELECT id, domain, created_at, retrieved_at, result_json,
      CASE WHEN detail_json IS NULL THEN 0 ELSE 1 END AS has_detail, detail_retrieved_at
    FROM seo_reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`)
    .bind(ownerId).all<SummaryRow>();
  return results.map(row => {
    const { result, ...report } = reportFromRow({ ...row, detail_json: null });
    const { detail: _detail, detailRetrievedAt: _detailRetrievedAt, ...summary } = report;
    return {
      ...summary,
      status: result?.status ?? "unconfirmed",
      detailState: row.has_detail ? "collected" : "not_collected",
      totalCostUsd: result?.totalCostUsd ?? null,
      knownCostUsd: result?.knownCostUsd ?? null,
      costIsComplete: result?.costIsComplete ?? false,
    };
  });
}
