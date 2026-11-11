import { getDb } from "@/lib/db";
import { OAUTH_CORS, exchangeToken, oauthErrorResponse, readOAuthForm, requestOrigin } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/** OAuth token endpoint: an authorization code (with PKCE) or a refresh token becomes a new access and refresh token. */
export async function POST(request: Request) {
  try {
    const tokens = await exchangeToken(await getDb(), await readOAuthForm(request), request.headers.get("authorization"), requestOrigin(request));
    return Response.json(tokens, { headers: { ...OAUTH_CORS, "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch (error) { return oauthErrorResponse(error); }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
