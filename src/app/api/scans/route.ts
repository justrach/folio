import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "@/lib/auth";
import { readJsonBody } from "@/lib/api-request";
import { getDb } from "@/lib/db";
import { EVALUATION_VERSION } from "@/lib/evaluation";
import {
  normalizeScanUrl,
  ScanError,
  scanWebsite,
  type ScanResult,
} from "@/lib/scanner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function errorResponse(error: unknown) {
  if (error instanceof ScanError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Scan API error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "Scanning is unavailable. Check the authentication and D1 configuration, then try again.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session)
      return Response.json(
        { error: "Sign in to view your scan history." },
        { status: 401 },
      );
    const db = await getDb();
    const siteId = new URL(request.url).searchParams.get("siteId");
    const query = siteId
      ? db
          .prepare(
            "SELECT result_json FROM scans WHERE user_id = ? AND site_id = ? ORDER BY created_at DESC LIMIT 50",
          )
          .bind(session.user.id, siteId)
      : db
          .prepare(
            "SELECT result_json FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
          )
          .bind(session.user.id);
    const { results } = await query.all<{ result_json: string }>();
    return Response.json(
      {
        scans: results.map((row) => JSON.parse(row.result_json) as ScanResult),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session)
      return Response.json(
        { error: "Sign in to run and save a website scan." },
        { status: 401 },
      );
    const body = await readJsonBody(request);
    if (typeof body.url !== "string")
      throw new ScanError("Provide a website URL.");
    const submittedUrl = normalizeScanUrl(body.url);
    const db = await getDb();
    const recent = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM scans WHERE user_id = ? AND created_at > ?",
      )
      .bind(session.user.id, Date.now() - 3_600_000)
      .first<{ count: number }>();
    if ((recent?.count ?? 0) >= 20)
      return Response.json(
        {
          error:
            "You have reached the limit of 20 completed scans per hour. Try again later.",
        },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    const { env } = await getCloudflareContext({ async: true });
    const result = await scanWebsite(submittedUrl.href, {
      allowedHosts: env.SCAN_ALLOWED_HOSTS || process.env.SCAN_ALLOWED_HOSTS,
    });
    const siteId = crypto.randomUUID();
    // The owner key is included in every lookup; another user's site cannot be attached.
    await db
      .prepare(
        "INSERT INTO sites (id, user_id, url, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, url) DO NOTHING",
      )
      .bind(
        siteId,
        session.user.id,
        submittedUrl.href,
        submittedUrl.hostname,
        Date.now(),
      )
      .run();
    const site = await db
      .prepare("SELECT id FROM sites WHERE user_id = ? AND url = ?")
      .bind(session.user.id, submittedUrl.href)
      .first<{ id: string }>();
    if (!site) throw new Error("The scanned site could not be persisted.");
    await db
      .prepare(
        "INSERT INTO scans (id, site_id, user_id, url, created_at, seo_score, result_json, evaluation_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        result.id,
        site.id,
        session.user.id,
        result.url,
        Date.parse(result.createdAt),
        result.seoScore,
        JSON.stringify(result),
        EVALUATION_VERSION,
      )
      .run();
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
