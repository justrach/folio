import { readJsonBody } from "@/lib/api-request";
import { archiveKeywordBenchmarkRun, KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: {params: Promise<{id:string}>}) {
 try {
  const {db,ownerId,baseURL}=await keywordBenchmarkRequestContext(request);requireKeywordBenchmarkOrigin(request,baseURL);
  const body=await readJsonBody(request);
  if(Object.keys(body).some(k=>k!=="revision") || !Number.isSafeInteger(body.revision)) throw new KeywordBenchmarkStoreError("Choose the current saved revision.",400);
  const {id}=await context.params;
  return Response.json({run:await archiveKeywordBenchmarkRun(db,ownerId,id,body.revision as number)},{headers:PRIVATE_BENCHMARK_HEADERS});
 } catch(error){return keywordBenchmarkErrorResponse(error);}
}
