import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { getSavedSearchConsoleReport } from "./search-console-store";
import { normalizeScanUrl, ScanError } from "./scanner";

export type ConnectedWebsite = {
  id: string; url: string; name: string; createdAt: string; isPublic: boolean;
  seoScore: number | null; lastScannedAt: string | null;
};
type SiteRow = { id: string; url: string; name: string; created_at: number; is_public: number; seo_score: number | null; last_scanned_at: number | null };
function propertyWebsite(property: string): URL {
  try {
    if (property.startsWith("sc-domain:")) {
      const host = property.slice("sc-domain:".length);
      if (host.length > 253 || !host.split(".").every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) throw new Error("Invalid hostname");
      return normalizeScanUrl(`https://${host}/`);
    }
    if (!property.startsWith("https://")) throw new Error("HTTPS property required");
    return normalizeScanUrl(property);
  } catch { throw new ScanError("This saved property cannot be added as a public HTTPS website.", 400); }
}
async function existingSite(db: D1Database, ownerId: string, url: string): Promise<ConnectedWebsite | null> {
  const row = await db.prepare(`SELECT s.id,s.url,s.name,s.created_at,s.is_public,
    (SELECT seo_score FROM scans WHERE site_id=s.id AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 1) AS seo_score,
    (SELECT created_at FROM scans WHERE site_id=s.id AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 1) AS last_scanned_at
    FROM sites s WHERE s.user_id=? AND s.url=?`).bind(ownerId, ownerId, ownerId, url).first<SiteRow>();
  return row ? { id: row.id, url: row.url, name: row.name, createdAt: new Date(row.created_at).toISOString(), isPublic: Boolean(row.is_public),
    seoScore: row.seo_score ?? null, lastScannedAt: row.last_scanned_at ? new Date(row.last_scanned_at).toISOString() : null } : null;
}

/** Uses only saved owner evidence. Connecting a website does not query Google or verify domain ownership. */
export async function connectSavedSearchConsoleWebsite(db: D1Database, ownerId: string, reportId: string): Promise<ConnectedWebsite> {
  if (!ownerId) throw new ScanError("Sign in to add a saved website.", 401);
  if (typeof reportId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)) throw new ScanError("Choose a saved Search Console report.", 400);
  const report = await getSavedSearchConsoleReport(db, ownerId, reportId);
  if (!report) throw new ScanError("The saved report is unavailable.", 404);
  const url = propertyWebsite(report.property);
  const existing = await existingSite(db, ownerId, url.href);
  if (existing) return existing;
  // SQLite serializes this count-and-insert statement; concurrent requests cannot exceed the cap.
  await db.prepare(`INSERT INTO sites (id,user_id,url,name,created_at,is_public)
    SELECT ?,?,?,?,?,0 WHERE (SELECT COUNT(*) FROM sites WHERE user_id=?) < 100
      AND EXISTS(SELECT 1 FROM search_console_reports WHERE user_id=? AND id=?)
    ON CONFLICT(user_id,url) DO NOTHING RETURNING id`)
    .bind(crypto.randomUUID(), ownerId, url.href, url.hostname, Date.now(), ownerId, ownerId, reportId).first<{ id: string }>();
  const site = await existingSite(db, ownerId, url.href);
  if (site) return site;
  if (!(await getSavedSearchConsoleReport(db, ownerId, reportId))) throw new ScanError("The saved report is unavailable.", 404);
  throw new ScanError("This workspace has reached its 100-website limit.", 409);
}
