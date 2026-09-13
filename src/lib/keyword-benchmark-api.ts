import { AgentApiError } from "./agent-api-key-store";
import { SeoDataError } from "./dataforseo";
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "./auth";
import { getDb } from "./db";
import type { AgentsEnvironment } from "./agents";
import { KeywordAgentError } from "./keyword-benchmark-agent";
import { KeywordBenchmarkStoreError } from "./keyword-benchmark-store";
import { KeywordBenchmarkPersistenceError } from "./keyword-benchmark-service";
import { ScanError } from "./scanner";

export const PRIVATE_BENCHMARK_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function keywordBenchmarkRequestContext(request: Request) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new KeywordBenchmarkStoreError("Sign in to use your private benchmarks.", 401);
  const { env } = await getCloudflareContext({ async: true });
  const values = env as unknown as AgentsEnvironment;
  return { db: await getDb(), ownerId: session.user.id, baseURL: auth.options.baseURL, env: {
    FOLIO_MCP_URL: values.FOLIO_MCP_URL || process.env.FOLIO_MCP_URL,
    DATAFORSEO_LOGIN: values.DATAFORSEO_LOGIN || process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: values.DATAFORSEO_PASSWORD || process.env.DATAFORSEO_PASSWORD,
    DATAFORSEO_ALLOWED_USER_IDS: values.DATAFORSEO_ALLOWED_USER_IDS || process.env.DATAFORSEO_ALLOWED_USER_IDS,
    OPENAI_API_KEY: values.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    OPENAI_AGENTS_MODEL: values.OPENAI_AGENTS_MODEL || process.env.OPENAI_AGENTS_MODEL,
    OPENAI_ALLOWED_USER_IDS: values.OPENAI_ALLOWED_USER_IDS || process.env.OPENAI_ALLOWED_USER_IDS,
    OPENAI_UNMETERED_USER_IDS: values.OPENAI_UNMETERED_USER_IDS || process.env.OPENAI_UNMETERED_USER_IDS,
  } satisfies AgentsEnvironment };
}
export function requireKeywordBenchmarkOrigin(request: Request, baseURL: unknown) {
  if (typeof baseURL !== "string" || request.headers.get("origin") !== new URL(baseURL).origin)
    throw new KeywordBenchmarkStoreError("Cross-origin benchmark actions are not permitted.", 403);
}
export function keywordBenchmarkErrorResponse(error: unknown) {
  if (error instanceof KeywordBenchmarkPersistenceError) return Response.json({ error: error.message, recovery: { runId: error.run.id, sessionId: error.run.sessionId }, run: error.run }, { status: 503, headers: PRIVATE_BENCHMARK_HEADERS });
  if (error instanceof KeywordBenchmarkStoreError || error instanceof AgentApiError || error instanceof SeoDataError || error instanceof ScanError) return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_BENCHMARK_HEADERS });
  if (error instanceof KeywordAgentError) return Response.json({ error: error.code === "INVALID_INPUT" ? "This benchmark input is not supported by the evaluator." : "The evaluation provider is temporarily unavailable." }, { status: error.code === "INVALID_INPUT" ? 400 : 502, headers: PRIVATE_BENCHMARK_HEADERS });
  return Response.json({ error: "Private benchmarks are temporarily unavailable. Check account access and database configuration." }, { status: 503, headers: PRIVATE_BENCHMARK_HEADERS });
}
