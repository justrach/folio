import { readJsonBody } from "@/lib/api-request";
import { keywordBenchmarkOverview, seedKeywordBenchmark } from "@/lib/keyword-benchmark-service";
import { keywordBenchmarkRequestContext, keywordBenchmarkErrorResponse, requireKeywordBenchmarkOrigin, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
import { KeywordBenchmarkStoreError } from "@/lib/keyword-benchmark-store";
import { saveQuestionSuite } from "@/lib/question-suites";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const { db, ownerId, env } = await keywordBenchmarkRequestContext(request); return Response.json(await keywordBenchmarkOverview(db, ownerId, env), { headers: PRIVATE_BENCHMARK_HEADERS }); }
  catch (error) { return keywordBenchmarkErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { db, ownerId, baseURL } = await keywordBenchmarkRequestContext(request); requireKeywordBenchmarkOrigin(request, baseURL);
    const body = await readJsonBody(request);
    if ("questions" in body) {
      const suite = await saveQuestionSuite(db, ownerId, body);
      return Response.json({ suite }, { status: 201, headers: PRIVATE_BENCHMARK_HEADERS });
    }
    if (Object.keys(body).some(key => !["templateId", "websiteId"].includes(key))) throw new KeywordBenchmarkStoreError("This request contains an unsupported field.", 400);
    if (typeof body.templateId !== "string" || (body.websiteId !== undefined && typeof body.websiteId !== "string")) throw new KeywordBenchmarkStoreError("Choose a reviewed template and your saved website.", 400);
    const suite = await seedKeywordBenchmark(db, ownerId, { templateId: body.templateId, websiteId: body.websiteId as string | undefined });
    return Response.json({ suite }, { status: 201, headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
