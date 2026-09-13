import { getDb } from "@/lib/db";
import { EVALUATION_VERSION, evaluationMethodology } from "@/lib/evaluation";

export const dynamic = "force-dynamic";

/** Only explicitly published, completed scans using the same rubric are comparable. */
export async function GET() {
  try {
    const db = await getDb();
    const { results } = await db
      .prepare(
        `WITH latest AS (
      SELECT sites.id, sites.url, sites.name, scans.seo_score, scans.created_at,
        ROW_NUMBER() OVER (PARTITION BY sites.url ORDER BY scans.created_at DESC, scans.id DESC) AS row_number
      FROM sites JOIN scans ON scans.site_id = sites.id AND scans.user_id = sites.user_id
      WHERE sites.is_public = 1 AND scans.evaluation_version = ?
    ) SELECT id, url, name, seo_score, created_at FROM latest
      WHERE row_number = 1 ORDER BY seo_score DESC, url ASC LIMIT 100`,
      )
      .bind(EVALUATION_VERSION)
      .all<{
        id: string;
        url: string;
        name: string;
        seo_score: number;
        created_at: number;
      }>();
    let rank = 0;
    const sites = results.map((row, index) => {
      if (index === 0 || row.seo_score !== results[index - 1].seo_score)
        rank = index + 1;
      return {
        id: row.id,
        url: row.url,
        name: row.name,
        score: row.seo_score,
        rank,
        scannedAt: new Date(row.created_at).toISOString(),
        evaluationVersion: EVALUATION_VERSION,
        source: "published-scan",
      };
    });
    return Response.json(
      {
        sites,
        methodology: evaluationMethodology,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Leaderboard API error",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        error:
          "The published leaderboard is unavailable. Database setup may be required.",
        sites: [],
        methodology: evaluationMethodology,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
