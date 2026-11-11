import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { agentIdentifier } from "@/lib/agent-api-input";
import { listWebsiteChanges } from "@/lib/website-changes";
export const dynamic = "force-dynamic";

/** The signed-in owner's recorded website changes. Reads saved state only; starts no work. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys())
      if (!["websiteId", "cursor"].includes(key) || params.getAll(key).length !== 1) throw new AgentApiError("Unknown or repeated filter.", 400, "invalid_filter");
    const websiteId = params.get("websiteId"), cursor = params.get("cursor");
    const { db, ownerId } = await agentKeyContext(request, false, "see your recorded website changes");
    return Response.json(await listWebsiteChanges(db, ownerId, {
      limit: 10, ...(websiteId === null ? {} : { websiteId: agentIdentifier(websiteId) }), ...(cursor === null ? {} : { cursor }),
    }), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
