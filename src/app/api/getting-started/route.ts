import { agentApiErrorResponse, agentKeyContext, AGENT_API_HEADERS } from "@/lib/agent-api";
import { loadGettingStarted } from "@/lib/getting-started";
export const dynamic = "force-dynamic";

/** The signed-in person's getting-started checklist: which of the five steps have happened. Reads only. */
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "see your setup");
    return Response.json({ progress: await loadGettingStarted(db, ownerId) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
