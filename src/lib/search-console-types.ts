export type SearchConsoleProperty = { siteUrl: string; permissionLevel: string };

export type SearchConsoleMetrics = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchConsoleRow = SearchConsoleMetrics & { keys: string[] };

export type SearchConsoleReportPayload = {
  property: string;
  startDate: string;
  endDate: string;
  fetchedAt: string;
  totals: SearchConsoleMetrics | null;
  /** Totals for searches from the United States only, to compare with US-only estimates. Absent in snapshots saved before 11 November 2026. */
  unitedStatesTotals?: SearchConsoleMetrics | null;
  daily: SearchConsoleRow[];
  queries: SearchConsoleRow[];
  pages: SearchConsoleRow[];
  status: "complete" | "partial";
  warnings: string[];
  rowLimit: number;
};

export type SearchConsoleReport = SearchConsoleReportPayload & { id: string };
export type SearchConsoleReportSummary = Omit<SearchConsoleReport, "daily" | "queries" | "pages">;
