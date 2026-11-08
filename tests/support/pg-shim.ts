/**
 * Test-only bridge that lets the D1 integration suites run against Postgres.
 *
 *   PG_INTEGRATION_URL=postgres://... node --import tsx --import ./tests/support/pg-shim.ts \
 *     --test tests/seo-mcp-d1.integration.ts
 *
 * Each `getD1Database` call gets its own transaction on the real schema, so a
 * suite that expects a fresh database still sees one. Fixture DDL is skipped
 * because scripts/pg-schema already created the same objects, and every
 * transaction is rolled back when the file finishes, so the mirror keeps only
 * real data.
 */
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { after } from "node:test";
import { Miniflare } from "miniflare";
import { createPostgresDatabase } from "../../src/lib/pg/database";

const connectionString = process.env.PG_INTEGRATION_URL;
const skipDdl = /^\s*(CREATE|ALTER|DROP|PRAGMA|VACUUM|REINDEX)\b/i;

// Fixture setup replays the migration files. Those objects and seed rows already
// exist in the mirror, and some (0015's `iif` backfills) were deliberately left
// unported, so statements that come from a migration file are skipped by exact
// fingerprint while every application query runs for real.
const migrationDirectory = new URL("../../migrations/", import.meta.url);
const fingerprint = (sql: string) => sql.replace(/\s+/g, " ").trim().slice(0, 80);
const migrationStatements = new Set<string>();
for (const name of readdirSync(migrationDirectory)) {
  if (!name.endsWith(".sql")) continue;
  for (const part of readFileSync(new URL(name, migrationDirectory), "utf8").split(";")) {
    migrationStatements.add(fingerprint(part));
  }
}

if (connectionString) {
  const open: { client: pg.PoolClient; pool: pg.Pool }[] = [];

  (Miniflare.prototype as unknown as { getD1Database: (name: string) => Promise<unknown> }).getD1Database =
    async () => {
      const pool = new pg.Pool({ connectionString: connectionString.split("?")[0], ssl: { rejectUnauthorized: false }, max: 1 });
      const client = await pool.connect();
      await client.query("BEGIN");
      open.push({ client, pool });
      const executor = {
        // A savepoint per statement keeps one failed query from poisoning the
        // fixture transaction, so the reported failure is the real one.
        query: async (sql: string, values: unknown[]) => {
          await client.query("SAVEPOINT statement");
          try {
            const result = await client.query(sql, values);
            await client.query("RELEASE SAVEPOINT statement");
            return { rows: result.rows as never[], rowCount: result.rowCount };
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT statement");
            throw error;
          }
        },
      };
      const database = createPostgresDatabase(executor);
      const empty = { success: true as const, results: [], meta: { changes: 0 } };
      const skipped = (sql: string) => ({
        sql,
        bind: () => skipped(sql),
        first: async () => null,
        all: async () => empty,
        run: async () => ({ success: true as const, meta: { changes: 0 } }),
        raw: async () => [],
      });
      return {
        prepare: (sql: string) =>
          skipDdl.test(sql) || migrationStatements.has(fingerprint(sql))
            ? skipped(sql)
            : database.prepare(sql),
        batch: async (statements: { all: () => Promise<unknown> }[]) => Promise.all(statements.map(statement => statement.all())),
        exec: async () => ({ count: 0, duration: 0 }),
      };
    };

  after(async () => {
    for (const { client, pool } of open) {
      try { await client.query("ROLLBACK"); } finally { client.release(); await pool.end(); }
    }
    open.length = 0;
  });
}
