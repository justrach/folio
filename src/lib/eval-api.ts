import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "./auth";
import { getDb } from "./db";
import { AgentsIntegrationError } from "./agents";
import type { AgentRunEnvironment } from "./agent-runs";
import { EvalStoreError } from "./eval-store";
import { ScanError } from "./scanner";

export const PRIVATE_EVAL_HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function evaluationRequestContext(request: Request) {
  const session = await getSession(request.headers);
  if (!session) throw new ScanError("Sign in to view or run private evaluations.", 401);
  const { env } = await getCloudflareContext({ async: true });
  const values = env as unknown as AgentRunEnvironment;
  return {
    ownerId: session.user.id,
    db: await getDb(),
    env: {
      OPENAI_API_KEY: values.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      OPENAI_AGENTS_MODEL: values.OPENAI_AGENTS_MODEL || process.env.OPENAI_AGENTS_MODEL,
      OPENAI_ALLOWED_USER_IDS: values.OPENAI_ALLOWED_USER_IDS || process.env.OPENAI_ALLOWED_USER_IDS,
      OPENAI_MAX_RUNS_PER_DAY: values.OPENAI_MAX_RUNS_PER_DAY || process.env.OPENAI_MAX_RUNS_PER_DAY,
      OPENAI_UNMETERED_USER_IDS: values.OPENAI_UNMETERED_USER_IDS || process.env.OPENAI_UNMETERED_USER_IDS,
      TYPESAFE_API_KEY: values.TYPESAFE_API_KEY || process.env.TYPESAFE_API_KEY,
      TYPESAFE_ALLOWED_USER_IDS: values.TYPESAFE_ALLOWED_USER_IDS || process.env.TYPESAFE_ALLOWED_USER_IDS,
      SCAN_ALLOWED_HOSTS: values.SCAN_ALLOWED_HOSTS || process.env.SCAN_ALLOWED_HOSTS,
    } satisfies AgentRunEnvironment,
  };
}

export function evaluationErrorResponse(error: unknown) {
  if (error instanceof ScanError || error instanceof EvalStoreError)
    return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_EVAL_HEADERS });
  if (error instanceof AgentsIntegrationError)
    return Response.json({ error: error.message, code: error.code }, {
      status: error.code === "NOT_CONFIGURED" ? 503 : error.code === "INVALID_INPUT" ? 400 : 502,
      headers: PRIVATE_EVAL_HEADERS,
    });
  return Response.json({ error: "Private evaluations are unavailable. Check authentication and database configuration." }, {
    status: 503, headers: PRIVATE_EVAL_HEADERS,
  });
}
