/**
 * Translate the SQLite migrations to Postgres and, optionally, apply them.
 *
 *   set -a; . .dev.vars; set +a
 *   node --conditions=react-server --import tsx scripts/pg-schema.ts --dry-run
 *   node --conditions=react-server --import tsx scripts/pg-schema.ts --apply --schema folio_pg
 *
 * Dry run prints what translates and what needs hand-porting. --apply creates the
 * schema, runs the statements and records them in a pg_migrations journal.
 */
import { readdirSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { translateMigration, type TranslatedStatement } from "../src/lib/pg/schema";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const schemaIndex = args.indexOf("--schema");
const schema = schemaIndex >= 0 ? args[schemaIndex + 1] : "folio_pg";
const reset = args.includes("--reset");

const directory = new URL("../migrations/", import.meta.url);
const files = readdirSync(directory).filter(name => /^\d+_.+\.sql$/.test(name)).sort();

type Report = { file: string; statements: TranslatedStatement[] };
const reports: Report[] = files.map(file => ({
  file,
  statements: translateMigration(readFileSync(new URL(file, directory), "utf8")),
}));

const counts = reports.flatMap(report => report.statements).reduce<Record<string, number>>((acc, item) => {
  acc[item.kind] = (acc[item.kind] ?? 0) + 1;
  return acc;
}, {});
console.log("translated:", counts);
for (const report of reports) {
  for (const statement of report.statements) {
    if (statement.kind === "skipped" && statement.note && !/PRAGMA/.test(statement.note))
      console.log(`skip ${report.file}: ${statement.note}`);
  }
}

if (!apply) {
  console.log("\ndry run: pass --apply to create the schema");
  process.exit(0);
}

async function main() {
  const url = process.env.PLANETSCALE_APP_URL;
  if (!url) {
    console.error("PLANETSCALE_APP_URL is not set");
    process.exit(2);
  }
  
  const pool = new Pool({ connectionString: url.split("?")[0], ssl: { rejectUnauthorized: false }, max: 2 });
  const client = await pool.connect();
  try {
    if (reset) await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE IF NOT EXISTS pg_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  // SQLite's json_valid has no Postgres equivalent; a shim keeps CHECK constraints
  // and trigger WHEN clauses meaningful instead of dropping the guarantee.
  await client.query(`CREATE OR REPLACE FUNCTION json_valid(value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
    BEGIN PERFORM value::jsonb; RETURN true;
    EXCEPTION WHEN others THEN RETURN false; END $$`);
  
    const applied = new Set((await client.query<{ name: string }>("SELECT name FROM pg_migrations")).rows.map(row => row.name));
    let ran = 0;
    let failed = 0;
    for (const report of reports) {
      if (applied.has(report.file)) continue;
      for (const statement of report.statements) {
        if (statement.kind === "skipped") continue;
        try {
          await client.query(statement.sql);
          ran += 1;
        } catch (error) {
          failed += 1;
          console.log(`FAILED ${report.file}: ${error instanceof Error ? error.message.slice(0, 160) : "unknown"}`);
          console.log(`   ${statement.sql.slice(0, 160).replace(/\s+/g, " ")}`);
        }
      }
      await client.query("INSERT INTO pg_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [report.file]);
    }
  
    const tables = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1", [schema]);
    const triggers = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.triggers WHERE trigger_schema = $1", [schema]);
    console.log({ statementsRun: ran, failed, tables: tables.rows[0].n, triggers: triggers.rows[0].n });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
