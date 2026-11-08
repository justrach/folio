import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { globSync } from "node:fs";


const url: string = process.env.PLANETSCALE_APP_URL ?? (() => { console.error("PLANETSCALE_APP_URL is not set"); process.exit(2); })();
async function main() {
  const pool = new Pool({ connectionString: url.split("?")[0], ssl: { rejectUnauthorized: false } });
  const d1Path = globSync(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")[0];
  const d1 = new DatabaseSync(d1Path);
  
  const d1Tables = d1.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not like '_cf%' and name not like 'd1_migrations'").all().map((r: any) => r.name).sort();
  const pg = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='folio_pg' and table_name not in ('pg_migrations')");
  const pgTables = pg.rows.map(r => r.table_name).sort();
  
  const missing = d1Tables.filter(t => !pgTables.includes(t));
  const extra = pgTables.filter(t => !d1Tables.includes(t));
  console.log({ d1: d1Tables.length, pg: pgTables.length, missing, extra });
  
  let columnMismatches = 0;
  for (const table of d1Tables.filter(t => pgTables.includes(t))) {
    const d1Cols = d1.prepare(`pragma table_info("${table}")`).all().map((r: any) => r.name).sort();
    const pgCols = (await pool.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='folio_pg' and table_name=$1", [table])).rows.map(r => r.column_name).sort();
    const miss = d1Cols.filter(c => !pgCols.includes(c));
    const add = pgCols.filter(c => !d1Cols.includes(c));
    if (miss.length || add.length) { columnMismatches += 1; console.log("COLUMNS", table, { missingInPg: miss, extraInPg: add }); }
  }
  console.log("column mismatches:", columnMismatches);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
