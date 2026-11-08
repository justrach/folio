import { getSession } from "@/lib/auth";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { fetchXStanding, normalizeHandle } from "@/lib/x-standing";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Beta: public X standing for one handle. Nothing is stored. */
export async function GET(request: Request) {
  const session = await getSession(request.headers);
  if (!session) return Response.json({ error: "Sign in to look up an X account." }, { status: 401, headers });
  const handle = normalizeHandle(new URL(request.url).searchParams.get("handle") ?? "");
  if (!handle) return Response.json({ error: "Enter a valid X handle." }, { status: 400, headers });
  const { env } = await getCloudflareContext({ async: true });
  return Response.json(await fetchXStanding(handle, env as unknown as Record<string, unknown>), { headers });
}
