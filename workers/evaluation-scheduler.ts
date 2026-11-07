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
  // Never log arbitrary response bodies or errors. Only validated aggregate
  // fields from the internal contract may reach operational logs.
  const result: unknown = await response.json().catch(() => null);
  if (!result || typeof result !== "object") throw new Error("Invalid reconciliation health response.");
  const health = result as Record<string, unknown>;
  const counts = [health.attempted, health.reconciled, health.failed, health.stale];
  if (typeof health.status !== "string" || !["completed", "busy", "disabled"].includes(health.status) ||
    !counts.every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    Number(health.attempted) !== Number(health.reconciled) + Number(health.failed) ||
    (health.lastSuccessAt !== null && !(typeof health.lastSuccessAt === "number" &&
      Number.isSafeInteger(health.lastSuccessAt) && health.lastSuccessAt >= 0)))
    throw new Error("Invalid reconciliation health response.");
  console.info("Evaluation reconciliation health", {
    status: health.status, attempted: health.attempted, reconciled: health.reconciled,
    failed: health.failed, stale: health.stale, lastSuccessAt: health.lastSuccessAt,
  });
  if (!response.ok || health.status === "disabled" || Number(health.failed) > 0 || Number(health.stale) > 0)
    throw new Error("Evaluation reconciliation is unhealthy; inspect aggregate health counts.");
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(triggerEvaluationReconciliation(env));
  },
} satisfies ExportedHandler<EvaluationSchedulerEnvironment>;
