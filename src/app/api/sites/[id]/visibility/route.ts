import { agentKeyContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { agentIdentifier } from "@/lib/agent-api-input";
import { loadWebsiteGaps } from "@/lib/website-gaps";
export const dynamic = "force-dynamic";

/** Owner read of one saved website's visibility and gaps; the same report agents get from folio_website_gaps. Starts no work. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await agentKeyContext(request, false, "view where your website shows up");
    return Response.json({ report: await loadWebsiteGaps(db, ownerId, agentIdentifier((await context.params).id)) }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
