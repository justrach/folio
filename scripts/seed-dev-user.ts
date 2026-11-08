/**
 * Seed the local pseudo-auth account so the app has something to show.
 *
 *   bun run dev:seed
 *
 * Creates (or reuses) the DEV_AUTH_USER_ID account, one saved website with a
 * published scan, and one demo evaluation. It writes to whichever engine
 * DB_ENGINE selects, so it works against the local Postgres mirror.
 */
import pg from "pg";
import { createPostgresDatabase } from "../src/lib/pg/database";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { createEvaluationRun } from "../src/lib/eval-store";

async function main() {
  const owner = (process.env.DEV_AUTH_USER_ID ?? "dev-local-user").trim();
  const email = (process.env.DEV_AUTH_EMAIL ?? "dev@folio.local").trim();
  const name = (process.env.DEV_AUTH_NAME ?? "Local dev user").trim();
  const connectionString = process.env.PLANETSCALE_APP_URL;
  if (process.env.DB_ENGINE !== "postgres" || !connectionString) {
    console.error("Set DB_ENGINE=postgres and PLANETSCALE_APP_URL in .dev.vars first.");
    process.exit(2);
  }

  const pool = new pg.Pool({ connectionString: connectionString.split("?")[0], ssl: { rejectUnauthorized: false }, max: 2 });
  const db = createPostgresDatabase({
    query: async (sql, values) => {
      const result = await pool.query(sql, values as never[]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  }) as never;
  const now = Date.now();

  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, $5) ON CONFLICT (id) DO UPDATE SET name = excluded.name`,
    [owner, name, email, now, now],
  );

  const siteId = `dev-site-${owner}`;
  await pool.query(
    `INSERT INTO sites (id, user_id, url, name, created_at, is_public)
     VALUES ($1, $2, $3, $4, $5, 1) ON CONFLICT (id) DO NOTHING`,
    [siteId, owner, "https://sable.example/", "Sable Analytics · local demo", now],
  );
  const scanId = `dev-scan-${owner}`;
  await pool.query(
    `INSERT INTO scans (id, user_id, site_id, url, seo_score, result_json, evaluation_version, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
    [scanId, owner, siteId, "https://sable.example/", 82.5, JSON.stringify({
      id: scanId,
      url: "https://sable.example/",
      submittedUrl: "https://sable.example/",
      createdAt: new Date(now).toISOString(),
      score: 82.5,
      checks: [],
      contentHash: "local-dev-seed",
      bytesFetched: 0,
      source: "local",
      pageCount: 1,
    }), "readiness-v1", now],
  );

  const existing = await pool.query("SELECT id FROM evaluation_runs WHERE user_id = $1 LIMIT 1", [owner]);
  let runId: string | null = existing.rows[0]?.id ?? null;
  if (!runId) {
    const demo = await createDemoEvaluationRun();
    const created = await createEvaluationRun(db, owner, { ...demo, id: crypto.randomUUID(), mode: "demo" });
    runId = created.id;
  }

  console.log(JSON.stringify({ owner, email, siteId, scanId, evaluationRunId: runId }));
  await pool.end();
}

main().catch(error => { console.error(error); process.exit(1); });
