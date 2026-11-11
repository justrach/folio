import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { claimEmailInvites, createOrganization, listOrganizations } from "@/lib/organizations";
export const dynamic = "force-dynamic";

/** The signed-in person's organizations, after joining any that added their verified email. */
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "see your organizations");
    const joined = await claimEmailInvites(db, ownerId);
    return Response.json({ organizations: await listOrganizations(db, ownerId), joined }, { headers: AGENT_API_HEADERS });
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
