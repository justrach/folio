import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { Pool, types } from "pg";
import { createPostgresDatabase, type PgExecutor } from "./pg/database";

/** Epoch-millisecond columns are int8; without this every date is a string. */
types.setTypeParser(20, value => Number(value));

export type DatabaseEngine = "d1" | "postgres";

type EngineEnv = {
  DB?: D1Database;
  DB_ENGINE?: string;
  HYPERDRIVE?: { connectionString: string };
  PLANETSCALE_APP_URL?: string;
};

/** Which store the app opens. Defaults to D1 so nothing changes silently. */
export function databaseEngine(env: EngineEnv): DatabaseEngine {
  const value = env.DB_ENGINE ?? process.env.DB_ENGINE;
  return value === "postgres" ? "postgres" : "d1";
}

let pool: Pool | null = null;

/** The raw pg pool, for consumers that need a real driver (drizzle, Better Auth)
 * rather than the D1-shaped adapter. */
export function getPgPool(connectionString: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: connectionString.split("?")[0],
      ssl: connectionString.includes("pg.psdb.cloud") ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

function postgresDatabase(connectionString: string): D1Database {
  // Workers cannot pool across requests themselves; `pg`'s Cloudflare socket
  // plus Hyperdrive does. The pool is reused within an isolate.
  getPgPool(connectionString);
  const executor: PgExecutor = {
    query: async (sql, values) => {
      const result = await pool!.query(sql, values as never[]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
  // Stores keep calling the D1 surface they already use: prepare/bind/first/all/run.
  return createPostgresDatabase(executor) as unknown as D1Database;
}

/** The connection string for the Postgres engine, or null when not selected. */
export function postgresConnection(env: EngineEnv): string | null {
  if (databaseEngine(env) !== "postgres") return null;
  return env.HYPERDRIVE?.connectionString ?? env.PLANETSCALE_APP_URL ?? process.env.PLANETSCALE_APP_URL ?? null;
}

/** Store access. Honors DB_ENGINE; both engines expose the same API. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const engineEnv = env as unknown as EngineEnv;
  if (databaseEngine(engineEnv) === "postgres") {
    const connectionString = engineEnv.HYPERDRIVE?.connectionString
      ?? engineEnv.PLANETSCALE_APP_URL
      ?? process.env.PLANETSCALE_APP_URL;
    if (!connectionString)
      throw new Error("DB_ENGINE=postgres requires a HYPERDRIVE binding or PLANETSCALE_APP_URL.");
    return postgresDatabase(connectionString);
  }
  if (!engineEnv.DB) {
    throw new Error(
      "The D1 DB binding is unavailable. Configure wrangler.jsonc and run the local database migrations.",
    );
  }
  return engineEnv.DB;
}

/** Authentication stays on D1 until its own cutover: Better Auth's drizzle
 * adapter is bound to the D1 client, and a half-migrated session table is the one
 * failure that locks users out. `getDb` moving first is intentional. */
export async function getAuthDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const engineEnv = env as unknown as EngineEnv;
  if (!engineEnv.DB) {
    throw new Error(
      "The D1 DB binding is unavailable. Authentication still requires D1 until its cutover.",
    );
  }
  return engineEnv.DB;
}
