import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { revokeAgentApiKey } from "@/lib/agent-api-key-store";
import { agentIdentifier, onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true);
    onlyFields(await readJsonBody(request), []);
    return Response.json({ key: await revokeAgentApiKey(db, ownerId, agentIdentifier((await context.params).id)) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
