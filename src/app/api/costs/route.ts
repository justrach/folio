import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ownedCostSummary } from "@/lib/provider-costs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  const session = await getSession(request.headers);
  if (!session) return Response.json({ error: "Sign in to view your costs." }, { status: 401, headers });
  try { return Response.json(await ownedCostSummary(await getDb(), session.user.id), { headers }); }
  catch { return Response.json({ error: "Cost history is unavailable. Please try again." }, { status: 503, headers }); }
}
