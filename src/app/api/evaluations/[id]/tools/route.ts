import { readJsonBody } from "@/lib/api-request";
import { evaluationRequestContext, evaluationErrorResponse, PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";
import { returnSavedSeoEvidence } from "@/lib/managed-seo-tool";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** Returning an application tool result continues the model turn: explicit POST only. */
export async function POST(request: Request, context: Context) {
  try {
    const { db, ownerId, env } = await evaluationRequestContext(request);
    const body = await readJsonBody(request);
    if (Object.keys(body).length !== 0)
      throw new ScanError("This action only returns the report already selected for this run.", 400);
    const { id } = await context.params;
    const run = await returnSavedSeoEvidence(db, ownerId, id, env);
    return Response.json({ run }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}
