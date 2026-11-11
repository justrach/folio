import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { Pool, types } from "pg";
import { createPostgresDatabase, type PgExecutor } from "./pg/database";
import { requestResource } from "./pg/request-scope";
import READ_PLAN from "../data/read-plan.json";

types.setTypeParser(20, value => Number(value));
type EngineEnv = { DB?: D1Database; DB_ENGINE?: string; HYPERDRIVE?: { connectionString: string }; PLANETSCALE_APP_URL?: string };

export function postgresConnection(env: EngineEnv): string | null {
  if ((env.DB_ENGINE ?? process.env.DB_ENGINE) !== "postgres") return null;
  return env.HYPERDRIVE?.connectionString ?? env.PLANETSCALE_APP_URL ?? process.env.PLANETSCALE_APP_URL ?? null;
}

/** Hyperdrive pools upstream connections. Local pg sockets belong to one request. */
export function getPgPool(connectionString: string, viaHyperdrive = false): Pool {
  // libpq-style parameters (sslrootcert=system) are not understood by
  // node-postgres: it reads them as file paths. The TLS decision is made below.
  const clean = connectionString.split("?")[0];
  return requestResource(`${viaHyperdrive}:${clean}`, () => new Pool({
    connectionString: clean,
    ssl: viaHyperdrive ? undefined : { rejectUnauthorized: true },
    // Shared with the read planner: no request may hold more connections than this (src/data/read-plan.json).
    max: READ_PLAN.requestPoolMax,
    // Also release sockets when called by a local Next route outside the Worker wrapper.
    maxUses: 1,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  }));
}

export async function getAuthDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("The D1 DB binding is unavailable. Configure the local database binding.");
  return env.DB;
}

/** Select the existing store; never fall back to another database after an error. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const settings = env as unknown as EngineEnv;
  if ((settings.DB_ENGINE ?? process.env.DB_ENGINE) !== "postgres") return getAuthDb();
  const connection = postgresConnection(settings);
  if (!connection) throw new Error("DB_ENGINE=postgres requires HYPERDRIVE or PLANETSCALE_APP_URL.");
  const pool = getPgPool(connection, Boolean(settings.HYPERDRIVE));
  return postgresDatabase(pool);
}

/** The same atomic adapter used by application stores and local PG regressions. */
export function postgresDatabase(pool: Pool): D1Database {
  const execute = (target: Pick<Pool, "query">): PgExecutor => ({
    async query<T>(sql: string, values: unknown[]) {
      const result = await target.query(sql, values);
      return { rows: result.rows as T[], rowCount: result.rowCount };
    },
  });
  const executor = execute(pool);
  executor.transaction = async work => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(execute(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  };
  return createPostgresDatabase(executor) as unknown as D1Database;
}
