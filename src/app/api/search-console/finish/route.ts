import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { searchConsoleAccount } from "@/lib/google-auth";
import { PRIVATE_SEARCH_CONSOLE_HEADERS } from "@/lib/search-console-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let hint = "error=google_permission";
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) hint = "error=sign_in";
    else if (await searchConsoleAccount(await getDb(), session.user.id)) hint = "connected=google";
  } catch { /* A fixed local destination keeps callback details and errors private. */ }
  return new Response(null, { status: 303, headers: { ...PRIVATE_SEARCH_CONSOLE_HEADERS, Location: `/search-console?${hint}` } });
}
