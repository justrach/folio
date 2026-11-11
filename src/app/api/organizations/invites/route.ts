import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { acceptInvite, previewInvite } from "@/lib/organizations";
export const dynamic = "force-dynamic";

/** The invite secret travels only in the body, never in a logged URL. Preview first; joining is a separate click. */
export async function POST(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true, "join an organization");
    const body = await readJsonBody(request);
    onlyFields(body, ["action", "token"]);
    if (body.action === "preview") return Response.json({ invite: await previewInvite(db, ownerId, body.token) }, { headers: AGENT_API_HEADERS });
    if (body.action === "accept") return Response.json(await acceptInvite(db, ownerId, body.token), { headers: AGENT_API_HEADERS });
    throw new AgentApiError("Choose preview or accept.", 400, "invalid_request");
  } catch (error) { return agentApiErrorResponse(error); }
}
