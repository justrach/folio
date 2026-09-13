import { readJsonBody } from "@/lib/api-request";
import { connectSavedSearchConsoleWebsite } from "@/lib/connected-websites";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, requireSearchConsoleOrigin, searchConsoleErrorResponse, searchConsoleRequestContext } from "@/lib/search-console-api";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";

/** Explicit saved-report handoff; no token refresh, Google query, scan, or model task. */
export async function POST(request: Request) {
  try {
    const context = await searchConsoleRequestContext(request);
    requireSearchConsoleOrigin(request, context.auth.options.baseURL);
    const body = await readJsonBody(request);
    if (Object.keys(body).length !== 1 || typeof body.reportId !== "string") throw new ScanError("Choose one saved Search Console report.", 400);
    const site = await connectSavedSearchConsoleWebsite(context.db, context.ownerId, body.reportId);
    return Response.json({ site }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
