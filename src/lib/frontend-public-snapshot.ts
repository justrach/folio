import { PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS } from "./public-search-rankings";
import catalog from "../data/developer-tools.json";
import homepageBatch from "../data/developer-tool-evaluations.json";
import { buildPublicDashboard, buildPublicHtmlCoverage } from "./public-dashboard";

let serialized: string | undefined;

/** Real published artifacts only. Preserve their dates; never synthesize live updates. */
export function publishedSnapshotResponse() {
  if (!serialized) {
    const data = buildPublicDashboard(PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS);
    data.htmlCoverage = buildPublicHtmlCoverage(catalog, homepageBatch);
    data.snapshotNotice = "Showing published snapshot. Live shared updates are temporarily unavailable.";
    serialized = JSON.stringify(data);
  }
  return new Response(serialized, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Folio-Public-Source": "bundled-published-snapshot", "X-Content-Type-Options": "nosniff" } });
}
