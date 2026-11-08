import {headers} from 'next/headers';
import {notFound} from 'next/navigation';
import {Suspense} from 'react';
import Link from 'next/link';
import {getAuth} from '@/lib/auth';
import {isAdmin} from '@/lib/admin';
import {AdminProductAnalytics} from '@/components/admin-product-analytics';
export const dynamic='force-dynamic';
export const metadata={title:'Product analytics · Folio internal',robots:{index:false,follow:false}};
export default async function InternalAnalytics(){const session=await(await getAuth()).api.getSession({headers:await headers()});if(!session||!isAdmin(session.user.email))notFound();return <main style={{maxWidth:1400,margin:'0 auto',padding:'32px clamp(16px,4vw,48px)'}}><Link href="/overview">← Back to Folio</Link><Suspense fallback={<p>Reading analytics…</p>}><AdminProductAnalytics ownerId={session.user.id}/></Suspense></main>;}
