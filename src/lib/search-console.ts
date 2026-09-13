import "server-only";
import type { SearchConsoleMetrics, SearchConsoleProperty, SearchConsoleReportPayload, SearchConsoleRow } from "./search-console-types";

export const SEARCH_CONSOLE_ROW_LIMIT = 1000;
export const SEARCH_CONSOLE_MAX_REPORT_BYTES = 1_000_000;
const API_BASE = "https://www.googleapis.com/webmasters/v3/";
const REQUEST_TIMEOUT_MS = 20_000;
const COVERAGE_WARNING = "Google returns top rows and omits some anonymized queries. These tables are bounded samples; their sums can differ from property totals.";

export class SearchConsoleError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
    this.name = "SearchConsoleError";
  }
}

type Options = { fetcher?: typeof fetch; now?: Date };
type RequestOptions = { fetcher: typeof fetch; signal: AbortSignal };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const boundedString = (value: unknown, limit: number): value is string => typeof value === "string" && value.length > 0 && value.length <= limit;
const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function invalidResponse(): never { throw new SearchConsoleError("Search Console returned data that could not be read. Try again later."); }

function metrics(value: unknown): SearchConsoleMetrics {
  if (!record(value)) return invalidResponse();
  for (const name of ["clicks", "impressions", "ctr", "position"]) {
    const number = value[name];
    if (typeof number !== "number" || !Number.isFinite(number) || number < 0) return invalidResponse();
  }
  if ((value.ctr as number) > 1) return invalidResponse();
  return { clicks: value.clicks as number, impressions: value.impressions as number, ctr: value.ctr as number, position: value.position as number };
}

function rows(value: unknown, dimension: string | null): SearchConsoleRow[] {
  if (!record(value)) return invalidResponse();
  const source = value.rows === undefined ? [] : value.rows;
  if (!Array.isArray(source) || source.length > (dimension ? SEARCH_CONSOLE_ROW_LIMIT : 1)) return invalidResponse();
  return source.map(value => {
    const result = metrics(value);
    if (!record(value)) return invalidResponse();
    const keys = value.keys === undefined && dimension === null ? [] : value.keys;
    if (!Array.isArray(keys) || keys.length !== (dimension ? 1 : 0) || !keys.every(key => boundedString(key, 4096))) return invalidResponse();
    if (dimension === "date" && !validDate(keys[0])) return invalidResponse();
    return { ...result, keys };
  });
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.body) return invalidResponse();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SEARCH_CONSOLE_MAX_REPORT_BYTES) {
        await reader.cancel().catch(() => {});
        throw new SearchConsoleError("Search Console returned more data than this import can retain.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { return invalidResponse(); }
}

async function request(path: string, accessToken: string, options: RequestOptions, body?: unknown): Promise<unknown> {
  if (!boundedString(accessToken, 16_384) || /\s/.test(accessToken)) throw new SearchConsoleError("Reconnect Google Search Console to continue.", 401);
  try {
    const response = await options.fetcher(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal, redirect: "error", cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 401) throw new SearchConsoleError("Google access expired. Reconnect Search Console.", 401);
      if (response.status === 403) throw new SearchConsoleError("Google denied access. Check this account's property access and that the Search Console API is enabled.", 403);
      if (response.status === 429) throw new SearchConsoleError("Search Console is busy. Try importing again later.", 429);
      throw new SearchConsoleError("Search Console is temporarily unavailable. Try again later.");
    }
    return await readJson(response);
  } catch (error) {
    if (error instanceof SearchConsoleError) throw error;
    throw new SearchConsoleError("Search Console could not be reached in time. Try again later.");
  }
}

async function properties(accessToken: string, options: RequestOptions): Promise<SearchConsoleProperty[]> {
  const data = await request("sites", accessToken, options);
  if (!record(data) || (data.siteEntry !== undefined && !Array.isArray(data.siteEntry))) return invalidResponse();
  const entries = (data.siteEntry ?? []) as unknown[];
  if (entries.length > 5000) return invalidResponse();
  return entries.map(entry => {
    if (!record(entry) || !boundedString(entry.siteUrl, 2048) || !boundedString(entry.permissionLevel, 64)) return invalidResponse();
    return { siteUrl: entry.siteUrl, permissionLevel: entry.permissionLevel };
  }).filter(entry => ["siteOwner", "siteFullUser", "siteRestrictedUser"].includes(entry.permissionLevel));
}

