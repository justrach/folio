import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, getPgPool } from "@/lib/db";
import * as pgSchema from "@/lib/auth-schema-pg";
import * as sqliteSchema from "@/lib/auth-schema";
import { identityAuthOptions } from "@/lib/github-auth";

export async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error(
      "Authentication is not configured. Set BETTER_AUTH_SECRET (at least 32 characters) and BETTER_AUTH_URL in .dev.vars or Worker secrets.",
    );
  }

  // Keep local D1 and the existing production binding active until a verified
  // PostgreSQL cutover. Never cache either connection across Worker requests.
  const usePg = Boolean(env.HYPERDRIVE || (process.env.NODE_ENV === "development" && process.env.FOLIO_POSTGRES_URL));
  const database = usePg
    ? drizzleAdapter(drizzlePg(await getPgPool(), { schema: pgSchema }), { provider: "pg", schema: pgSchema })
    : drizzleAdapter(drizzleD1(await getDb(), { schema: sqliteSchema }), { provider: "sqlite", schema: sqliteSchema });
  return betterAuth({
    appName: "Folio",
    baseURL,
    secret,
    ...identityAuthOptions({
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET,
    }),
    database,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      },
    },
  });
}

/** Always validate the session server-side before reading or writing tenant data. */
export async function getSession(headers: Headers) {
  const auth = await getAuth();
  return auth.api.getSession({ headers });
}

export type AuthSession = Awaited<ReturnType<typeof getSession>>;
