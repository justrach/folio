import "server-only";

import type { D1Database } from "@cloudflare/workers-types";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { googleAuthOptions, type GoogleAuthEnvironment } from "./google-auth";

export interface GitHubAuthEnvironment {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

export const GITHUB_IDENTITY_SCOPES = ["read:user", "user:email"] as const;
export const PRIVATE_GITHUB_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export function githubSignInConfigured(env: GitHubAuthEnvironment) {
  return Boolean(env.GITHUB_CLIENT_ID?.trim() && env.GITHUB_CLIENT_SECRET?.trim());
}

/** GitHub's provider verifies the chosen email against /user/emails; no synthetic email fallback. */
export function githubAuthOptions(env: GitHubAuthEnvironment) {
  return {
    socialProviders: githubSignInConfigured(env) ? {
      github: {
        clientId: env.GITHUB_CLIENT_ID!.trim(), clientSecret: env.GITHUB_CLIENT_SECRET!.trim(),
        disableDefaultScope: true,
        scope: [...GITHUB_IDENTITY_SCOPES],
      },
    } : {},
    user: {
      validateUserInfo: ({ user, source }) => {
        if (source.method === "oauth" && source.oauth?.providerId === "github" && user.emailVerified !== true)
          return { error: "github_email_not_verified" };
      },
    },
  } satisfies Pick<BetterAuthOptions, "socialProviders" | "user">;
}

/** Compose identity providers without dropping Google validation or account/token protections. */
export function identityAuthOptions(env: GoogleAuthEnvironment & GitHubAuthEnvironment) {
  const google = googleAuthOptions(env), github = githubAuthOptions(env);
  return {
    ...google,
    socialProviders: { ...google.socialProviders, ...github.socialProviders },
    user: {
      ...google.user,
      validateUserInfo: (input) => google.user.validateUserInfo(input) ?? github.user.validateUserInfo(input),
    },
    hooks: {
      before: createAuthMiddleware(async context => {
        if (!["/sign-in/social", "/link-social"].includes(context.path) || context.body?.provider !== "github") return;
        const scopes: unknown = context.body.scopes;
        if (scopes !== undefined && (!Array.isArray(scopes) || scopes.some(scope => !GITHUB_IDENTITY_SCOPES.includes(scope))))
          throw new APIError("BAD_REQUEST", { message: "GitHub sign-in supports identity permissions only." });
      }),
    },
  } satisfies Pick<BetterAuthOptions, "socialProviders" | "user" | "account" | "disabledPaths" | "hooks">;
}

/** A local linked identity is not a live token-validity or repository-access check. */
export async function githubAccountConnected(db: D1Database, ownerId: string): Promise<boolean> {
  if (!ownerId) return false;
  const row = await db.prepare("SELECT 1 AS connected FROM account WHERE user_id=? AND provider_id='github' LIMIT 1")
    .bind(ownerId).first<{ connected: number }>();
  return row?.connected === 1;
}
