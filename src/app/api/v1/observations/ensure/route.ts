import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { parseAgentObservation } from "@/lib/agent-api-input";
import { ensureAgentObservation } from "@/lib/agent-observation-service";
import { readJsonBody } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { db, principal, env } = await agentApiContext(request, "evaluate");
    const result = await ensureAgentObservation(db, principal, parseAgentObservation(await readJsonBody(request)), request.headers.get("idempotency-key") ?? "", env);
    return Response.json(result, { status: result.run && ["queued", "running", "requires_action"].includes(result.run.status) ? 202 : 200, headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
