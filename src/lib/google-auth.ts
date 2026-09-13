import "server-only";

import type { D1Database } from "@cloudflare/workers-types";
import type { BetterAuthOptions } from "better-auth";

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface GoogleAuthEnvironment {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function googleSignInConfigured(env: GoogleAuthEnvironment) {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

/** Identity sign-in does not request Search Console. Owners grant that scope separately. */
export function googleAuthOptions(env: GoogleAuthEnvironment) {
  return {
    socialProviders: googleSignInConfigured(env) ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
      },
    } : {},
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.method === "oauth" && source.oauth?.providerId === "google" && user.emailVerified !== true)
          return { error: "google_email_not_verified" };
      },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false },
    },
    // These built-in HTTP endpoints return provider credentials. Server auth.api
    // calls remain available; our API returns only Search Console observations.
    disabledPaths: ["/get-access-token", "/refresh-token"],
  } satisfies Pick<BetterAuthOptions, "socialProviders" | "user" | "account" | "disabledPaths">;
}

export function hasSearchConsoleScope(scope: string | null | undefined) {
  return Boolean(scope?.split(/[\s,]+/).includes(SEARCH_CONSOLE_SCOPE));
}

/** Return only account metadata, never encrypted or plaintext credentials. */
export async function searchConsoleAccount(db: D1Database, ownerId: string) {
  const rows = await db.prepare(
    `SELECT id, scope, CASE WHEN refresh_token IS NOT NULL AND refresh_token != '' THEN 1 ELSE 0 END AS has_refresh_token
     FROM account WHERE user_id = ? AND provider_id = 'google' ORDER BY updated_at DESC`,
  ).bind(ownerId).all<{ id: string; scope: string | null; has_refresh_token: number }>();
  return rows.results.find(row => hasSearchConsoleScope(row.scope) && row.has_refresh_token === 1) ?? null;
}

/** Remove local Search Console access without removing a Google login identity. */
export async function disconnectSearchConsole(db: D1Database, ownerId: string) {
  await db.prepare(
    `UPDATE account SET access_token = NULL, refresh_token = NULL, id_token = NULL,
       access_token_expires_at = NULL, refresh_token_expires_at = NULL, scope = NULL, updated_at = ?
     WHERE user_id = ? AND provider_id = 'google'`,
  ).bind(Date.now(), ownerId).run();
}
