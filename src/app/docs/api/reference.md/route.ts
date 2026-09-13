import { agentApiMarkdown } from "@/lib/agent-api-reference";
export function GET() { return new Response(agentApiMarkdown(), { headers: { "Content-Type": "text/markdown; charset=utf-8", "X-Content-Type-Options": "nosniff" } }); }
