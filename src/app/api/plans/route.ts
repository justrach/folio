import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/api-request";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const session = await getSession(request.headers);
  if (!session)
    return Response.json(
      { error: "Sign in to view your plan preference." },
      { status: 401, headers: privateHeaders },
    );
  try {
    const db = await getDb();
    const interest = await db
      .prepare(
        "SELECT plan_slug AS plan, updated_at AS updatedAt FROM plan_interest WHERE user_id = ?",
      )
      .bind(session.user.id)
      .first();
    return Response.json(
      { interest, billingActive: false },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: "Plan preferences are temporarily unavailable." },
      { status: 503, headers: privateHeaders },
    );
  }
}
export async function POST(request: Request) {
  const session = await getSession(request.headers);
  if (!session)
    return Response.json(
      { error: "Sign in to save your plan preference." },
      { status: 401, headers: privateHeaders },
    );
  try {
    const body = await readJsonBody(request);
    if (
      Object.keys(body).some((key) => key !== "plan") ||
      typeof body.plan !== "string" ||
      !["free", "builder", "team"].includes(body.plan)
    ) {
      return Response.json(
        { error: "Choose one of the proposed plans." },
        { status: 400, headers: privateHeaders },
      );
    }
    const db = await getDb();
    const now = Date.now();
    await db
      .prepare(
        "INSERT INTO plan_interest(user_id,plan_slug,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan_slug=excluded.plan_slug, updated_at=excluded.updated_at",
      )
      .bind(session.user.id, body.plan, now, now)
      .run();
    return Response.json(
      {
        interest: { plan: body.plan, updatedAt: now },
        billingActive: false,
        message:
          "Preference saved. No subscription, charge, or notification was created.",
      },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { error: "Unable to save this preference. Please try again." },
      { status: 400, headers: privateHeaders },
    );
  }
}
