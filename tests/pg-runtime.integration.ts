import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/auth-schema-pg";
import { PgD1Database } from "../src/lib/pg-d1";
import { createEvaluationRun, getEvaluationUsage } from "../src/lib/eval-store";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { ownedCostSummary } from "../src/lib/provider-costs";

/** Run explicitly with an isolated PostgreSQL URL, never a production URL:
 * FOLIO_PG_TEST_URL=postgresql://... node --conditions=react-server --import tsx --test tests/pg-runtime.integration.ts
 */
test("PostgreSQL schema, auth, D1 bridge, rollback and concurrent paid-run gate", async () => {
  const url = process.env.FOLIO_PG_TEST_URL;
  if (!url) throw new Error("Set FOLIO_PG_TEST_URL to the isolated localhost:55432 PostgreSQL server.");
  if (!/^postgres(?:ql)?:\/\/[^@]*@?127\.0\.0\.1:55432\//.test(url))
    throw new Error("PostgreSQL integration tests only accept the isolated localhost:55432 server.");
  const schemaName = `folio_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 2 });
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schemaName},public`, max: 4 });
  try {
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    const ddl = await readFile(new URL("../migrations/postgres/0001_schema.sql", import.meta.url), "utf8");
    await pool.query(ddl);
    const auth = betterAuth({
      appName: "Folio isolated PostgreSQL integration", baseURL: "http://folio.test",
      secret: "folio-postgres-test-only-secret-not-for-deployment",
      database: drizzleAdapter(drizzle(pool, { schema }), { provider: "pg", schema }),
      emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
      rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
      telemetry: { enabled: false },
    });
    const response = await auth.api.signUpEmail({ body: {
      name: "Postgres fixture", email: "fixture@folio.test", password: "Only a local test password",
    }, asResponse: true });
    assert.equal(response.status, 200, "Better Auth must persist a PostgreSQL account");
    const account = await response.json() as { user: { id: string } };
    const cookie = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.id, account.user.id);

    const db = new PgD1Database(pool) as unknown as D1Database;
    const run = async () => ({ ...await createDemoEvaluationRun(), id: crypto.randomUUID(), mode: "live" as const,
      status: "queued" as const, sessionId: null, captures: [], events: [], result: null });
    const [left, right] = await Promise.allSettled([
      createEvaluationRun(db, account.user.id, await run()),
      createEvaluationRun(db, account.user.id, await run()),
    ]);
    assert.deepEqual([left.status, right.status].sort(), ["fulfilled", "rejected"]);
    assert.equal((await getEvaluationUsage(db, account.user.id)).liveAttemptsLast24Hours, 1);
    const costs = await ownedCostSummary(db, account.user.id);
    assert.equal(costs.groups.find(group => group.source === "evaluation")?.runs, 1);
    assert.equal(costs.groups.find(group => group.source === "evaluation")?.unknown_runs, 1);
    assert.equal(typeof costs.groups.find(group => group.source === "evaluation")?.reported_complete_runs, "number");

    const siteId = crypto.randomUUID();
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind(siteId, account.user.id, "https://example.test", "Fixture", Date.now()),
      db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind(siteId, account.user.id, "https://other.test", "Duplicate", Date.now()),
    ]));
    assert.equal((await db.prepare("SELECT id FROM sites WHERE id=?").bind(siteId).first()), null,
      "a failed multi-statement write must not save a partial site");
    assert.equal((await db.prepare("SELECT json_extract('{\"targetUrl\":\"https://example.test\"}','$.targetUrl') AS value").first<{ value: string }>())?.value,
      "https://example.test");
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.end();
  }
});
