import {getSession} from '@/lib/auth';
import {getAnalyticsDb} from '@/lib/product-analytics-db';
import {readAdminAnalyticsReport} from '@/lib/product-analytics-report';
export async function GET(request:Request){try{const session=await getSession(request.headers);return readAdminAnalyticsReport(request,session?.user??null,getAnalyticsDb);}catch{return Response.json({error:'Product analytics couldn’t be read just now.'},{status:503,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});}}
