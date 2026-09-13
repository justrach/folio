import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { listAgentObservationTargets } from "@/lib/agent-observation-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const { db, principal } = await agentApiContext(request); return Response.json({ websites: (await listAgentObservationTargets(db, principal.ownerId)).websites }, { headers: AGENT_API_HEADERS }); }
  catch (error) { return agentApiErrorResponse(error); }
}
