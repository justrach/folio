import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { createOrganization, listOrganizations } from "@/lib/organizations";
export const dynamic = "force-dynamic";

/** The signed-in person's organizations. */
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "see your organizations");
    return Response.json({ organizations: await listOrganizations(db, ownerId) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}

/** Anyone signed in can create an organization; they become its owner. */
export async function POST(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true, "create an organization");
    const body = await readJsonBody(request);
    onlyFields(body, ["name"]);
    return Response.json({ organization: await createOrganization(db, ownerId, { name: body.name }) }, { status: 201, headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
