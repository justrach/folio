import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { searchConsoleAccount } from "@/lib/google-auth";
import { PRIVATE_SEARCH_CONSOLE_HEADERS, searchConsoleErrorResponse } from "@/lib/search-console-api";

export const dynamic = "force-dynamic";

/** Local configuration and stored consent only; opening the page never calls Google. */
export async function GET(request: Request) {
  try {
    const auth = await getAuth();
    const configured = Boolean(auth.options.socialProviders?.google);
    const session = await auth.api.getSession({ headers: request.headers });
    const signedIn = Boolean(session);
    const connected = Boolean(session && configured && await searchConsoleAccount(await getDb(), session.user.id));
    const message = !configured ? "Google Search Console is not configured yet."
      : !signedIn ? "Sign in to connect your Google Search Console account."
      : connected ? "Search Console is connected. Choose a property to import a private snapshot."
      : "Connect Google to grant read-only access to your Search Console properties.";
    return Response.json({ configured, signedIn, connected, message }, { headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  } catch (error) { return searchConsoleErrorResponse(error); }
}
