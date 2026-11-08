import 'server-only';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import type {D1Database} from '@cloudflare/workers-types';

/** Telemetry must never fall back to the account/report database. */
export function analyticsDatabase(env: {ANALYTICS_DB?: D1Database}): D1Database {
  if (!env.ANALYTICS_DB) throw new Error('The isolated analytics database is unavailable.');
  return env.ANALYTICS_DB;
}

export async function getAnalyticsDb(): Promise<D1Database> {
  const {env} = await getCloudflareContext({async: true});
  return analyticsDatabase(env as unknown as {ANALYTICS_DB?: D1Database});
}

export async function analyticsBackgroundTask() {
  try {
    const {ctx} = await getCloudflareContext({async: true});
    return (task: Promise<unknown>) => ctx.waitUntil(task);
  } catch {
    return undefined;
  }
}
