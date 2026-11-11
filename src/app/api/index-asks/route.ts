import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { listIndexAsks } from "@/lib/index-asks";
export const dynamic = "force-dynamic";

/** What the signed-in owner's keyed agents asked the published index. Saved state only. */
export async function GET(request: Request) {
  try {
    if ([...new URL(request.url).searchParams.keys()].length) throw new AgentApiError("This list takes no filters.", 400, "invalid_filter");
    const { db, ownerId } = await agentKeyContext(request, false, "see what your agents asked");
    return Response.json(await listIndexAsks(db, ownerId, 20), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
