import catalog from "@/data/public-search-rankings.json";
import type { PublicSearchQuery } from "@/lib/public-search-rankings";
import { getKeywordPublication, previewKeywordPublication, publishKeywordObservation, withdrawKeywordObservation } from "@/lib/public-keyword-store";
import { KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
export const dynamic = "force-dynamic";
type Context = {params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
  try { const {db,ownerId}=await keywordBenchmarkRequestContext(request),{id}=await context.params;
    return Response.json(await getKeywordPublication(db,ownerId,id),{headers:PRIVATE_BENCHMARK_HEADERS});
  }catch(error){return keywordBenchmarkErrorResponse(error);}
}
export async function POST(request:Request,context:Context) {
  try {
    const {db,ownerId,baseURL}=await keywordBenchmarkRequestContext(request),{id}=await context.params;
    requireKeywordBenchmarkOrigin(request,baseURL);
    const text=await request.text();
    if(text.length>4000)throw new KeywordBenchmarkStoreError("Publication input is too large.",400);
    let body;try {body=JSON.parse(text);}catch{throw new KeywordBenchmarkStoreError("Invalid publication request.",400);}
    if(!body || !["preview","publish","withdraw"].includes(body.action))throw new KeywordBenchmarkStoreError("Choose a publication action.",400);
    if(body.action==="withdraw")return Response.json(await withdrawKeywordObservation(db,ownerId,id,body.revision),{headers:PRIVATE_BENCHMARK_HEADERS});
    if(typeof body.audience!=="string" || typeof body.category!=="string" || body.category.length>100 || !body.category.trim())throw new KeywordBenchmarkStoreError("Choose an audience and category.",400);
    const metadata={audience:body.audience as PublicSearchQuery["audience"],category:body.category.trim()};
    const queries=catalog.queries as PublicSearchQuery[];
    const result=body.action==="preview" ? await previewKeywordPublication(db,ownerId,id,metadata,queries)
      : await publishKeywordObservation(db,ownerId,id,metadata,body.reviewHash,queries);
    return Response.json(result,{headers:PRIVATE_BENCHMARK_HEADERS});
  }catch(error){return keywordBenchmarkErrorResponse(error);}
}
