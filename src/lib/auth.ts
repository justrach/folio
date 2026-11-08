import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getAuthDb, getPgPool, postgresConnection } from "@/lib/db";
import * as schema from "@/lib/auth-schema";
import { authSchema as pgSchema } from "@/lib/auth-schema-pg";
import { identityAuthOptions } from "@/lib/github-auth";
import { devSession } from "@/lib/dev-auth";

export async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET;
  const baseURL = env.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new Error(
      "Authentication is not configured. Set BETTER_AUTH_SECRET (at least 32 characters) and BETTER_AUTH_URL in .dev.vars or Worker secrets.",
    );
  }

  // Two engines, two schemas: Postgres uses pg-core tables and the pg provider;
  // D1 keeps the SQLite tables. The adapter choice must match the schema.
  const engineEnv = env as unknown as { DB_ENGINE?: string; HYPERDRIVE?: { connectionString: string }; PLANETSCALE_APP_URL?: string };
  const postgres = postgresConnection(engineEnv);
  if ((engineEnv.DB_ENGINE ?? process.env.DB_ENGINE) === "postgres" && !postgres) throw new Error("Postgres authentication is not configured.");
  // The driver must match the engine: drizzle-orm/d1 talks the D1 API and would
  // call prepare() on a pg Pool.
  const database = postgres
    ? drizzlePg(getPgPool(postgres, Boolean((engineEnv as { HYPERDRIVE?: unknown }).HYPERDRIVE)), { schema: pgSchema })
    : drizzleD1(await getAuthDb(), { schema });
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
    database: drizzleAdapter(database as never, postgres
      ? { provider: "pg", schema: pgSchema }
      : { provider: "sqlite", schema }),
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

/** Always validate the session server-side before reading or writing tenant data.
 * The only bypass is the explicit local DEV_AUTH switch in dev-auth.ts. */
export async function getSession(headers: Headers) {
  const local = devSession();
  if (local) return local as unknown as AuthSession;
  const auth = await getAuth();
  return auth.api.getSession({ headers });
}

type BetterAuthSession = Awaited<ReturnType<Awaited<ReturnType<typeof getAuth>>["api"]["getSession"]>>;
export type AuthSession = BetterAuthSession;
