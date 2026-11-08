import { indexStats } from "@/lib/index-stats";

export const dynamic = "force-dynamic";

/** Public: how much evidence the index actually holds. */
export async function GET() {
  const stats = await indexStats();
  return Response.json(stats, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
