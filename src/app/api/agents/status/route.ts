import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  getAgentsConnectionStatus,
  type AgentsEnvironment,
} from "@/lib/agents";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const values = env as AgentsEnvironment;
    return Response.json(getAgentsConnectionStatus({
      OPENAI_API_KEY: values.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      OPENAI_AGENTS_MODEL: values.OPENAI_AGENTS_MODEL || process.env.OPENAI_AGENTS_MODEL,
    }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(getAgentsConnectionStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
