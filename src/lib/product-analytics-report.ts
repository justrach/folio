import 'server-only';
import type {D1Database} from '@cloudflare/workers-types';
import {isAdmin} from './admin';
import {loadProductEvents} from './product-analytics-store';

/** Reuse the internal admin policy before touching product-wide event storage. */
export async function readAdminAnalyticsReport(
  request: Request,
  user: {id: string; email: string} | null,
  database: () => Promise<D1Database>,
) {
  const headers = {'Cache-Control': 'private, no-store', Vary: 'Cookie'};
  if (!user) return Response.json({error: 'Sign in to open product analytics.'}, {status: 401, headers});
  if (!isAdmin(user.email)) return Response.json({error: 'Product analytics is restricted to Folio internal admins.'}, {status: 403, headers});
  try {
    const url = new URL(request.url);
    const data = await loadProductEvents(await database(), {
      userId: user.id, allowedIds: user.id,
      days: Number(url.searchParams.get('days') ?? 7),
      includeDemo: url.searchParams.get('includeDemo') === 'true',
    });
    return Response.json({...data, asOf: new Date().toISOString()}, {headers});
  } catch {
    return Response.json({error: 'Product analytics could not be loaded. Check storage migrations.'}, {status: 503, headers});
  }
}
