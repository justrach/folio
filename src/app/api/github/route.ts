import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { githubAccountConnected, PRIVATE_GITHUB_HEADERS } from "@/lib/github-auth";

export const dynamic = "force-dynamic";

/** Configuration and exact-owner saved identity only. No GitHub or evaluation request. */
export async function GET(request: Request) {
  try {
    const auth = await getAuth();
    const configured = Boolean(auth.options.socialProviders?.github);
    const session = await auth.api.getSession({ headers: request.headers });
    const signedIn = Boolean(session);
    const connected = Boolean(session && await githubAccountConnected(await getDb(), session.user.id));
    return Response.json({ configured, signedIn, connected }, { headers: PRIVATE_GITHUB_HEADERS });
  } catch {
    return Response.json({ error: "GitHub connection status is unavailable." }, { status: 503, headers: PRIVATE_GITHUB_HEADERS });
  }
}