export async function listSearchConsoleProperties(accessToken: string, options: Options = {}): Promise<SearchConsoleProperty[]> {
  return properties(accessToken, { fetcher: options.fetcher ?? fetch, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/** UTC chooses the date labels; Google interprets those labels as Pacific calendar dates. */
export function defaultSearchConsoleRange(now = new Date()): { startDate: string; endDate: string } {
  if (!Number.isFinite(now.getTime())) throw new SearchConsoleError("The Search Console date range is unavailable.", 400);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3));
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

/** Called only after an explicit import action. It cannot fetch a user-supplied URL. */
export async function fetchSearchConsoleReport(accessToken: string, property: string, options: Options = {}): Promise<SearchConsoleReportPayload> {
  if (!boundedString(property, 2048)) throw new SearchConsoleError("Choose a Search Console property.", 400);
  const now = options.now ?? new Date();
  const range = defaultSearchConsoleRange(now);
  const requestOptions = { fetcher: options.fetcher ?? fetch, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  const available = await properties(accessToken, requestOptions);
  if (!available.some(entry => entry.siteUrl === property)) throw new SearchConsoleError("Choose an available Search Console property from your connected account.", 403);
  const groups = [
    { name: "totals", label: "Property totals", dimension: null },
    { name: "daily", label: "Daily data", dimension: "date" },
    { name: "queries", label: "Queries", dimension: "query" },
    { name: "pages", label: "Pages", dimension: "page" },
  ] as const;
  const results = await Promise.allSettled(groups.map(async group => {
    const data = await request(`sites/${encodeURIComponent(property)}/searchAnalytics/query`, accessToken, requestOptions, {
      ...range, dimensions: group.dimension ? [group.dimension] : [], type: "web", dataState: "final",
      rowLimit: group.dimension ? SEARCH_CONSOLE_ROW_LIMIT : 1, startRow: 0,
    });
    const parsed = rows(data, group.dimension);
    if (group.dimension === "date" && parsed.some(row => row.keys[0] < range.startDate || row.keys[0] > range.endDate)) return invalidResponse();
    return parsed;
  }));
  if (results.every(result => result.status === "rejected")) {
    const failure = results[0] as PromiseRejectedResult;
    throw failure.reason instanceof SearchConsoleError ? failure.reason : new SearchConsoleError("Search Console import failed. Try again later.");
  }
  const report: SearchConsoleReportPayload = {
    property, ...range, fetchedAt: now.toISOString(), totals: null, daily: [], queries: [], pages: [],
    status: "complete", warnings: [COVERAGE_WARNING], rowLimit: SEARCH_CONSOLE_ROW_LIMIT,
  };
  results.forEach((result, index) => {
    const group = groups[index];
    if (result.status === "rejected") {
      report.status = "partial";
      report.warnings.push(`${group.label} could not be retrieved. Missing data is unknown.`);
    } else if (group.name === "totals") {
      report.totals = result.value[0] ? metrics(result.value[0]) : null;
      if (!report.totals) report.warnings.push("Google returned no property totals for this window. Totals remain unknown.");
    } else {
      report[group.name] = result.value;
      if (result.value.length === SEARCH_CONSOLE_ROW_LIMIT) {
        report.status = "partial";
        report.warnings.push(`${group.label} reached the ${SEARCH_CONSOLE_ROW_LIMIT}-row import limit; additional rows may exist.`);
      }
    }
  });
  // Retain a bounded snapshot even when long query/page strings inflate a response.
  const trimmed = new Set<string>();
  while (byteLength(report) > SEARCH_CONSOLE_MAX_REPORT_BYTES) {
    const dimensions: ("daily" | "queries" | "pages")[] = ["daily", "queries", "pages"];
    const name = dimensions.sort((a, b) => byteLength(report[b]) - byteLength(report[a]))[0];
    if (!report[name].length) throw new SearchConsoleError("This Search Console report is too large to save.");
    report[name].splice(Math.max(0, report[name].length - 50));
    report.status = "partial";
    if (!trimmed.has(name)) {
      report.warnings.push(`${name[0].toUpperCase()}${name.slice(1)} were shortened to fit the saved-report size limit.`);
      trimmed.add(name);
    }
  }
  return report;
}

/** Validate and copy only the report fields that may be persisted or returned. */
export function validateSearchConsoleReportPayload(value: unknown): SearchConsoleReportPayload {
  if (!record(value) || !boundedString(value.property, 2048) || !validDate(value.startDate) || !validDate(value.endDate)
    || Date.parse(value.endDate) - Date.parse(value.startDate) !== 27 * 86_400_000
    || !boundedString(value.fetchedAt, 40) || !Number.isFinite(Date.parse(value.fetchedAt))
    || !["complete", "partial"].includes(value.status as string) || value.rowLimit !== SEARCH_CONSOLE_ROW_LIMIT
    || !Array.isArray(value.daily) || !Array.isArray(value.queries) || !Array.isArray(value.pages)
    || !Array.isArray(value.warnings) || value.warnings.length > 20 || !value.warnings.every(warning => boundedString(warning, 1000))) return invalidResponse();
  const report: SearchConsoleReportPayload = {
    property: value.property, startDate: value.startDate, endDate: value.endDate, fetchedAt: value.fetchedAt,
    totals: value.totals === null ? null : metrics(value.totals),
    daily: rows({ rows: value.daily }, "date"), queries: rows({ rows: value.queries }, "query"), pages: rows({ rows: value.pages }, "page"),
    status: value.status as "complete" | "partial", warnings: [...value.warnings], rowLimit: SEARCH_CONSOLE_ROW_LIMIT,
  };
  if (report.daily.some(row => row.keys[0] < report.startDate || row.keys[0] > report.endDate) || byteLength(report) > SEARCH_CONSOLE_MAX_REPORT_BYTES) return invalidResponse();
  return report;
}
