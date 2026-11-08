import {headers} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {getSession} from '@/lib/auth';
import {isAdmin} from '@/lib/admin';
export const dynamic='force-dynamic';
export default async function Internal(){const session=await getSession(await headers());if(!session||!isAdmin(session.user.email))notFound();redirect('/admin');}
