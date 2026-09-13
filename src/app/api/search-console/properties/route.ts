import { listSearchConsoleProperties } from "@/lib/search-console";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, searchConsoleAccessToken, searchConsoleErrorResponse, searchConsoleRequestContext } from "@/lib/search-console-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await searchConsoleRequestContext(request);
    const properties = await listSearchConsoleProperties(await searchConsoleAccessToken(context));
    return Response.json({ properties }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
