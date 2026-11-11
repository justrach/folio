import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { workspaceSearchIndex } from "@/lib/workspace-search";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** For the "Find anything" box: names and IDs of the signed-in person's websites, reports and organizations. */
export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session) return Response.json({ error: "Sign in to search your websites and reports." }, { status: 401, headers });
    return Response.json({ index: await workspaceSearchIndex(await getDb(), session.user.id) }, { headers });
  } catch {
    return Response.json({ error: "Your websites and reports can’t be searched right now." }, { status: 503, headers });
  }
}
