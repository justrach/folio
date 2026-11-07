import { readJsonBody } from "@/lib/api-request";
import { managedRunAccess, startEvaluationRun } from "@/lib/agent-runs";
import { evaluationRequestContext, evaluationErrorResponse, PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";
import { EvalStoreError, getEvaluationUsage, listEvaluationRunSummaries } from "@/lib/eval-store";
import { EVAL_SUITE } from "@/lib/evals";
import { expectedFactsFromRequest, ExpectedFactsValidationError } from "@/lib/expected-facts";
import { ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { db, ownerId, env } = await evaluationRequestContext(request);
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit");
    if (params.getAll("limit").length > 1 || params.getAll("cursor").length > 1 ||
      (rawLimit !== null && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(rawLimit)))
      throw new EvalStoreError("Invalid evaluation history pagination.", 400);
    const connection = managedRunAccess(env, ownerId);
    const [page, usage] = await Promise.all([
      listEvaluationRunSummaries(db, ownerId, {
        limit: rawLimit === null ? undefined : Number(rawLimit),
        cursor: params.get("cursor") ?? undefined,
      }),
      getEvaluationUsage(db, ownerId, connection.maxRunsPerDay),
    ]);
    return Response.json({ runs: page.runs, connection: { ...connection, usage }, suite: EVAL_SUITE, nextCursor: page.nextCursor }, { headers: PRIVATE_EVAL_HEADERS });
  } catch (error) { return evaluationErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { db, ownerId, env } = await evaluationRequestContext(request);
    const body = await readJsonBody(request);
    if(body.websiteCrawl!==undefined && typeof body.websiteCrawl!=="boolean") throw new ScanError("Invalid crawl option.");
    if (body.mode !== "managed" && body.mode !== "demo")
      throw new ScanError("Choose a managed evaluation or a fixture demonstration.");
    for (const field of ["domain", "brand", "rerunOf", "seoReportId"] as const)
      if (body[field] !== undefined && typeof body[field] !== "string")
        throw new ScanError(`Invalid ${field}.`);
    if (body.seoReportId !== undefined && (body.mode !== "managed" || body.rerunOf !== undefined || !(body.seoReportId as string).trim() || (body.seoReportId as string).length > 128))
      throw new ScanError("Select a saved SEO report only for a fresh managed evaluation. Reruns keep their original evidence.");
    const run = await startEvaluationRun(db, ownerId, {
      websiteCrawl: body.websiteCrawl === true,
      mode: body.mode, domain: body.domain as string | undefined,
      brand: body.brand as string | undefined, rerunOf: body.rerunOf as string | undefined,
      expectedFacts: expectedFactsFromRequest(body),
      seoReportId: body.seoReportId as string | undefined,
    }, env);
    return Response.json({ run }, { status: 201, headers: PRIVATE_EVAL_HEADERS });
  } catch (error) {
    return evaluationErrorResponse(error instanceof ExpectedFactsValidationError ? new ScanError(error.message) : error);
  }
}
