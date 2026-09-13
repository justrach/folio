import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { validateSearchConsoleReportPayload } from "./search-console";
import type { SearchConsoleReport, SearchConsoleReportPayload, SearchConsoleReportSummary } from "./search-console-types";

export const SEARCH_CONSOLE_REPORT_CAP = 50;

export class SearchConsoleStoreError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = "SearchConsoleStoreError";
  }
}

function requireOwner(ownerId: string) {
  if (!ownerId) throw new SearchConsoleStoreError("Sign in to access private Search Console reports.", 401);
}

type Row = { id: string; report_json: string };
function summaryOf(report: SearchConsoleReport): SearchConsoleReportSummary {
  const { daily: _daily, queries: _queries, pages: _pages, ...summary } = report;
  return summary;
}
function fromRow(row: Row): SearchConsoleReport {
  try { return { ...validateSearchConsoleReportPayload(JSON.parse(row.report_json)), id: row.id }; }
  catch { throw new SearchConsoleStoreError("This saved Search Console report could not be read.", 500); }
}

export async function assertSearchConsoleReportCapacity(db: D1Database, ownerId: string): Promise<void> {
  requireOwner(ownerId);
  const row = await db.prepare("SELECT COUNT(*) AS count FROM search_console_reports WHERE user_id = ?").bind(ownerId).first<{ count: number }>();
  if ((row?.count ?? 0) >= SEARCH_CONSOLE_REPORT_CAP) throw new SearchConsoleStoreError("The saved Search Console limit of 50 reports has been reached. Existing reports remain available.", 429);
}

export async function saveSearchConsoleReport(db: D1Database, ownerId: string, payload: SearchConsoleReportPayload): Promise<SearchConsoleReport> {
  requireOwner(ownerId);
  let report: SearchConsoleReportPayload;
  try { report = validateSearchConsoleReportPayload(payload); }
  catch { throw new SearchConsoleStoreError("This Search Console report cannot be saved.", 400); }
  const id = crypto.randomUUID();
  const row = await db.prepare(`INSERT INTO search_console_reports (id, user_id, property, created_at, report_json, summary_json)
    SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM search_console_reports WHERE user_id = ?) < ?
    RETURNING id, report_json`)
    .bind(id, ownerId, report.property, Date.now(), JSON.stringify(report), JSON.stringify(summaryOf({ ...report, id })), ownerId, SEARCH_CONSOLE_REPORT_CAP).first<Row>();
  if (!row) throw new SearchConsoleStoreError("The saved Search Console limit of 50 reports has been reached. Existing reports remain available.", 429);
  return fromRow(row);
}

export async function listSavedSearchConsoleReports(db: D1Database, ownerId: string): Promise<SearchConsoleReportSummary[]> {
  requireOwner(ownerId);
  const result = await db.prepare(`SELECT id, summary_json FROM search_console_reports
    WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`).bind(ownerId, SEARCH_CONSOLE_REPORT_CAP).all<{ id: string; summary_json: string }>();
  return result.results.map(row => {
    try {
      const payload = validateSearchConsoleReportPayload({ ...JSON.parse(row.summary_json), daily: [], queries: [], pages: [] });
      return summaryOf({ ...payload, id: row.id });
    } catch { throw new SearchConsoleStoreError("This saved Search Console report could not be read.", 500); }
  });
}

export async function getSavedSearchConsoleReport(db: D1Database, ownerId: string, id: string): Promise<SearchConsoleReport | null> {
  requireOwner(ownerId);
  const row = await db.prepare("SELECT id, report_json FROM search_console_reports WHERE user_id = ? AND id = ?")
    .bind(ownerId, id).first<Row>();
  return row ? fromRow(row) : null;
}
