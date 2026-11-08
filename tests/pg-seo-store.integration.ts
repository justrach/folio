/** Real Postgres proof for the D1 compatibility layer.
 *
 *   set -a; . .dev.vars; set +a
 *   node --conditions=react-server --import tsx --test tests/pg-seo-store.integration.ts
 *
 * Skips when PLANETSCALE_APP_URL is absent. Uses a throwaway schema so it never
 * touches the mirrored tables.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { Pool, types } from "pg";
import type { D1Database } from "@cloudflare/workers-types";
import { createPostgresDatabase, type PgExecutor } from "../src/lib/pg/database";
import {
  completeSeoReport,
  getOwnedSeoReport,
  listOwnedSeoReports,
  reserveSeoReport,
  saveSeoReportDetail,
} from "../src/lib/seo-store";
import { fetchSeoDetail, fetchSeoOverview } from "../src/lib/dataforseo";

types.setTypeParser(20, value => Number(value));

const URL = process.env.PLANETSCALE_APP_URL;
const SCHEMA = "folio_test_seo";
const env = {
  DATAFORSEO_LOGIN: "fixture-login",
  DATAFORSEO_PASSWORD: "fixture-password",
  DATAFORSEO_ALLOWED_USER_IDS: "alice",
};

function executorFor(pool: Pool): PgExecutor {
  return {
    query: async (sql, values) => {
      const result = await pool.query(sql, values as never[]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

test("seo-store runs on Postgres through the D1 adapter", { skip: !URL && "PLANETSCALE_APP_URL is not set", timeout: 120_000 }, async t => {
  const connection = URL!.split("?")[0];
  const admin = new Pool({ connectionString: connection, ssl: { rejectUnauthorized: false }, max: 2 });
  t.after(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    await admin.end();
  });

  await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  const client = await admin.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query(`CREATE TABLE "user" (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL UNIQUE,
      email_verified integer NOT NULL DEFAULT 0, image text, created_at bigint NOT NULL, updated_at bigint NOT NULL)`);
    await client.query(`CREATE TABLE seo_reports (id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, domain text NOT NULL,
      created_at bigint NOT NULL, retrieved_at bigint, result_json text, detail_json text, detail_retrieved_at bigint)`);
    await client.query(`INSERT INTO "user" (id, name, email, created_at, updated_at)
      VALUES ('alice', 'Alice', 'alice@example.test', 1, 1)`);
  } finally {
    client.release();
  }

  const pool = new Pool({ connectionString: connection, ssl: { rejectUnauthorized: false }, max: 3, options: `-c search_path=${SCHEMA}` });
  t.after(() => pool.end());
  const db = createPostgresDatabase(executorFor(pool)) as unknown as D1Database;

  const reserved = await reserveSeoReport(db, "alice", "https://www.example.com/path");
  assert.equal(reserved.domain, "example.com");
  assert.equal(reserved.state, "pending");

  const overview = await fetchSeoOverview("example.com", { userId: "alice" }, {
    env,
    fetcher: async () => Response.json({ status_code: 20000, cost: 0.01, tasks: [{ status_code: 20000, cost: 0.01, id: "t", result: [] }] }),
  });
  const saved = await completeSeoReport(db, "alice", reserved.id, overview);
  assert.equal(saved.state, "complete");
  assert.ok(saved.retrievedAt);

  const detail = await fetchSeoDetail("example.com", { userId: "alice" }, {
    env,
    fetcher: async input => Response.json({
      status_code: 20000, cost: 0.01,
      tasks: [{ status_code: 20000, cost: 0.01, id: "t", result: [String(input).includes("ranked_keywords")
        ? { items: [{ keyword_data: { keyword: "example pricing", keyword_info: { search_volume: 900 } },
            ranked_serp_element: { serp_item: { rank_absolute: 3, url: "https://example.com/pricing", etv: 4.5 } } }] }
        : { items: [{ url_from: "https://source.example/post", domain_from: "source.example", rank: 55 }] }] }],
    }),
  });
  const withDetail = await saveSeoReportDetail(db, "alice", saved.id, detail);
  assert.equal(withDetail.detail?.keywords.data?.rows[0].keyword, "example pricing");
  assert.equal(withDetail.detail?.backlinks.data?.rows.length, 1);

  const reopened = await getOwnedSeoReport(db, "alice", saved.id);
  assert.equal(reopened?.detail?.keywords.data?.rows.length, 1);
  assert.equal(reopened?.result?.domain, "example.com");

  const summary = (await listOwnedSeoReports(db, "alice"))[0];
  assert.equal(summary.detailState, "collected");
  assert.equal(summary.status, "complete");

  await assert.rejects(() => saveSeoReportDetail(db, "alice", saved.id, detail), /already has saved detail rows/);
  assert.equal(await getOwnedSeoReport(db, "bob", saved.id), null);
});
