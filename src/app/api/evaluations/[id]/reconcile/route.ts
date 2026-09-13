import { readJsonBody } from "@/lib/api-request";
import { reconcileEvaluationRun } from "@/lib/agent-runs";
import { evaluationRequestContext, evaluationErrorResponse, PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId, env } = await evaluationRequestContext(request);
    await readJsonBody(request);
    const { id } = await context.params;
    const run = await reconcileEvaluationRun(db, ownerId, id, env);
    return Response.json({ run }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}
