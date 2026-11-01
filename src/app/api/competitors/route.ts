import { readJsonBody } from "@/lib/api-request";
import { ScanError } from "@/lib/scanner";
import { listTrackedCompetitors, replaceTrackedCompetitors } from "@/lib/onboarding-store";
import { onboardingContext, onboardingErrorResponse, PRIVATE_ONBOARDING_HEADERS } from "@/lib/onboarding-api";

export const dynamic = "force-dynamic";
const validSite = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

/** Pinned competitors for one owned website. Saving starts no search. */
export async function GET(request: Request) {
  try {
    const siteId = new URL(request.url).searchParams.get("siteId");
    if (!validSite(siteId)) throw new ScanError("Provide a saved website ID.");
    const { db, userId } = await onboardingContext(request);
    return Response.json({ competitors: await listTrackedCompetitors(db, userId!, siteId) }, { headers: PRIVATE_ONBOARDING_HEADERS });
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (Object.keys(body).some(key => !["siteId", "competitors"].includes(key)) || !validSite(body.siteId)) throw new ScanError("Provide a saved website ID and a competitors list.");
    const { db, userId } = await onboardingContext(request);
    return Response.json({ competitors: await replaceTrackedCompetitors(db, userId!, body.siteId, body.competitors) }, { headers: PRIVATE_ONBOARDING_HEADERS });
  } catch (error) { return onboardingErrorResponse(error); }
}
