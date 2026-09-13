import { readJsonBody } from "@/lib/api-request";
import { fetchSearchConsoleReport } from "@/lib/search-console";
import { assertSearchConsoleReportCapacity, listSavedSearchConsoleReports, saveSearchConsoleReport } from "@/lib/search-console-store";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, requireSearchConsoleOrigin, searchConsoleAccessToken, searchConsoleErrorResponse, searchConsoleRequestContext } from "@/lib/search-console-api";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { db, ownerId } = await searchConsoleRequestContext(request);
    const reports = await listSavedSearchConsoleReports(db, ownerId);
    return Response.json({ reports }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await searchConsoleRequestContext(request);
    requireSearchConsoleOrigin(request, context.auth.options.baseURL);
    const body = await readJsonBody(request);
    if (typeof body.property !== "string" || !body.property || body.property.length > 2048)
      throw new ScanError("Choose a Search Console property.");
    await assertSearchConsoleReportCapacity(context.db, context.ownerId);
    const token = await searchConsoleAccessToken(context);
    // The provider helper checks sites.list for this exact property before querying analytics.
    const payload = await fetchSearchConsoleReport(token, body.property);
    const report = await saveSearchConsoleReport(context.db, context.ownerId, payload);
    return Response.json({ report }, { status: 201, headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
