import {getDb} from '@/lib/db';
import {analyticsEnvironment,captureProductEvent} from '@/lib/product-analytics-server';
export async function POST(request:Request){return captureProductEvent(request,await analyticsEnvironment(),getDb);}
