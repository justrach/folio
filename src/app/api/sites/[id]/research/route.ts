import { readJsonBody } from "@/lib/api-request";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
import { KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { startWebsiteResearch, websiteResearchOverview } from "@/lib/website-research-service";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { db, ownerId, env } = await keywordBenchmarkRequestContext(request);
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    if (query.getAll("cursor").length > 1 || [...query.keys()].some(key => key !== "cursor"))
      throw new KeywordBenchmarkStoreError("Invalid research history filter.", 400);
    return Response.json(await websiteResearchOverview(db, ownerId, id, env, query.get("cursor") ?? undefined), { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { db, ownerId, env, baseURL } = await keywordBenchmarkRequestContext(request);
    requireKeywordBenchmarkOrigin(request, baseURL);
    const { id } = await context.params;
    const run = await startWebsiteResearch(db, ownerId, id, await readJsonBody(request), env);
    return Response.json({ run }, { status: 201, headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
