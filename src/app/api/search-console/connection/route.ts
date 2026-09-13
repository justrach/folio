import { disconnectSearchConsole } from "@/lib/google-auth";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, requireSearchConsoleOrigin, searchConsoleErrorResponse, searchConsoleRequestContext } from "@/lib/search-console-api";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const context = await searchConsoleRequestContext(request);
    requireSearchConsoleOrigin(request, context.auth.options.baseURL);
    await disconnectSearchConsole(context.db, context.ownerId);
    return Response.json({ disconnected: true, message: "Search Console access was removed from Folio. Saved reports and Google sign-in remain available. You can also revoke Folio access in your Google account." }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
