import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import {
  handleEvaluationReconciliationRequest, type EvaluationJobEnvironment,
} from "@/lib/eval-reconciliation-job";

export async function POST(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  // Use deployment bindings only: an accidentally inherited shell variable must
  // not activate scheduled work in a separate application environment.
  return handleEvaluationReconciliationRequest(request, getDb, env as EvaluationJobEnvironment);
}
