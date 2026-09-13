import rankings from "@/data/public-search-rankings.json";
import progress from "@/data/public-search-progress.json";
import catalog from "@/data/developer-tools.json";
import homepageBatch from "@/data/developer-tool-evaluations.json";
import { buildPublicDashboard, buildPublicHtmlCoverage } from "@/lib/public-dashboard";

/** Read published artifacts only. Never access owner records or reconcile/create provider work. */
export function GET() {
  try {
    const data = buildPublicDashboard(rankings, progress);
    data.htmlCoverage = buildPublicHtmlCoverage(catalog, homepageBatch);
    return Response.json(data, {headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
  } catch {
    return Response.json({error: {code: "public_data_unavailable", message: "Public benchmark data is temporarily unavailable."}},
      {status: 503, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
  }
}
