import { readJsonBody } from "@/lib/api-request";
import { cancelEvaluationRun } from "@/lib/agent-runs";
import { evaluationRequestContext, evaluationErrorResponse, PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";
import { getEvaluationRun } from "@/lib/eval-store";
import { deleteEvaluationEvidence } from "@/lib/eval-deletion";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { db, ownerId } = await evaluationRequestContext(request);
    const { id } = await context.params;
    const run = await getEvaluationRun(db, ownerId, id);
    if (!run) throw new ScanError("Evaluation not found.", 404);
    return Response.json({ run }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { db, ownerId, env } = await evaluationRequestContext(request);
    const body = await readJsonBody(request);
    if (body.action !== "cancel") throw new ScanError("The supported action is cancel.");
    const { id } = await context.params;
    const run = await cancelEvaluationRun(db, ownerId, id, env);
    return Response.json({ run }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { db, ownerId } = await evaluationRequestContext(request);
    const body = await readJsonBody(request);
    const { id } = await context.params;
    const deletion = await deleteEvaluationEvidence(db, ownerId, id, body.revision);
    return Response.json({ deletion }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}
