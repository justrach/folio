import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getOwnedSeoReport } from "@/lib/seo-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(request.headers);
    if (!session) return Response.json({ error: "Sign in to view private SEO reports." }, { status: 401, headers });
    const { id } = await context.params;
    const report = await getOwnedSeoReport(await getDb(), session.user.id, id);
    if (!report) return Response.json({ error: "SEO report not found." }, { status: 404, headers });
    return Response.json({ report }, { headers });
  } catch {
    return Response.json({ error: "This saved SEO report is temporarily unavailable." }, { status: 503, headers });
  }
}
