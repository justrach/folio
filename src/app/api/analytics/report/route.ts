import {getAuth} from '@/lib/auth';
import {getAnalyticsDb} from '@/lib/product-analytics-db';
import {readAdminAnalyticsReport} from '@/lib/product-analytics-report';
export async function GET(request:Request){try{const session=await(await getAuth()).api.getSession({headers:request.headers});return readAdminAnalyticsReport(request,session?.user??null,getAnalyticsDb);}catch{return Response.json({error:'Product analytics could not be loaded.'},{status:503,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});}}
