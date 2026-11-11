import { agentApiErrorResponse, agentKeyContext, AGENT_API_HEADERS } from "@/lib/agent-api";
import { onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { OAuthError, OAuthPageError, OAuthRedirectError, approveAuthorization, previewAuthorization, requestOrigin } from "@/lib/mcp-oauth";
export const dynamic = "force-dynamic";

/**
 * For /oauth/authorize, the consent page. GET checks the request and says who is asking; POST records the person's
 * approval and returns where to send the browser. Both need the person's own session; POST also this site's origin.
 * Client and return-address problems come back as `page` errors (shown, never redirected); others as `redirect`.
 */
function oauthProblem(error: unknown) {
  if (error instanceof OAuthRedirectError) return Response.json({ error: { code: error.error, message: error.message }, redirect: error.location }, { status: 400, headers: AGENT_API_HEADERS });
  if (error instanceof OAuthPageError || error instanceof OAuthError) return Response.json({ error: { code: error.error, message: error.message }, page: true }, { status: 400, headers: AGENT_API_HEADERS });
  return agentApiErrorResponse(error);
}

export async function GET(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "connect an app to Folio");
    return Response.json(await previewAuthorization(db, ownerId, new URL(request.url).searchParams, requestOrigin(request)), { headers: AGENT_API_HEADERS });
  } catch (error) { return oauthProblem(error); }
}

export async function POST(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true, "connect an app to Folio");
    const body = await readJsonBody(request);
    onlyFields(body, ["query", "scopes", "organizations", "name", "expiresInDays"]);
    if (typeof body.query !== "string" || body.query.length > 8192) throw new OAuthPageError("invalid_request", "The authorization request is missing.");
    const approved = await approveAuthorization(db, ownerId, new URLSearchParams(body.query),
      { scopes: body.scopes, organizations: body.organizations ?? null, name: body.name, expiresInDays: body.expiresInDays }, requestOrigin(request));
    return Response.json(approved, { headers: AGENT_API_HEADERS });
  } catch (error) { return oauthProblem(error); }
}
