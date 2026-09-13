import { cancelKeywordBenchmark } from "@/lib/keyword-benchmark-service";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId, env, baseURL } = await keywordBenchmarkRequestContext(request); requireKeywordBenchmarkOrigin(request, baseURL);
    const { id } = await context.params;
    return Response.json({ run: await cancelKeywordBenchmark(db, ownerId, id, env) }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
