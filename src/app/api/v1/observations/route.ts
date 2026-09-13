import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { parseAgentObservation, parseAgentQuery } from "@/lib/agent-api-input";
import { getAgentObservation } from "@/lib/agent-observation-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const { db, principal, env } = await agentApiContext(request); return Response.json(await getAgentObservation(db, principal.ownerId, parseAgentObservation(parseAgentQuery(request.url)), env), { headers: AGENT_API_HEADERS }); }
  catch (error) { return agentApiErrorResponse(error); }
}
