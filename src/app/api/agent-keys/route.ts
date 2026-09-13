import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { createAgentApiKey, listAgentApiKeys } from "@/lib/agent-api-key-store";
import { parseAgentKeyInput } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const { db, ownerId } = await agentKeyContext(request); return Response.json({ keys: await listAgentApiKeys(db, ownerId) }, { headers: AGENT_API_HEADERS }); }
  catch (error) { return agentApiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true);
    return Response.json(await createAgentApiKey(db, ownerId, parseAgentKeyInput(await readJsonBody(request))), { status: 201, headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
