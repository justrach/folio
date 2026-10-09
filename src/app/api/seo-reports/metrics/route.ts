import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { latestDomainSeoMetrics } from "@/lib/seo-store";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Latest saved DataForSEO metrics for up to ten domains. Owner reads only; never calls the provider. */
export async function GET(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session) return Response.json({ error: "Sign in to view private SEO reports." }, { status: 401, headers });
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => key !== "domain")) return Response.json({ error: "Only domain filters are supported." }, { status: 400, headers });
    const domains = params.getAll("domain");
    if (!domains.length || domains.length > 10) return Response.json({ error: "Provide one to ten domains." }, { status: 400, headers });
    const metrics = await latestDomainSeoMetrics(await getDb(), session.user.id, domains);
    return Response.json({ metrics: Object.fromEntries(metrics) }, { headers });
  } catch {
    return Response.json({ error: "Saved SEO reports are temporarily unavailable." }, { status: 503, headers });
  }
}
