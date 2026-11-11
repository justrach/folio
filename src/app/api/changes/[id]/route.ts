import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { agentIdentifier, onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { updateWebsiteChange } from "@/lib/website-changes";
export const dynamic = "force-dynamic";

/** The owner confirms a recorded change is live, or withdraws it. Starts no evaluation. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true, "update your recorded website changes");
    const body = await readJsonBody(request);
    onlyFields(body, ["status", "publishedAt"]);
    if ((body.status !== "published" && body.status !== "withdrawn") || (body.publishedAt !== undefined && typeof body.publishedAt !== "string"))
      throw new AgentApiError("Send status published or withdrawn, with an optional publishedAt time.", 400, "invalid_request");
    return Response.json(await updateWebsiteChange(db, ownerId, agentIdentifier((await context.params).id),
      { status: body.status, ...(body.publishedAt === undefined ? {} : { publishedAt: body.publishedAt as string }) }, "owner"), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
