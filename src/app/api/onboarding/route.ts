import { readJsonBody } from "@/lib/api-request";
import { onboardingSummary, parseOnboardingPatch, updateOnboarding } from "@/lib/onboarding-store";
import { onboardingContext, onboardingErrorResponse, PRIVATE_ONBOARDING_HEADERS } from "@/lib/onboarding-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { db, userId } = await onboardingContext(request);
    return Response.json(await onboardingSummary(db, userId!), { headers: PRIVATE_ONBOARDING_HEADERS });
  } catch (error) { return onboardingErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const patch = parseOnboardingPatch(await readJsonBody(request));
    const { db, userId } = await onboardingContext(request);
    await updateOnboarding(db, userId!, patch);
    return Response.json(await onboardingSummary(db, userId!), { headers: PRIVATE_ONBOARDING_HEADERS });
  } catch (error) { return onboardingErrorResponse(error); }
}
