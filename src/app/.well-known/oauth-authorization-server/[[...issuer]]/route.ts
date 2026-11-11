import { OAUTH_CORS, authorizationServerMetadata, requestOrigin } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/** OAuth authorization server metadata (RFC 8414): where MCP clients register, send people to approve, and get tokens. */
export function GET(request: Request) {
  return Response.json(authorizationServerMetadata(requestOrigin(request)), { headers: { ...OAUTH_CORS, "Cache-Control": "public, max-age=3600" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
