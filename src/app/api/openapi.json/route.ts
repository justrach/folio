import { agentOpenApiSpec } from "@/lib/agent-api-reference";
export function GET() { return Response.json(agentOpenApiSpec(), { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } }); }
