import { getDb } from "@/lib/db";
import { OAUTH_CORS, oauthErrorResponse, readOAuthForm, revokeToken } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/** Token revocation (RFC 7009). Revoking a refresh token disconnects the app. */
export async function POST(request: Request) {
  try {
    await revokeToken(await getDb(), await readOAuthForm(request), request.headers.get("authorization"));
    return new Response(null, { status: 200, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
  } catch (error) { return oauthErrorResponse(error); }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
