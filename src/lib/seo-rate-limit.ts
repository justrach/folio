import type { D1Database } from "@cloudflare/workers-types";

/** Atomic per-account hourly budget. A failed or ambiguous paid request still
 * consumes a slot because it may have been billed. Never key this by email. */
export function consumeSeoLookupSlot(db: D1Database, key: string, limit: number): Promise<number | null> {
  return consumeRateSlot(db, key, limit, 3_600_000);
}

/** The same atomic counter for any window. Returns the slot number, or null when the window is full. */
export async function consumeRateSlot(db: D1Database, key: string, limit: number, windowMs: number): Promise<number | null> {
  const now = Date.now(), start = now - windowMs;
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
    start,
    start,
    now,
    start,
    limit,
  ).first<{ count: number }>();
  return slot?.count ?? null;
}
