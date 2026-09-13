import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { readJsonBody } from "@/lib/api-request";
import { ScanError } from "@/lib/scanner";
import { reserveSeoReport, completeSeoReport } from "@/lib/seo-store";
import {
  assertSeoDataAccess,
  fetchSeoOverview,
  getSeoDataStatus,
  normalizeSeoDomain,
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
    DATAFORSEO_PASSWORD:
      env.DATAFORSEO_PASSWORD || process.env.DATAFORSEO_PASSWORD,
    DATAFORSEO_ALLOWED_USER_IDS:
      env.DATAFORSEO_ALLOWED_USER_IDS ||
      process.env.DATAFORSEO_ALLOWED_USER_IDS,
  };
  return {
    providerEnv,
    trustedOrigin: new URL(
      env.BETTER_AUTH_URL ||
        process.env.BETTER_AUTH_URL ||
        "http://localhost:3001",
    ).origin,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof SeoDataError || error instanceof ScanError)
    return Response.json(
      {
        error: error.message,
        ...(error instanceof SeoDataError ? { code: error.code } : {}),
      },
      { status: error.status, headers: privateHeaders },
    );
  // Do not log exceptions from a credential-bearing provider request.
  return Response.json(
    {
      error:
        "Live SEO data is unavailable. Check the server authentication and database configuration.",
    },
    { status: 503, headers: privateHeaders },
  );
}

/** Configuration only: this GET never contacts the paid provider API. */
export async function GET(request: Request) {
  try {
    const { providerEnv } = await environment();
    const session = await getSession(request.headers);
    return Response.json(getSeoDataStatus(providerEnv, session?.user.id), {
      headers: privateHeaders,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession(request.headers);
    if (!session)
      throw new SeoDataError(
        "Sign in to query live SEO data.",
        401,
        "UNAUTHENTICATED",
      );
    const { providerEnv, trustedOrigin } = await environment();
    const context = { userId: session.user.id };
    assertSeoDataAccess(providerEnv, context);
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== trustedOrigin
    )
      throw new SeoDataError(
        "Cross-origin paid queries are not permitted.",
        403,
        "INVALID_ORIGIN",
      );
    const body = await readJsonBody(request);
    if (Object.keys(body).some((key) => key !== "domain"))
      throw new SeoDataError(
        "Provide only a domain. Account authorization is determined from your signed-in session.",
        400,
        "INVALID_ARGUMENTS",
      );
    const domain = normalizeSeoDomain(body.domain);
    const db = await getDb();
    const now = Date.now();
    // Atomic account budget guard; a failed/ambiguous provider request still
    // consumes a slot because it may have been billed. Never key this by email.
    const slot = await db
      .prepare(
        `INSERT INTO rate_limit (id, key, count, last_request)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN last_request < ? THEN 1 ELSE count + 1 END,
        last_request = CASE WHEN last_request < ? THEN ? ELSE last_request END
      WHERE last_request < ? OR count < 20
      RETURNING count`,
      )
      .bind(
        crypto.randomUUID(),
        `folio:seo-data:${session.user.id}`,
        now,
        now - 3_600_000,
        now - 3_600_000,
        now,
        now - 3_600_000,
      )
      .first<{ count: number }>();
    if (!slot)
      return Response.json(
        {
          error:
            "The account has reached 20 live SEO lookups in this hour. Each lookup can make two paid tasks.",
        },
        { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } },
      );
    const report = await reserveSeoReport(db, session.user.id, domain);
    const result = await fetchSeoOverview(domain, context, {
      env: providerEnv,
    });
    try {
      await completeSeoReport(db, session.user.id, report.id, result);
      return Response.json({ ...result, reportId: report.id, saved: true }, { headers: privateHeaders });
    } catch {
      // The paid observations still belong to this account. Return them even if
      // storage fails, with an explicit warning so nobody pays again to recover them.
      return Response.json({
        ...result,
        reportId: report.id,
        saved: false,
        storageWarning: "The lookup completed, but its result could not be saved. Keep this result; retrying the lookup can charge again.",
      }, { headers: privateHeaders });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
