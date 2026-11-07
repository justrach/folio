import { getAuth } from "@/lib/auth";
import { devSession } from "@/lib/dev-auth";

export const dynamic = "force-dynamic";

async function handler(request: Request) {
  // The browser reads its session through this endpoint, not through the
  // server-side `getSession()` helper. Answer it directly while local pseudo auth
  // is on, so the UI shows the dev account instead of a sign-in wall.
  const path = new URL(request.url).pathname;
  const local = path.endsWith("/get-session") ? devSession() : null;
  if (local)
    return Response.json(
      { session: local.session, user: local.user },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  try {
    return await (await getAuth()).handler(request);
  } catch (error) {
    // Detailed diagnostics stay on the server; configuration never leaks to clients.
    console.error(
      "Authentication request failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        code: "AUTH_UNAVAILABLE",
        message: "Sign-in is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}

export const GET = handler;
export const POST = handler;
