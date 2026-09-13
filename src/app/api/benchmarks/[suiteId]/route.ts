import { getKeywordBenchmarkSuite, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ suiteId: string }> }) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request), { suiteId } = await context.params;
    const suite = await getKeywordBenchmarkSuite(db, ownerId, suiteId);
    if (!suite) throw new KeywordBenchmarkStoreError("The private benchmark suite was not found.", 404);
    return Response.json({ suite }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
