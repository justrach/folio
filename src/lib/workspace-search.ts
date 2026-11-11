import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import type { WorkspaceSearchIndex } from "./command-search";
import { AgentApiError } from "./agent-api-key-store";
import { keyReadsOrganization } from "./agent-observation-types";
import { listOrganizations } from "./organizations";
import { sequentially } from "./sequential";

const iso = (value: unknown) => new Date(Number(value)).toISOString();
const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return url; } };

/**
 * What the signed-in person can open from the search box: their websites, saved reports and
 * organizations (with the domains each one shares). Names, IDs and dates only, never report
 * contents. Reads only, one query at a time, and it never joins an organization. `allowed` is an agent key's
 * organization limit (null = all).
 */
export async function workspaceSearchIndex(db: D1Database, userId: string, allowed: string[] | null = null): Promise<WorkspaceSearchIndex> {
  if (!userId) throw new AgentApiError("Sign in to search your websites and reports.", 401, "unauthorized");
  const [sites, seoReports, searchConsole, organizations, shared] = await sequentially([
    () => db.prepare("SELECT id, name, url FROM sites WHERE user_id = ? ORDER BY created_at DESC, id LIMIT 100").bind(userId)
      .all<{ id: string; name: string; url: string }>(),
    () => db.prepare("SELECT id, domain, created_at, CASE WHEN result_json IS NULL THEN 0 ELSE 1 END AS complete FROM seo_reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50")
      .bind(userId).all<{ id: string; domain: string; created_at: number; complete: number }>(),
    () => db.prepare("SELECT id, property, created_at FROM search_console_reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50").bind(userId)
      .all<{ id: string; property: string; created_at: number }>(),
    () => listOrganizations(db, userId),
    () => db.prepare(`SELECT w.organization_id, s.url FROM organization_websites w
      JOIN organization_members m ON m.organization_id = w.organization_id AND m.user_id = ? JOIN sites s ON s.id = w.site_id
      ORDER BY w.shared_at, w.site_id LIMIT 500`).bind(userId).all<{ organization_id: string; url: string }>(),
  ] as const);
  return {
    websites: sites.results.map(row => ({ id: row.id, name: row.name, url: row.url })),
    seoReports: seoReports.results.map(row => ({ id: row.id, domain: row.domain, createdAt: iso(row.created_at), complete: Number(row.complete) === 1 })),
    searchConsole: searchConsole.results.map(row => ({ id: row.id, property: row.property, createdAt: iso(row.created_at) })),
    organizations: organizations.filter(org => keyReadsOrganization(allowed, org.id)).map(org => ({ id: org.id, name: org.name, role: org.role, members: org.members,
      domains: [...new Set(shared.results.filter(row => row.organization_id === org.id).map(row => hostOf(row.url)))] })),
  };
}
