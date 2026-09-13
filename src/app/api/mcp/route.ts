import { getDb } from "@/lib/db";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { authenticateSandboxSeoGrant } from "@/lib/sandbox-seo";
import { serveFolioMcp, type FolioToolContext } from "@/lib/folio-mcp";
import { readJsonBody } from "@/lib/api-request";
import type { AgentsEnvironment } from "@/lib/agents";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(request: Request) {
  try {
    // Reject browser origins except this exact deployment; clients normally omit Origin.
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new AgentApiError("Untrusted MCP origin.", 403, "invalid_origin");
    let context: FolioToolContext;
    const token = request.headers.get("authorization")?.match(/^Bearer (folio_sandbox_[a-f0-9]{64})$/)?.[1];
    if (token) {
      const db = await getDb(), sandbox = await authenticateSandboxSeoGrant(db, token);
      const { env } = await getCloudflareContext({ async: true });
      const values = env as unknown as AgentsEnvironment;
      context = { db, sandbox, principal: { ownerId: sandbox.ownerId, keyId: sandbox.grantId, scopes: ["seo"] }, env: {
        DATAFORSEO_LOGIN: values.DATAFORSEO_LOGIN || process.env.DATAFORSEO_LOGIN,
        DATAFORSEO_PASSWORD: values.DATAFORSEO_PASSWORD || process.env.DATAFORSEO_PASSWORD,
        DATAFORSEO_ALLOWED_USER_IDS: values.DATAFORSEO_ALLOWED_USER_IDS || process.env.DATAFORSEO_ALLOWED_USER_IDS,
      } };
    } else context = await agentApiContext(request);
    let bounded = request;
    if (request.method === "POST") {
      const body = await readJsonBody(request);
      bounded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(body) });
    }
    const response = await serveFolioMcp(bounded, context);
    for (const [key, value] of Object.entries(AGENT_API_HEADERS)) response.headers.set(key, value);
    return response;
  } catch (error) { return agentApiErrorResponse(error); }
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
