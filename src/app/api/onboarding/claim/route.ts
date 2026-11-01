import { readJsonBody } from "@/lib/api-request";
import { claimPendingScan } from "@/lib/onboarding-store";
import { onboardingContext, onboardingErrorResponse, pendingCheckCookie, PRIVATE_ONBOARDING_HEADERS, readPendingCheckCookie } from "@/lib/onboarding-api";

export const dynamic = "force-dynamic";

/** Attaches this browser's anonymous page check to the signed-in account. */
export async function POST(request: Request) {
  try {
    await readJsonBody(request);
    const { db, userId } = await onboardingContext(request);
    const claimed = await claimPendingScan(db, userId!, readPendingCheckCookie(request));
    return Response.json(claimed, { headers: { ...PRIVATE_ONBOARDING_HEADERS, "Set-Cookie": pendingCheckCookie(request, null) } });
  } catch (error) { return onboardingErrorResponse(error); }
}
