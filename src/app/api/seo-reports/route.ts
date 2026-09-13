import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { listOwnedSeoReports } from "@/lib/seo-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session) return Response.json({ error: "Sign in to view private SEO reports." }, { status: 401, headers });
    const reports = await listOwnedSeoReports(await getDb(), session.user.id);
    return Response.json({ reports }, { headers });
  } catch {
    return Response.json({ error: "Saved SEO reports are temporarily unavailable." }, { status: 503, headers });
  }
}
