import { readJsonBody } from "@/lib/api-request";
import { checkResearchSources } from "@/lib/research-source-check";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
/** Explicit paid action only: fetch cited target pages once and judge them with one Decisions request. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId, env, baseURL } = await keywordBenchmarkRequestContext(request); requireKeywordBenchmarkOrigin(request, baseURL);
    const { id } = await context.params;
    return Response.json({ run: await checkResearchSources(db, ownerId, id, await readJsonBody(request), env) }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
