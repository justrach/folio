import { getDb } from "@/lib/db";
import { OAUTH_CORS, OAuthError, oauthErrorResponse, registerClient } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/** Dynamic client registration (RFC 7591), for MCP clients such as Claude.ai and ChatGPT. No sign-in: registering grants nothing. */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 16_384) throw new OAuthError("invalid_client_metadata", "The registration is too large.");
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new OAuthError("invalid_client_metadata", "Send the client metadata as JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new OAuthError("invalid_client_metadata", "Send the client metadata as a JSON object.");
    return Response.json(await registerClient(await getDb(), body as Record<string, unknown>), { status: 201, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
  } catch (error) { return oauthErrorResponse(error); }
}
export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
