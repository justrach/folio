"use client";

import Link from 'next/link';
import {authClient} from '@/lib/auth-client';
import {ProductAnalyticsPanel} from './product-analytics-panel';

/** Hide owner-bound report state immediately when the browser account changes. */
export function AdminProductAnalytics({ownerId}: {ownerId: string}) {
  const {data: session, isPending} = authClient.useSession();
  if (isPending) return <p role="status">Checking admin access…</p>;
  if (session?.user.id !== ownerId) return <section role="status">
    <h1>Reopen analytics with your admin account.</h1>
    <p>The previous account’s report has been cleared.</p>
    <Link href="/login?next=%2Ffolio-internal%2Fanalytics">Sign in</Link>
  </section>;
  return <ProductAnalyticsPanel key={ownerId} ownerId={ownerId}/>;
}
