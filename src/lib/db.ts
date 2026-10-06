import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import { Pool } from "pg";
import { PgD1Database } from "./pg-d1";

/** Use Hyperdrive in Workers; direct URLs are only for isolated local rehearsal. */
export async function getPgPool(): Promise<Pool> {
  const { env } = await getCloudflareContext({ async: true });
  const connectionString = env.HYPERDRIVE?.connectionString ||
    (process.env.NODE_ENV === "development" ? process.env.FOLIO_POSTGRES_URL : undefined);
  if (!connectionString) throw new Error("The PostgreSQL Hyperdrive binding is unavailable.");
  return new Pool({ connectionString, max: 3, idleTimeoutMillis: 1_000 });
}

/** Request-scoped binding: preserve D1 locally until an explicit Postgres rehearsal/cutover. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (env.HYPERDRIVE || (process.env.NODE_ENV === "development" && process.env.FOLIO_POSTGRES_URL))
    return new PgD1Database(await getPgPool()) as unknown as D1Database;
  if (!env.DB) {
    throw new Error("No database binding is available. Configure D1 or PostgreSQL Hyperdrive.");
  }
  return env.DB;
}
