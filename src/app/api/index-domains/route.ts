import { indexedDomains } from "@/lib/index-stats";

export const dynamic = "force-dynamic";

/** Public: the domains the shared index actually holds, merged per organization. */
export async function GET(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? 60);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 200) : 60;
  try {
    const result = await indexedDomains(limit);
    return Response.json(result, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    return Response.json(
      { domains: [], totalPages: 0, totalHosts: 0, error: error instanceof Error ? error.message : "Index domains are unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
