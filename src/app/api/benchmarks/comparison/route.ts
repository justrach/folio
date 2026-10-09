import { summarizeOwnedWebsites, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
import { latestDomainSeoMetrics } from "@/lib/seo-store";

export const dynamic = "force-dynamic";

/**
 * Read-only multi-website comparison over saved completed answers.
 * Authenticated GET only. No provider call, reconciliation, or spending. Each site also carries
 * its latest saved DataForSEO metrics (domain rank, referring domains, traffic estimate) or null.
 */
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request);
    const query = new URL(request.url).searchParams;
    for (const key of ["searchMode", "model"]) if (query.getAll(key).length > 1) throw new KeywordBenchmarkStoreError("Duplicate comparison filter.", 400);
    for (const key of [...query.keys()]) if (!["searchMode", "model"].includes(key)) throw new KeywordBenchmarkStoreError("Unsupported comparison filter.", 400);
    const summary = await summarizeOwnedWebsites(db, ownerId, {
      searchMode: query.get("searchMode") ?? "open-web",
      model: query.get("model") ?? undefined,
    });
    // Saved DataForSEO observations are the domain-authority source of truth; reading them spends nothing.
    const host = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const seo = await latestDomainSeoMetrics(db, ownerId, summary.snapshots.map(snapshot => host(snapshot.url)));
    return Response.json(
      { ...summary, snapshots: summary.snapshots.map(snapshot => ({ ...snapshot, seo: seo.get(host(snapshot.url)) ?? null })) },
      { headers: PRIVATE_BENCHMARK_HEADERS },
    );
  } catch (error) {
    return keywordBenchmarkErrorResponse(error);
  }
}
