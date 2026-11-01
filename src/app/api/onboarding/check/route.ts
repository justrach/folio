import { readJsonBody } from "@/lib/api-request";
import { normalizeScanUrl, ScanError, scanWebsite } from "@/lib/scanner";
import { ANONYMOUS_CHECKS_PER_HOUR, onboardingCheckView, persistScanForUser, recentAnonymousChecks, savePendingScan } from "@/lib/onboarding-store";
import { onboardingContext, onboardingErrorResponse, pendingCheckCookie, PRIVATE_ONBOARDING_HEADERS, requesterHash } from "@/lib/onboarding-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Free page check. Works before sign-up; the result is attached to the account later. */
export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    if (typeof body.url !== "string" || Object.keys(body).some(key => key !== "url")) throw new ScanError("Provide a website address.");
    const submitted = normalizeScanUrl(body.url);
    const { db, userId } = await onboardingContext(request, { requireSession: false });
    if (userId) {
      const recent = await db.prepare("SELECT COUNT(*) AS count FROM scans WHERE user_id = ? AND created_at > ?").bind(userId, Date.now() - 3_600_000).first<{ count: number }>();
      if ((recent?.count ?? 0) >= 20) throw new ScanError("You have reached the limit of 20 completed scans per hour. Try again later.", 429);
      const result = await scanWebsite(submitted.href);
      const siteId = await persistScanForUser(db, userId, submitted.href, result);
      return Response.json({ check: onboardingCheckView(result), siteId, saved: true }, { status: 201, headers: PRIVATE_ONBOARDING_HEADERS });
    }
    const requester = await requesterHash(request);
    if (await recentAnonymousChecks(db, requester) >= ANONYMOUS_CHECKS_PER_HOUR)
      return Response.json({ error: `You can check ${ANONYMOUS_CHECKS_PER_HOUR} pages an hour before creating an account. Create a free account to keep going.` }, { status: 429, headers: { ...PRIVATE_ONBOARDING_HEADERS, "Retry-After": "3600" } });
    const result = await scanWebsite(submitted.href);
    const cookie = await savePendingScan(db, result, requester);
    return Response.json({ check: onboardingCheckView(result), siteId: null, saved: false }, { status: 201, headers: { ...PRIVATE_ONBOARDING_HEADERS, "Set-Cookie": pendingCheckCookie(request, cookie) } });
  } catch (error) { return onboardingErrorResponse(error); }
}
