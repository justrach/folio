import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { agentIdentifier, agentObservationKind, onlyFields } from "@/lib/agent-api-input";
import { cancelAgentObservation } from "@/lib/agent-observation-service";
import { readJsonBody } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { db, principal, env } = await agentApiContext(request, "evaluate");
    onlyFields(await readJsonBody(request), []);
    const { kind, id } = await context.params;
    return Response.json(await cancelAgentObservation(db, principal, agentObservationKind(kind), agentIdentifier(id), env), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
