import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { agentIdentifier, agentObservationKind, onlyFields } from "@/lib/agent-api-input";
import { reconcileAgentObservation } from "@/lib/agent-observation-service";
import { readJsonBody } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  try {
    const { db, principal, env } = await agentApiContext(request, "evaluate");
    onlyFields(await readJsonBody(request), []);
    const { kind, id } = await context.params;
    return Response.json(await reconcileAgentObservation(db, principal, agentObservationKind(kind), agentIdentifier(id), env), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
