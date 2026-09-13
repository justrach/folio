import "server-only";

import { getAuth } from "./auth";
import { getDb } from "./db";
import { searchConsoleAccount } from "./google-auth";
import { ScanError } from "./scanner";
import { SearchConsoleError } from "./search-console";
import { SearchConsoleStoreError } from "./search-console-store";

export const PRIVATE_SEARCH_CONSOLE_HEADERS = {
  "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
};

export async function searchConsoleRequestContext(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new ScanError("Sign in to use private Search Console data.", 401);
  return { auth, ownerId: session.user.id, db: await getDb() };
}

/** Mutations accept only the configured app origin, including in local development. */
export function requireSearchConsoleOrigin(request: Request, baseURL: unknown) {
  if (typeof baseURL !== "string" || request.headers.get("origin") !== new URL(baseURL).origin)
    throw new ScanError("Cross-origin writes are not permitted.", 403);
}

export async function searchConsoleAccessToken(context: Awaited<ReturnType<typeof searchConsoleRequestContext>>) {
  const account = await searchConsoleAccount(context.db, context.ownerId);
  if (!account) throw new ScanError("Connect Google Search Console before importing data.", 409);
  try {
    // A server API call selects the exact owner's database account. The matching
    // HTTP endpoints are disabled so no browser can retrieve these credentials.
    const token = await context.auth.api.getAccessToken({ body: { accountId: account.id, userId: context.ownerId } });
    if (!token.accessToken) throw new Error("Missing access token");
    // A concurrent disconnect must prevent further provider calls.
    if (!(await searchConsoleAccount(context.db, context.ownerId)))
      throw new ScanError("Search Console was disconnected. Connect it before importing data.", 409);
    return token.accessToken;
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError("Google access expired or was revoked. Reconnect Search Console.", 401);
  }
}

export function searchConsoleErrorResponse(error: unknown) {
  if (error instanceof ScanError || error instanceof SearchConsoleError || error instanceof SearchConsoleStoreError)
    return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_SEARCH_CONSOLE_HEADERS });
  return Response.json({ error: "Search Console is temporarily unavailable. Please try again." }, {
    status: 503, headers: PRIVATE_SEARCH_CONSOLE_HEADERS,
  });
}
