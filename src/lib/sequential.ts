/**
 * Runs independent reads one at a time and returns their results in order, like Promise.all.
 * The production Postgres allows 25 connections (22 for the app) and each in-flight query can
 * hold one, so a page-load fan-out of parallel reads can exhaust it. Use this for a handful of reads.
 */
export async function sequentially<const T extends readonly (() => Promise<unknown>)[]>(tasks: T): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

type Results<T extends readonly (() => Promise<unknown>)[]> = { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
/**
 * Runs independent reads with at most `limit` in flight and returns their results in order, like Promise.all.
 * `limit` is the most connections the caller can hold at once, so a fan-out stays inside the connection
 * budget in `read-plan.json` while its wall time drops from the sum of the reads towards the longest one.
 * The first failure rejects, and no read that has not started yet is started. `proofs/Folio/ReadPlan.lean`
 * proves the in-flight bound for this scheduling rule; `tests/read-plan.test.ts` checks this function obeys it.
 */
export async function withLimit<const T extends readonly (() => Promise<unknown>)[]>(limit: number, tasks: T): Promise<Results<T>> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be a positive integer.");
  const results: unknown[] = new Array(tasks.length);
  let next = 0, failed = false;
  const worker = async () => {
    while (!failed && next < tasks.length) {
      const index = next++;
      try { results[index] = await tasks[index](); } catch (error) { failed = true; throw error; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results as Results<T>;
}

/** Splits `items` into consecutive batches of at most `size`: every item once, in order (`batches_flatten` in the Lean model). */
export function batches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer.");
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}
