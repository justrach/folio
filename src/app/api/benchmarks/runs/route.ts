import { readJsonBody } from "@/lib/api-request";
import { startKeywordBenchmark } from "@/lib/keyword-benchmark-service";
import { listKeywordBenchmarkRuns, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request), query = new URL(request.url).searchParams;
    return Response.json({ runs: await listKeywordBenchmarkRuns(db, ownerId, { suiteId: query.get("suiteId") ?? undefined, caseId: query.get("caseId") ?? undefined }) }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, ownerId, env, baseURL } = await keywordBenchmarkRequestContext(request); requireKeywordBenchmarkOrigin(request, baseURL);
    const body = await readJsonBody(request);
    if (Object.keys(body).some(key => !["caseId", "kind", "baselineRunId", "useSeoTools"].includes(key)) || (body.useSeoTools !== undefined && typeof body.useSeoTools !== "boolean") || typeof body.caseId !== "string" || !["baseline", "fresh"].includes(String(body.kind)) || (body.baselineRunId !== undefined && typeof body.baselineRunId !== "string"))
      throw new KeywordBenchmarkStoreError("Choose a saved case and baseline or fresh answer.", 400);
    const run = await startKeywordBenchmark(db, ownerId, { caseId: body.caseId, kind: body.kind as "baseline" | "fresh", baselineRunId: body.baselineRunId as string | undefined }, env, { useSeoTools: body.useSeoTools === true });
    return Response.json({ run }, { status: 201, headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
