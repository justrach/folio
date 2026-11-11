import { OAUTH_CORS, protectedResourceMetadata, requestOrigin } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/** OAuth protected resource metadata (RFC 9728) for Folio's MCP endpoint, at the root and at /api/mcp's own path. */
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(requestOrigin(request)), { headers: { ...OAUTH_CORS, "Cache-Control": "public, max-age=3600" } });
}
export function OPTIONS() { return new Response(null, { status: 204, headers: OAUTH_CORS }); }
