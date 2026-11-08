import type { D1Database } from "@cloudflare/workers-types";

/** Atomic per-account hourly budget. A failed or ambiguous paid request still
 * consumes a slot because it may have been billed. Never key this by email. */
export async function consumeSeoLookupSlot(db: D1Database, key: string, limit: number): Promise<number | null> {
  const now = Date.now();
  const slot = await db.prepare(
    `INSERT INTO rate_limit (id, key, count, last_request)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN last_request < ? THEN 1 ELSE count + 1 END,
       last_request = CASE WHEN last_request < ? THEN ? ELSE last_request END
     WHERE last_request < ? OR count < ?
     RETURNING count`,
  ).bind(
    crypto.randomUUID(),
    key,
    now,
    now - 3_600_000,
    now - 3_600_000,
    now,
    now - 3_600_000,
    limit,
  ).first<{ count: number }>();
  return slot?.count ?? null;
}
