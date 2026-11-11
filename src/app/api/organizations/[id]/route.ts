import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { agentIdentifier, onlyFields } from "@/lib/agent-api-input";
import { readJsonBody } from "@/lib/api-request";
import { addMemberByEmail, cancelEmailInvite, createInvite, getOrganization, leaveOrganization, removeMember, renameOrganization, revokeInvite, setMemberRole, shareWebsite, unshareWebsite } from "@/lib/organizations";
export const dynamic = "force-dynamic";

/** Members only: people, their connected agents, shared websites and (for owners) invite links. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "see this organization");
    return Response.json({ organization: await getOrganization(db, ownerId, agentIdentifier((await context.params).id)) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}

const FIELDS: Record<string, string[]> = { invite: [], revoke_invite: ["inviteId"], add_by_email: ["email"], cancel_email_invite: ["inviteId"], remove_member: ["userId"], set_role: ["userId", "role"], leave: [],
  share_website: ["websiteId"], unshare_website: ["websiteId"], rename: ["name"] };

/** One explicit owner or member action per request. None of them spends credits. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await agentKeyContext(request, true, "change this organization");
    const id = agentIdentifier((await context.params).id), body = await readJsonBody(request);
    const action = typeof body.action === "string" && Object.hasOwn(FIELDS, body.action) ? body.action : null;
    if (!action) throw new AgentApiError("Choose a supported organization action.", 400, "invalid_request");
    onlyFields(body, ["action", ...FIELDS[action]]);
    let result: Record<string, unknown> = {};
    if (action === "invite") result = await createInvite(db, ownerId, id);
    else if (action === "revoke_invite") await revokeInvite(db, ownerId, id, body.inviteId);
    else if (action === "add_by_email") result = await addMemberByEmail(db, ownerId, id, body.email);
    else if (action === "cancel_email_invite") await cancelEmailInvite(db, ownerId, id, body.inviteId);
    else if (action === "remove_member") await removeMember(db, ownerId, id, body.userId);
    else if (action === "set_role") await setMemberRole(db, ownerId, id, body.userId, body.role);
    else if (action === "share_website") await shareWebsite(db, ownerId, id, body.websiteId);
    else if (action === "unshare_website") await unshareWebsite(db, ownerId, id, body.websiteId);
    else if (action === "rename") await renameOrganization(db, ownerId, id, body.name);
    else if (action === "leave") return Response.json(await leaveOrganization(db, ownerId, id), { headers: AGENT_API_HEADERS });
    return Response.json({ ...result, organization: await getOrganization(db, ownerId, id) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
