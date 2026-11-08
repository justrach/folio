import {getAnalyticsDb,analyticsBackgroundTask} from '@/lib/product-analytics-db';
import {analyticsEnvironment,captureProductEvent} from '@/lib/product-analytics-server';
export async function POST(request:Request){return captureProductEvent(request,await analyticsEnvironment(),getAnalyticsDb,await analyticsBackgroundTask());}
