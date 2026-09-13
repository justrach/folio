import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { queryAgentSeo } from "@/lib/agent-seo";
import { getOwnedSeoReport, listOwnedSeoReports } from "@/lib/seo-store";
import { readJsonBody } from "@/lib/api-request";
import { onlyFields, agentIdentifier } from "@/lib/agent-api-input";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { db, principal } = await agentApiContext(request);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "reportId") || params.getAll("reportId").length > 1) throw new AgentApiError("Use only one reportId.");
    if (!params.has("reportId")) return Response.json({ reports: await listOwnedSeoReports(db, principal.ownerId) }, { headers: AGENT_API_HEADERS });
    const report = await getOwnedSeoReport(db, principal.ownerId, agentIdentifier(params.get("reportId")));
    if (!report) throw new AgentApiError("Report not found.", 404, "not_found");
    return Response.json({ report }, { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, principal, env } = await agentApiContext(request, "seo");
    const body = await readJsonBody(request); onlyFields(body, ["domain", "confirmSpend"]);
    if (body.confirmSpend !== true || typeof body.domain !== "string") throw new AgentApiError("Provide a domain and confirmSpend: true for this paid lookup.");
    return Response.json(await queryAgentSeo(db, principal.ownerId, body.domain, request.headers.get("idempotency-key") ?? "", { env }), { headers: AGENT_API_HEADERS });
  } catch (error) { return agentApiErrorResponse(error); }
}
