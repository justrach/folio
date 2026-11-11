import { getDb } from "@/lib/db";
import { agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { readJsonBody } from "@/lib/api-request";
import { serveFolioMcp } from "@/lib/folio-mcp";
import { requesterHash } from "@/lib/onboarding-api";
import { consumeRateSlot } from "@/lib/seo-rate-limit";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const REQUESTS_PER_MINUTE = 60;

/** No-key MCP over the published index. Read-only public projections; nothing about the caller is saved except a salted rate counter. */
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AgentApiError("Untrusted MCP origin.", 403, "invalid_origin");
    const db = await getDb();
    const key = `folio:index-mcp:${await requesterHash(request)}`;
    const slot = await consumeRateSlot(db, key, REQUESTS_PER_MINUTE, 60_000);
    if (slot === null) throw new AgentApiError("Too many index requests. Try again in one minute.", 429, "rate_limited");
    // A new window is a cheap moment to drop counters of callers that went quiet.
    if (slot === 1) await db.prepare("DELETE FROM rate_limit WHERE key LIKE 'folio:index-mcp:%' AND last_request < ?").bind(Date.now() - 3_600_000).run().catch(() => {});
    const bounded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(await readJsonBody(request)) });
    const response = await serveFolioMcp(bounded, { db, principal: { ownerId: "", keyId: "", scopes: [] }, env: {}, publicIndex: true });
    for (const [name, value] of Object.entries(AGENT_API_HEADERS)) response.headers.set(name, value);
    return response;
  } catch (error) { return agentApiErrorResponse(error); }
}
/** Stateless and unauthenticated: no server-initiated stream to open and no session to end. */
const unsupported = () => Response.json({ error: { code: "method_not_allowed", message: "Send MCP requests to this endpoint with POST." } }, { status: 405, headers: { ...AGENT_API_HEADERS, Allow: "POST" } });
export const GET = unsupported;
export const DELETE = unsupported;
