import { readJsonBody } from "@/lib/api-request";
import { keywordBenchmarkRequestContext, requireKeywordBenchmarkOrigin, keywordBenchmarkErrorResponse, PRIVATE_BENCHMARK_HEADERS } from "@/lib/keyword-benchmark-api";
import { getOnboardingProfile, saveOnboardingProfile } from "@/lib/onboarding-store";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db, ownerId } = await keywordBenchmarkRequestContext(request);
    const id = new URL(request.url).searchParams.get("id") ?? undefined;
    const websiteId = new URL(request.url).searchParams.get("website") ?? undefined;
    return Response.json({ profile: await getOnboardingProfile(db, ownerId, id, websiteId) }, { headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const { db, ownerId, baseURL } = await keywordBenchmarkRequestContext(request);
    requireKeywordBenchmarkOrigin(request, baseURL);
    const profile = await saveOnboardingProfile(db, ownerId, await readJsonBody(request, 16384));
    return Response.json({ profile }, { status: 201, headers: PRIVATE_BENCHMARK_HEADERS });
  } catch (error) { return keywordBenchmarkErrorResponse(error); }
}
