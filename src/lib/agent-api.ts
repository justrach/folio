import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { AgentApiError, authenticateAgentApiKey, type AgentApiScope } from "./agent-api-key-store";
import type { AgentRunEnvironment } from "./agent-runs";
import { ScanError } from "./scanner";
import { KeywordBenchmarkPersistenceError } from "./keyword-benchmark-service";
import { KeywordBenchmarkStoreError } from "./keyword-benchmark-store";
import { EvalStoreError } from "./eval-store";

export const AGENT_API_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

/** Cookie sessions never substitute for an agent key on /api/v1. */
export async function agentApiContext(request: Request, scope: AgentApiScope = "read") {
  const match = /^Bearer (folio_v1_[a-f0-9]{64})$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new AgentApiError("Send a Folio API key in the Authorization: Bearer header.", 401, "unauthorized");
  const db = await getDb();
  const principal = await authenticateAgentApiKey(db, match[1], scope);
  const { env } = await getCloudflareContext({ async: true });
  const values = env as unknown as AgentRunEnvironment;
  return { db, principal, env: {
    OPENAI_API_KEY: values.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    OPENAI_AGENTS_MODEL: values.OPENAI_AGENTS_MODEL || process.env.OPENAI_AGENTS_MODEL,
    OPENAI_ALLOWED_USER_IDS: values.OPENAI_ALLOWED_USER_IDS || process.env.OPENAI_ALLOWED_USER_IDS,
    OPENAI_MAX_RUNS_PER_DAY: values.OPENAI_MAX_RUNS_PER_DAY || process.env.OPENAI_MAX_RUNS_PER_DAY,
    OPENAI_UNMETERED_USER_IDS: values.OPENAI_UNMETERED_USER_IDS || process.env.OPENAI_UNMETERED_USER_IDS,
    SCAN_ALLOWED_HOSTS: values.SCAN_ALLOWED_HOSTS || process.env.SCAN_ALLOWED_HOSTS,
  } satisfies AgentRunEnvironment };
}

/** Creating and revoking keys requires the browser owner and configured origin. */
export async function agentKeyContext(request: Request, mutation = false) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new AgentApiError("Sign in to manage your Folio API keys.", 401, "unauthorized");
  if (mutation && (typeof auth.options.baseURL !== "string" || request.headers.get("origin") !== new URL(auth.options.baseURL).origin))
    throw new AgentApiError("Manage keys from this Folio workspace.", 403, "invalid_origin");
  return { ownerId: session.user.id, db: await getDb() };
}

export function agentApiErrorResponse(error: unknown) {
  if (error instanceof KeywordBenchmarkPersistenceError) return Response.json({ error: { code: "persistence_unconfirmed", message: "The task was submitted but saving its receipt could not be confirmed. Keep these recovery IDs; do not start a replacement task." }, recovery: { runId: error.run.id, sessionId: error.run.sessionId } }, { status: 503, headers: AGENT_API_HEADERS });
  const storeError = error instanceof KeywordBenchmarkStoreError || error instanceof EvalStoreError;
  const known = error instanceof AgentApiError || error instanceof ScanError || storeError;
  const status = known ? error.status : 503;
  const code = error instanceof AgentApiError ? error.code : storeError ? (status === 409 ? "conflict" : "invalid_request") : known ? "invalid_request" : "temporarily_unavailable";
  const message = error instanceof EvalStoreError
    ? status === 409 ? "This evaluation changed. Retrieve its saved state before continuing."
      : status === 403 ? "This evaluation action is not permitted for this account."
        : status === 404 ? "The private evaluation was not found."
          : "The private evaluation request could not be completed. Check its saved state before continuing."
    : known ? error.message : "This request could not be completed. Retrieve the saved request before attempting a new evaluation.";
  return Response.json({ error: { code, message } }, {
    status, headers: { ...AGENT_API_HEADERS, ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}),
      ...(status === 429 && error instanceof AgentApiError && code === "rate_limited" ? { "Retry-After": "60" } : {}) },
  });
}
