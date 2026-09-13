import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/auth-schema";
import { googleAuthOptions } from "@/lib/google-auth";

export async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error(
      "Authentication is not configured. Set BETTER_AUTH_SECRET (at least 32 characters) and BETTER_AUTH_URL in .dev.vars or Worker secrets.",
    );
  }

  const database = drizzle(await getDb(), { schema });
  return betterAuth({
    appName: "Folio",
    baseURL,
    secret,
    ...googleAuthOptions({
      GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
    }),
    database: drizzleAdapter(database, { provider: "sqlite", schema }),
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
