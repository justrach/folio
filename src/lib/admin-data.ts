import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { getDb } from "@/lib/db";
import { withLimit } from "@/lib/sequential";
import READ_PLAN from "../data/read-plan.json";

/** Each section is its data, or `null` when it couldn't be read: never a zero or an empty list standing in for a failure. */
export type AdminOverview = {
  index: { pages: number; domains: number; embedded: number; updatedAt: string | null } | null;
  vectors: { state: "read" | "no_key" | "unavailable"; rows: number | null; bytes: number | null; indexStatus: string | null; namespace: string; region: string };
  queue: { unread: number; extracted: number; failed: number; total: number } | null;
  priorities: { verdict: string; domains: number; pending: number | null }[] | null;
  storage: { databaseBytes: number | null; tableBytes: { name: string; bytes: number }[] | null };
  crawl: { latestFetchedAt: string | null; last24h: number } | null;
};

const TURBOPUFFER_REGION = "gcp-us-central1";
const TURBOPUFFER_NAMESPACE = "folio-pages";

/** Index figures and the 24-hour crawl count: one pass over `research.pages`, plus the embeddings marker count. */
export const ADMIN_PAGES_SQL = `SELECT COUNT(*) AS pages,
       COUNT(DISTINCT site_domain) AS domains,
       MAX(fetched_at) AS latest_fetched_at,
       COUNT(*) FILTER (WHERE fetched_at > now() - interval '24 hours') AS last_24h,
       (SELECT COUNT(*) FROM research.page_embedding_ids) AS embedded
  FROM research.pages`;

export const ADMIN_QUEUE_SQL = `SELECT COUNT(*) FILTER (WHERE content_state = 'none') AS unread,
       COUNT(*) FILTER (WHERE content_state = 'extracted') AS extracted,
       COUNT(*) FILTER (WHERE content_state = 'failed') AS failed,
       COUNT(*) AS total
  FROM research.urls`;

export const ADMIN_DATABASE_SIZE_SQL = "SELECT pg_database_size(current_database()) AS database_bytes";

export const ADMIN_PRIORITIES_SQL = `SELECT verdict, COUNT(*) AS domains, SUM(pending) AS pending
  FROM research.crawl_priorities GROUP BY verdict ORDER BY SUM(pending) DESC`;

export const ADMIN_TABLES_SQL = `SELECT relname AS name, pg_total_relation_size(oid) AS bytes
  FROM pg_class
 WHERE relnamespace = 'research'::regnamespace AND relkind = 'r'
 ORDER BY bytes DESC LIMIT 6`;

type PagesRow = { pages: number | string; domains: number | string; latest_fetched_at: string | Date | null; last_24h: number | string; embedded: number | string };
type QueueRow = { unread: number | string; extracted: number | string; failed: number | string; total: number | string };

const timestamp = (value: string | Date | null | undefined) => value == null ? null : value instanceof Date ? value.toISOString() : String(value);
const settle = <T>(read: () => Promise<T>, section: string) => async (): Promise<T | null> => {
  try { return await read(); } catch (error) {
    console.error(`adminOverview: ${section} couldn't be read`, error instanceof Error ? error.message : error);
    return null;
  }
};

async function vectorStore(key: string | undefined, fetcher: typeof fetch): Promise<AdminOverview["vectors"]> {
  const base = { rows: null, bytes: null, indexStatus: null, namespace: TURBOPUFFER_NAMESPACE, region: TURBOPUFFER_REGION };
  if (!key) return { state: "no_key", ...base };
  try {
    const response = await fetcher(
      `https://${TURBOPUFFER_REGION}.turbopuffer.com/v2/namespaces/${TURBOPUFFER_NAMESPACE}/metadata`,
      { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000), cache: "no-store" },
    );
    if (!response.ok) return { state: "unavailable", ...base };
    const meta = await response.json() as { approx_row_count?: number; approx_logical_bytes?: number; index?: { status?: string } };
    return { ...base, state: "read", rows: meta.approx_row_count ?? null, bytes: meta.approx_logical_bytes ?? null, indexStatus: meta.index?.status ?? null };
  } catch {
    return { state: "unavailable", ...base };
  }
}

export type AdminOverviewSources = { db?: () => Promise<D1Database>; turbopufferKey?: string; fetch?: typeof fetch };

/**
 * The admin page's figures. Never rejects: each read settles on its own, and a section whose read fails is `null`, so
 * the page says so for that section only. Five statements (pages, queue, database size, rated domains, largest
 * tables), each its own round trip with its own query timeout, at most `readLimit` in flight (src/data/read-plan.json).
 */
export async function adminOverview(sources: AdminOverviewSources = {}): Promise<AdminOverview> {
  const open = sources.db ?? getDb;
  let database: Promise<D1Database> | null = null;
  const db = () => (database ??= open());
  const vectors = vectorStore("turbopufferKey" in sources ? sources.turbopufferKey : process.env.TURBOPUFFER_API_KEY, sources.fetch ?? fetch);
  const [pages, queue, size, priorities, tables] = await withLimit(READ_PLAN.readLimit, [
    settle(async () => (await db()).prepare(ADMIN_PAGES_SQL).first<PagesRow>(), "index and crawl figures"),
    settle(async () => (await db()).prepare(ADMIN_QUEUE_SQL).first<QueueRow>(), "crawl queue"),
    settle(async () => (await db()).prepare(ADMIN_DATABASE_SIZE_SQL).first<{ database_bytes: number | string | null }>(), "database size"),
    settle(async () => (await (await db()).prepare(ADMIN_PRIORITIES_SQL).all<{ verdict: string; domains: number | string; pending: number | string | null }>()).results, "rated domains"),
    settle(async () => (await (await db()).prepare(ADMIN_TABLES_SQL).all<{ name: string; bytes: number | string }>()).results, "largest tables"),
  ] as const);
  return {
    index: pages ? { pages: Number(pages.pages), domains: Number(pages.domains), embedded: Number(pages.embedded), updatedAt: timestamp(pages.latest_fetched_at) } : null,
    vectors: await vectors,
    queue: queue ? { unread: Number(queue.unread), extracted: Number(queue.extracted), failed: Number(queue.failed), total: Number(queue.total) } : null,
    priorities: priorities && priorities.map(item => ({ verdict: item.verdict, domains: Number(item.domains), pending: item.pending === null ? null : Number(item.pending) })),
    storage: {
      databaseBytes: size && size.database_bytes !== null ? Number(size.database_bytes) : null,
      tableBytes: tables && tables.map(item => ({ name: item.name, bytes: Number(item.bytes) })),
    },
    crawl: pages ? { latestFetchedAt: timestamp(pages.latest_fetched_at), last24h: Number(pages.last_24h) } : null,
  };
}

export type { AdminOverview as Overview };
