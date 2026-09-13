import { getSavedSearchConsoleReport } from "@/lib/search-console-store";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, searchConsoleErrorResponse, searchConsoleRequestContext } from "@/lib/search-console-api";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await searchConsoleRequestContext(request);
    const { id } = await params;
    const report = await getSavedSearchConsoleReport(db, ownerId, id);
    if (!report) throw new ScanError("Search Console report not found.", 404);
    return Response.json({ report }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
