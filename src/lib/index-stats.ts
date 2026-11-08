import "server-only";
import { getDb } from "@/lib/db";

/**
 * Size of the internally crawled index, read from the research schema.
 *
 * The landing copy used to describe a fixed sample batch, so it could never grow
 * with the crawl. This reports what is actually stored. Cached for five minutes
 * per isolate: the number moves in batches, not per request.
 */
export type IndexStats = { available: boolean; pages: number; domains: number; embedded: number; updatedAt: string | null };

let cache: { value: IndexStats; at: number } | null = null;
const TTL = 5 * 60_000;

export async function indexStats(): Promise<IndexStats> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  const empty: IndexStats = { available: false, pages: 0, domains: 0, embedded: 0, updatedAt: null };
  const env = process.env as unknown as { DB_ENGINE?: string };
  if ((env.DB_ENGINE ?? process.env.DB_ENGINE) !== "postgres") return empty;
  try {
    const db = await getDb();
    const pages = await db.prepare("SELECT COUNT(*) AS pages FROM research.pages").first<{ pages: number }>();
    // site_domain is written on ingest by research.registrable_domain(), so this
    // counts organizations rather than hostnames.
    const domains = await db.prepare(
      "SELECT COUNT(DISTINCT site_domain) AS domains FROM research.pages WHERE site_domain IS NOT NULL",
    ).first<{ domains: number }>();
    const embedded = await db.prepare("SELECT COUNT(*) AS embedded FROM research.page_embeddings_v2").first<{ embedded: number }>();
    const latest = await db.prepare("SELECT MAX(fetched_at) AS at FROM research.pages").first<{ at: string | null }>();
    const value: IndexStats = {
      available: true,
      pages: Number(pages?.pages ?? 0),
      domains: Number(domains?.domains ?? 0),
      embedded: Number(embedded?.embedded ?? 0),
      updatedAt: latest?.at ?? null,
    };
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return empty;
  }
}

export type IndexedDomain = { domain: string; hosts: number; pages: number; lastFetched: string | null };

// Registrable-domain approximation: drop `www.`, and keep the last two labels
// except for known multi-part suffixes. Without this, www.coursera.org,
// coursera.support and blog.coursera.org rank as three separate "domains".
const MULTI_PART = new Set(["co.uk", "org.uk", "ac.uk", "co.jp", "com.au", "net.au", "co.nz", "com.br", "co.in", "com.cn", "co.za"]);

export function registrableDomain(host: string): string {
  const clean = host.toLowerCase().replace(/^www\./, "").replace(/:\d+$/, "");
  const parts = clean.split(".").filter(Boolean);
  if (parts.length <= 2) return clean;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_PART.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

/** The domains the crawler holds, grouped by the site_domain written on ingest. */
export async function indexedDomains(limit = 60): Promise<{ domains: IndexedDomain[]; totalPages: number; totalHosts: number }> {
  const env = process.env as unknown as { DB_ENGINE?: string };
  const empty = { domains: [], totalPages: 0, totalHosts: 0 };
  if ((env.DB_ENGINE ?? process.env.DB_ENGINE) !== "postgres") return empty;
  try {
    const db = await getDb();
    const { results } = await db
      .prepare(
        `SELECT site_domain AS domain,
                COUNT(*) AS pages,
                COUNT(DISTINCT split_part(replace(replace(url, 'https://', ''), 'http://', ''), '/', 1)) AS hosts,
                MAX(fetched_at) AS last_fetched
           FROM research.pages
          WHERE site_domain IS NOT NULL
          GROUP BY 1 ORDER BY pages DESC, domain ASC LIMIT ?`,
      )
      .bind(Math.min(Math.max(limit, 1), 200))
      .all<{ domain: string; pages: number; hosts: number; last_fetched: string | null }>();
    const totals = await db
      .prepare(
        `SELECT COUNT(*) AS pages, COUNT(DISTINCT split_part(replace(replace(url, 'https://', ''), 'http://', ''), '/', 1)) AS hosts
           FROM research.pages WHERE site_domain IS NOT NULL`,
      )
      .first<{ pages: number; hosts: number }>();
    return {
      domains: results.map(row => ({ domain: row.domain, hosts: Number(row.hosts), pages: Number(row.pages), lastFetched: row.last_fetched })),
      totalPages: Number(totals?.pages ?? 0),
      totalHosts: Number(totals?.hosts ?? 0),
    };
  } catch (error) {
    throw new Error(`indexedDomains failed: ${error instanceof Error ? error.message : "unknown"}`);
  }
}
