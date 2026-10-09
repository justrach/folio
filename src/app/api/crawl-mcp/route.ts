import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import { readJsonBody } from '@/lib/api-request';
import { authenticateCrawl,serveCrawl } from '@/lib/website-crawl';
import { ScanError } from '@/lib/scanner';
import type { SemanticReviewEnvironment } from '@/lib/typesafe-review-store';
export const dynamic='force-dynamic';
async function handle(request:Request){
 try {
  const db=await getDb();const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  const principal=await authenticateCrawl(db,token);
  const {env}=await getCloudflareContext({async:true});const values=env as SemanticReviewEnvironment;
  let bounded=request;
  if(request.method==='POST'){const body=await readJsonBody(request);bounded=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)});}
  const response=await serveCrawl(bounded,db,principal,{OPENAI_API_KEY:values.OPENAI_API_KEY||process.env.OPENAI_API_KEY,DECISIONS_ALLOWED_USER_IDS:values.DECISIONS_ALLOWED_USER_IDS||process.env.DECISIONS_ALLOWED_USER_IDS});
  response.headers.set('Cache-Control','private, no-store');return response;
 }catch(e){return Response.json({error:e instanceof ScanError?e.message:'Crawl tool unavailable.'},{status:e instanceof ScanError?e.status:400,headers:{'Cache-Control':'private, no-store'}});}
}
export const POST=handle;export const GET=handle;export const DELETE=handle;
