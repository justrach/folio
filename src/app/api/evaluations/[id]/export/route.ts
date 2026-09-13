import { evaluationRequestContext, evaluationErrorResponse, PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";
import { createEvaluationBundle, getEvaluationRun } from "@/lib/eval-store";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await evaluationRequestContext(request);
    const { id } = await context.params;
    const run = await getEvaluationRun(db, ownerId, id);
    if (!run) throw new ScanError("Evaluation not found.", 404);
    return Response.json(createEvaluationBundle(run), { headers: {
      ...PRIVATE_EVAL_HEADERS,
      "Content-Disposition": `attachment; filename="folio-evaluation-${run.id.replace(/[^a-zA-Z0-9_-]/g, "")}.json"`,
    } });
  } catch (error) { return evaluationErrorResponse(error); }
}
