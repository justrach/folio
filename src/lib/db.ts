import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";

/** Request-scoped binding: never cache a Workers binding across requests. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) {
    throw new Error(
      "The D1 DB binding is unavailable. Configure wrangler.jsonc and run the local database migrations.",
    );
  }
  return env.DB;
}
