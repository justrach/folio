import { getKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request), { id } = await context.params;
    const run = await getKeywordBenchmarkRun(db, ownerId, id);
    if (!run) throw new KeywordBenchmarkStoreError("The private benchmark was not found.", 404);
    return Response.json({ run }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
