import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import { readJsonBody } from '@/lib/api-request';
import { authenticateTypesafeTool,serveTypesafeTool } from '@/lib/typesafe-agent-tool';
import { AgentApiError } from '@/lib/agent-api-key-store';
import type { TypeSafeEnvironment } from '@/lib/typesafe-review-store';
export const dynamic='force-dynamic';
async function handle(request:Request){
 try {
  const db=await getDb();const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
  const principal=await authenticateTypesafeTool(db,token);
  const {env}=await getCloudflareContext({async:true});const values=env as TypeSafeEnvironment;
  let bounded=request;
  if(request.method==='POST'){const body=await readJsonBody(request);bounded=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)});}
  const response=await serveTypesafeTool(bounded,db,principal,{TYPESAFE_API_KEY:values.TYPESAFE_API_KEY||process.env.TYPESAFE_API_KEY,TYPESAFE_ALLOWED_USER_IDS:values.TYPESAFE_ALLOWED_USER_IDS||process.env.TYPESAFE_ALLOWED_USER_IDS});
  response.headers.set('Cache-Control','private, no-store');return response;
 }catch(e){return Response.json({error:e instanceof AgentApiError?e.message:'TypeSafe tool unavailable.'},{status:e instanceof AgentApiError?e.status:400,headers:{'Cache-Control':'private, no-store'}});}
}
export const POST=handle;export const GET=handle;export const DELETE=handle;
