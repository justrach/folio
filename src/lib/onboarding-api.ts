import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuth } from "./auth";
import { getDb } from "./db";
import { ScanError } from "./scanner";
import { PENDING_CHECK_COOKIE, PENDING_CHECK_MAX_AGE_SECONDS, sha256Hex } from "./onboarding-store";

export const PRIVATE_ONBOARDING_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function onboardingContext(request: Request, { requireSession = true } = {}) {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (requireSession && !session) throw new ScanError("Sign in to continue setting up Folio.", 401);
  return { db: await getDb(), userId: session?.user.id ?? null, auth };
}

/** A salted hash of the caller's address, used only to rate limit anonymous page checks. */
export async function requesterHash(request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  return sha256Hex(`${env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET || "folio"}:anonymous-check:${address}`);
}

export function pendingCheckCookie(request: Request, value: string | null) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return value
    ? `${PENDING_CHECK_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${PENDING_CHECK_MAX_AGE_SECONDS}${secure}`
    : `${PENDING_CHECK_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
export function readPendingCheckCookie(request: Request) {
  const match = (request.headers.get("cookie") ?? "").split(/;\s*/).find(part => part.startsWith(`${PENDING_CHECK_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(PENDING_CHECK_COOKIE.length + 1)) : null;
}

export function onboardingErrorResponse(error: unknown) {
  if (error instanceof ScanError) return Response.json({ error: error.message }, { status: error.status, headers: PRIVATE_ONBOARDING_HEADERS });
  console.error("Onboarding API error", error instanceof Error ? error.message : "Unknown error");
  return Response.json({ error: "Setup is unavailable right now. Check the authentication and D1 configuration, then try again." }, { status: 503, headers: PRIVATE_ONBOARDING_HEADERS });
}
