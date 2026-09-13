import { getSession } from "@/lib/auth";
import { readJsonBody } from "@/lib/api-request";
import { getDb } from "@/lib/db";
import { normalizeScanUrl, ScanError } from "@/lib/scanner";

export const dynamic = "force-dynamic";

type SiteRow = {
  id: string;
  url: string;
  name: string;
  created_at: number;
  is_public: number;
  seo_score?: number | null;
  last_scanned_at?: number | null;
};
const serializeSite = (site: SiteRow) => ({
  id: site.id,
  url: site.url,
  name: site.name,
  createdAt: new Date(site.created_at).toISOString(),
  isPublic: Boolean(site.is_public),
  seoScore: site.seo_score ?? null,
  lastScannedAt: site.last_scanned_at
    ? new Date(site.last_scanned_at).toISOString()
    : null,
});

function errorResponse(error: unknown) {
  if (error instanceof ScanError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Sites API error",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error:
        "Sites are unavailable. Check the authentication and D1 configuration, then try again.",
    },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session)
      return Response.json(
        { error: "Sign in to view your sites." },
        { status: 401 },
      );
    const db = await getDb();
    const { results } = await db
      .prepare(
        `SELECT s.id, s.url, s.name, s.created_at, s.is_public,
      (SELECT seo_score FROM scans WHERE site_id = s.id AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1) AS seo_score,
      (SELECT created_at FROM scans WHERE site_id = s.id AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1) AS last_scanned_at
      FROM sites s WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100`,
      )
      .bind(session.user.id, session.user.id, session.user.id)
      .all<SiteRow>();
    return Response.json(
      { sites: results.map(serializeSite) },
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
        { error: "Sign in to add a site." },
        { status: 401 },
      );
    const body = await readJsonBody(request);
    if (typeof body.url !== "string")
      throw new ScanError("Provide a website URL.");
    const url = normalizeScanUrl(body.url);
    const db = await getDb();
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM sites WHERE user_id = ?")
      .bind(session.user.id)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= 100)
      throw new ScanError("This workspace supports up to 100 sites.", 409);
    await db
      .prepare(
        "INSERT INTO sites (id, user_id, url, name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, url) DO NOTHING",
      )
      .bind(
        crypto.randomUUID(),
        session.user.id,
        url.href,
        url.hostname,
        Date.now(),
      )
      .run();
    const site = await db
      .prepare(
        "SELECT id, url, name, created_at, is_public FROM sites WHERE user_id = ? AND url = ?",
      )
      .bind(session.user.id, url.href)
      .first<SiteRow>();
    if (!site) throw new Error("The site could not be persisted.");
    return Response.json(
      { site: serializeSite(site) },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session)
      return Response.json(
        { error: "Sign in to change site publication." },
        { status: 401 },
      );
    const body = await readJsonBody(request);
    if (typeof body.id !== "string" || typeof body.isPublic !== "boolean")
      throw new ScanError("Provide a site id and an isPublic boolean.");
    const db = await getDb();
    const site = await db
      .prepare(
        "SELECT id, url, name, created_at, is_public FROM sites WHERE id = ? AND user_id = ?",
      )
      .bind(body.id, session.user.id)
      .first<SiteRow>();
    if (!site)
      return Response.json({ error: "Site not found." }, { status: 404 });
    await db
      .prepare("UPDATE sites SET is_public = ? WHERE id = ? AND user_id = ?")
      .bind(body.isPublic ? 1 : 0, site.id, session.user.id)
      .run();
    return Response.json(
      { site: serializeSite({ ...site, is_public: body.isPublic ? 1 : 0 }) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
