import type { AbortSignal as WorkerAbortSignal, ExportedHandler, Fetcher } from "@cloudflare/workers-types";

export type EvaluationSchedulerEnvironment = {
  FOLIO_APP: Fetcher;
  EVALUATION_RECONCILE_ENABLED?: string;
  EVALUATION_RECONCILE_SECRET?: string;
};

/** Intentionally has no fetch handler. Public HTTP requests cannot start work. */
export async function triggerEvaluationReconciliation(env: EvaluationSchedulerEnvironment): Promise<void> {
  const secret = env.EVALUATION_RECONCILE_SECRET;
  if (env.EVALUATION_RECONCILE_ENABLED !== "true" || !secret || secret.length < 32 ||
    secret.length > 512 || /[\r\n]/.test(secret)) return;
  const response = await env.FOLIO_APP.fetch("https://folio.internal/api/internal/evaluations/reconcile", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "error",
    // The runtime implements the same AbortSignal; DOM and Workers ambient
    // type packages differ in the event-handler overload signatures.
    signal: AbortSignal.timeout(360_000) as unknown as WorkerAbortSignal,
  });
  // Never log response bodies: this process only needs success/failure for
  // Cloudflare's invocation status, not the application's private run records.
  await response.body?.cancel();
  if (!response.ok) throw new Error("Evaluation reconciliation request failed.");
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(triggerEvaluationReconciliation(env));
  },
} satisfies ExportedHandler<EvaluationSchedulerEnvironment>;
