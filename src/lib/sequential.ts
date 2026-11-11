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
