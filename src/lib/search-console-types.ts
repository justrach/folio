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
  daily: SearchConsoleRow[];
  queries: SearchConsoleRow[];
  pages: SearchConsoleRow[];
  status: "complete" | "partial";
  warnings: string[];
  rowLimit: number;
};

export type SearchConsoleReport = SearchConsoleReportPayload & { id: string };
export type SearchConsoleReportSummary = Omit<SearchConsoleReport, "daily" | "queries" | "pages">;
