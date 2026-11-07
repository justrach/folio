import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { consumeSeoLookupSlot } from "@/lib/seo-rate-limit";
import { getOwnedSeoReport, saveSeoReportDetail } from "@/lib/seo-store";
import {
  assertSeoDataAccess,
  fetchSeoDetail,
  SeoDataError,
  type DataForSeoEnvironment,
} from "@/lib/dataforseo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const privateHeaders = { "Cache-Control": "private, no-store" };

async function environment() {
  const { env } = await getCloudflareContext({ async: true });
  const providerEnv: DataForSeoEnvironment = {
    DATAFORSEO_LOGIN: env.DATAFORSEO_LOGIN || process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: env.DATAFORSEO_PASSWORD || process.env.DATAFORSEO_PASSWORD,
    DATAFORSEO_ALLOWED_USER_IDS:
      env.DATAFORSEO_ALLOWED_USER_IDS || process.env.DATAFORSEO_ALLOWED_USER_IDS,
  };
  return {
    providerEnv,
    trustedOrigin: new URL(
      env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL || "http://localhost:3001",
    ).origin,
  };
}

/** Explicit, potentially billable collection of row-level detail for one saved
 * report. The target domain comes from the owned report, never from the caller,
 * and a report's detail is collected at most once. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(request.headers);
    if (!session) throw new SeoDataError("Sign in to collect website detail.", 401, "UNAUTHENTICATED");
    const { providerEnv, trustedOrigin } = await environment();
    const toolContext = { userId: session.user.id };
    assertSeoDataAccess(providerEnv, toolContext);
    if (request.headers.get("origin") && request.headers.get("origin") !== trustedOrigin)
      throw new SeoDataError("Cross-origin paid queries are not permitted.", 403, "INVALID_ORIGIN");
    const { id } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new SeoDataError("This saved SEO report is unavailable.", 404, "NOT_FOUND");
    const db = await getDb();
    const report = await getOwnedSeoReport(db, session.user.id, id);
    if (!report) throw new SeoDataError("This saved SEO report is unavailable.", 404, "NOT_FOUND");
    if (report.state !== "complete" || !report.result)
      throw new SeoDataError(
        "This update has no saved result. Its completion and cost are unconfirmed; collect detail from a completed report.",
        409,
        "REPORT_INCOMPLETE",
      );
    if (report.detail)
      throw new SeoDataError(
        "Row-level detail is already saved for this report. Open it, or run a new lookup for a fresh collection.",
        409,
        "DETAIL_ALREADY_COLLECTED",
      );
    // A failed or ambiguous request still consumes a slot because it may have been billed.
    const slot = await consumeSeoLookupSlot(db, `folio:seo-detail:${session.user.id}`, 20);
    if (!slot)
      return Response.json(
        { error: "The account has reached 20 paid collections in this hour. Each collection can make two tasks." },
        { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } },
      );
    const detail = await fetchSeoDetail(report.domain, toolContext, { env: providerEnv });
    try {
      await saveSeoReportDetail(db, session.user.id, report.id, detail);
      return Response.json({ detail, saved: true }, { headers: privateHeaders });
    } catch {
      return Response.json({
        detail,
        saved: false,
        storageWarning: "The detail rows were collected, but could not be saved. Keep this result; collecting again can charge again.",
      }, { headers: privateHeaders });
    }
  } catch (error) {
    if (error instanceof SeoDataError)
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: privateHeaders },
      );
    // Do not log exceptions from a credential-bearing provider request.
    return Response.json(
      { error: "Website detail is unavailable. Check the server authentication and database configuration." },
      { status: 503, headers: privateHeaders },
    );
  }
}
