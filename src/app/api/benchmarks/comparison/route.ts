import { summarizeOwnedWebsites, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";

export const dynamic = "force-dynamic";

/**
 * Read-only multi-website comparison over saved completed answers.
 * Authenticated GET only. No provider call, reconciliation, or spending.
 */
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request);
    const query = new URL(request.url).searchParams;
    for (const key of ["searchMode", "model"]) if (query.getAll(key).length > 1) throw new KeywordBenchmarkStoreError("Duplicate comparison filter.", 400);
    for (const key of [...query.keys()]) if (!["searchMode", "model"].includes(key)) throw new KeywordBenchmarkStoreError("Unsupported comparison filter.", 400);
    return Response.json(
      await summarizeOwnedWebsites(db, ownerId, {
        searchMode: query.get("searchMode") ?? "open-web",
        model: query.get("model") ?? undefined,
      }),
      { headers: PRIVATE_BENCHMARK_HEADERS },
    );
  } catch (error) {
    return keywordBenchmarkErrorResponse(error);
  }
}
