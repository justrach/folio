import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const { principal } = await agentApiContext(request); return Response.json({ authenticated: true, keyId: principal.keyId, scopes: principal.scopes }, { headers: AGENT_API_HEADERS }); }
  catch (error) { return agentApiErrorResponse(error); }
}
