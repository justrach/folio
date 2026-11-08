import "server-only";
import { getDb } from "@/lib/db";
import { indexStats, indexedDomains } from "@/lib/index-stats";

export type AdminOverview = {
  index: { pages: number; domains: number; embedded: number; updatedAt: string | null };
  vectors: { rows: number | null; bytes: number | null; indexStatus: string | null; namespace: string; region: string };
  queue: { unread: number; extracted: number; failed: number; total: number };
  priorities: { verdict: string; domains: number | null; pending: number | null }[];
  storage: { databaseBytes: number | null; tableBytes: { name: string; bytes: number }[] };
  crawl: { latestFetchedAt: string | null; last24h: number | null };
};

const TURBOPUFFER_REGION = "gcp-us-central1";
const TURBOPUFFER_NAMESPACE = "folio-pages";

export async function adminOverview(): Promise<AdminOverview> {
  const db = await getDb();
  const index = await indexStats();
  const topDomains = await indexedDomains(8);

  const queue = await db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE content_state = 'none') AS unread,
         COUNT(*) FILTER (WHERE content_state = 'extracted') AS extracted,
         COUNT(*) FILTER (WHERE content_state = 'failed') AS failed,
         COUNT(*) AS total
       FROM research.urls`,
    )
    .first<{ unread: number; extracted: number; failed: number; total: number }>();

  const priorities = await db
    .prepare(
      `SELECT verdict, COUNT(*) AS domains, SUM(pending) AS pending
         FROM research.crawl_priorities GROUP BY verdict ORDER BY SUM(pending) DESC`,
    )
    .all<{ verdict: string; domains: number; pending: string }>();

  const size = await db
    .prepare("SELECT pg_database_size(current_database()) AS bytes")
    .first<{ bytes: string }>();

  const tables = await db
    .prepare(
      `SELECT relname AS name, pg_total_relation_size(oid) AS bytes
         FROM pg_class
        WHERE relnamespace = 'research'::regnamespace AND relkind = 'r'
        ORDER BY bytes DESC LIMIT 6`,
    )
    .all<{ name: string; bytes: string }>();

  const recent = await db
    .prepare("SELECT COUNT(*) AS n, MAX(fetched_at) AS latest FROM research.pages WHERE fetched_at > now() - interval '24 hours'")
    .first<{ n: number; latest: string | null }>();

  let vectors: AdminOverview["vectors"] = {
    rows: null, bytes: null, indexStatus: null,
    namespace: TURBOPUFFER_NAMESPACE, region: TURBOPUFFER_REGION,
  };
  const key = process.env.TURBOPUFFER_API_KEY;
  if (key) {
    try {
      const response = await fetch(
        `https://${TURBOPUFFER_REGION}.turbopuffer.com/v2/namespaces/${TURBOPUFFER_NAMESPACE}/metadata`,
        { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000), cache: "no-store" },
      );
      if (response.ok) {
        const meta = await response.json() as { approx_row_count?: number; approx_logical_bytes?: number; index?: { status?: string } };
        vectors = {
          rows: meta.approx_row_count ?? null,
          bytes: meta.approx_logical_bytes ?? null,
          indexStatus: meta.index?.status ?? null,
          namespace: TURBOPUFFER_NAMESPACE,
          region: TURBOPUFFER_REGION,
        };
      }
    } catch {
      // Leave the vector panel in its unknown state rather than failing the page.
    }
  }

  return {
    index,
    vectors,
    queue: {
      unread: Number(queue?.unread ?? 0),
      extracted: Number(queue?.extracted ?? 0),
      failed: Number(queue?.failed ?? 0),
      total: Number(queue?.total ?? 0),
    },
    priorities: priorities.results.map(row => ({
      verdict: row.verdict,
      domains: Number(row.domains),
      pending: row.pending === null ? null : Number(row.pending),
    })),
    storage: {
      databaseBytes: size?.bytes ? Number(size.bytes) : null,
      tableBytes: tables.results.map(row => ({ name: row.name, bytes: Number(row.bytes) })),
    },
    crawl: { latestFetchedAt: recent?.latest ?? null, last24h: recent === undefined ? null : Number(recent?.n ?? 0) },
  };
}

export type { IndexedDomain } from "@/lib/index-stats";
export type { AdminOverview as Overview };
export const _topDomains = indexedDomains;
