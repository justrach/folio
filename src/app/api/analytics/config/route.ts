import {analyticsEnvironment,productAnalyticsEnabled} from '@/lib/product-analytics-server';
export async function GET(){return Response.json({enabled:productAnalyticsEnabled(await analyticsEnvironment())},{headers:{'Cache-Control':'no-store'}});}
