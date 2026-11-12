import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { createPostgresDatabase, type PgExecutor } from "../src/lib/pg/database";
import { adminOverview, ADMIN_DATABASE_SIZE_SQL, ADMIN_PAGES_SQL, ADMIN_PRIORITIES_SQL, ADMIN_QUEUE_SQL, ADMIN_TABLES_SQL } from "../src/lib/admin-data";

const PAGES = { pages: 3970, domains: 12, latest_fetched_at: new Date("2026-11-11T05:10:00Z"), last_24h: 40, embedded: 3500 };
const QUEUE = { unread: 9, extracted: 591, failed: 2, total: 602 };
const SIZE = { database_bytes: 2_147_483_648 };
const PRIORITIES = [{ verdict: "crawl", domains: 4, pending: "120" }, { verdict: "skip", domains: 2, pending: null }];
const TABLES = [{ name: "pages", bytes: 1_000_000 }];

/** A fake database that answers the admin reads, throws for the ones named in `failing`, and records every statement. */
type Read = "pages" | "queue" | "size" | "priorities" | "tables";
const READS: Record<Read, [string, unknown[]]> = { pages: [ADMIN_PAGES_SQL, [PAGES]], queue: [ADMIN_QUEUE_SQL, [QUEUE]], size: [ADMIN_DATABASE_SIZE_SQL, [SIZE]],
  priorities: [ADMIN_PRIORITIES_SQL, PRIORITIES], tables: [ADMIN_TABLES_SQL, TABLES] };
function fakeDatabase(failing: Read[] = []) {
  const calls: string[] = [];
  const executor: PgExecutor = {
    async query<T>(sql: string) {
      calls.push(sql);
      const which = (Object.keys(READS) as Read[]).find(key => READS[key][0] === sql);
      if (!which) throw new Error(`Unexpected statement: ${sql}`);
      if (failing.includes(which)) throw new Error("Connection terminated due to connection timeout");
      const rows = READS[which][1];
      return { rows: rows as T[], rowCount: rows.length };
    },
  };
  return { db: async () => createPostgresDatabase(executor) as unknown as D1Database, calls };
}
const quiet = <T>(work: () => Promise<T>) => { const error = console.error; console.error = () => {}; return work().finally(() => { console.error = error; }); };

test("admin overview reads every figure in five statements and none of the domain listing queries", async () => {
  const { db, calls } = fakeDatabase();
  const overview = await adminOverview({ db, turbopufferKey: undefined });
  assert.equal(calls.length, 5);
  assert.equal(new Set(calls).size, 5, "each statement once");
  assert.ok(calls.every(sql => !/GROUP BY 1|split_part/.test(sql)), "the unused top-domains listing is not issued");
  assert.deepEqual(overview.index, { pages: 3970, domains: 12, embedded: 3500, updatedAt: "2026-11-11T05:10:00.000Z" });
  assert.deepEqual(overview.queue, { unread: 9, extracted: 591, failed: 2, total: 602 });
  assert.deepEqual(overview.crawl, { latestFetchedAt: "2026-11-11T05:10:00.000Z", last24h: 40 });
  assert.deepEqual(overview.priorities, [{ verdict: "crawl", domains: 4, pending: 120 }, { verdict: "skip", domains: 2, pending: null }]);
  assert.deepEqual(overview.storage, { databaseBytes: 2_147_483_648, tableBytes: [{ name: "pages", bytes: 1_000_000 }] });
  assert.equal(overview.vectors.state, "no_key");
});

test("one failed read marks only its own section unavailable", async () => {
  const { db, calls } = fakeDatabase(["priorities"]);
  const overview = await quiet(() => adminOverview({ db, turbopufferKey: undefined }));
  assert.equal(calls.length, 5, "a failure does not stop the other reads");
  assert.equal(overview.priorities, null, "couldn't be read, not an empty list");
  assert.equal(overview.queue?.total, 602);
  assert.equal(overview.storage.tableBytes?.length, 1);

  // The pages statement failing takes the index and crawl figures with it, but the queue and database size still render.
  const pagesDown = await quiet(() => adminOverview({ db: fakeDatabase(["pages"]).db, turbopufferKey: undefined }));
  assert.equal(pagesDown.index, null);
  assert.equal(pagesDown.crawl, null);
  assert.deepEqual(pagesDown.queue, { unread: 9, extracted: 591, failed: 2, total: 602 });
  assert.equal(pagesDown.storage.databaseBytes, 2_147_483_648);
  assert.equal(pagesDown.storage.tableBytes?.length, 1);
  assert.equal(pagesDown.priorities?.length, 2);

  const sizeDown = await quiet(() => adminOverview({ db: fakeDatabase(["size"]).db, turbopufferKey: undefined }));
  assert.equal(sizeDown.storage.databaseBytes, null);
  assert.equal(sizeDown.index?.pages, 3970);
  assert.equal(sizeDown.queue?.total, 602);
});

test("every read failing, or no database at all, still resolves with each section unavailable", async () => {
  const unavailable = { index: null, queue: null, priorities: null, crawl: null, storage: { databaseBytes: null, tableBytes: null } };
  const { db } = fakeDatabase(["pages", "queue", "size", "priorities", "tables"]);
  const overview = await quiet(() => adminOverview({ db, turbopufferKey: undefined }));
  assert.deepEqual({ ...overview, vectors: undefined }, { ...unavailable, vectors: undefined });

  const noDatabase = await quiet(() => adminOverview({ db: async () => { throw new Error("DB_ENGINE=postgres requires HYPERDRIVE or PLANETSCALE_APP_URL."); }, turbopufferKey: undefined }));
  assert.deepEqual({ ...noDatabase, vectors: undefined }, { ...unavailable, vectors: undefined });
});

test("the vector store says whether it was read, has no key, or couldn't be reached", async () => {
  const { db } = fakeDatabase();
  const read = await adminOverview({ db, turbopufferKey: "fixture", fetch: (async () => Response.json({ approx_row_count: 3500, approx_logical_bytes: 10, index: { status: "up-to-date" } })) as typeof fetch });
  assert.deepEqual([read.vectors.state, read.vectors.rows, read.vectors.indexStatus], ["read", 3500, "up-to-date"]);
  const down = await adminOverview({ db, turbopufferKey: "fixture", fetch: (async () => { throw new Error("timeout"); }) as typeof fetch });
  assert.deepEqual([down.vectors.state, down.vectors.rows], ["unavailable", null]);
});
