import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { agentIdentifier, agentMaxAge, agentObservationKind, onlyFields, parseAgentQuery } from "@/lib/agent-api-input";
import { getAgentObservationRun } from "@/lib/agent-observation-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { db, principal } = await agentApiContext(request);
    const { kind, id } = await context.params;
    const query = parseAgentQuery(request.url); onlyFields(query, ["maxAgeSeconds"]);
    return Response.json(await getAgentObservationRun(db, principal.ownerId, agentObservationKind(kind), agentIdentifier(id), agentMaxAge(query.maxAgeSeconds)), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
