import "server-only";

/**
 * Local pseudo authentication.
 *
 * Set `DEV_AUTH=1` and `DEV_AUTH_USER_ID=<id>` in `.dev.vars` and every request
 * runs as that account without a provider, password, or OAuth round trip. That is
 * what makes the app usable by a person and by an agent against the same local
 * database.
 *
 * This is deliberately narrow:
 * - it is off unless `DEV_AUTH=1` is set in the local environment;
 * - it runs only when `BETTER_AUTH_URL` is a loopback origin (localhost,
 *   127.0.0.1 or [::1], any port) and throws for anything else, including an
 *   unset value, so a copied `.dev.vars` cannot turn a deployed app into an open
 *   workspace;
 * - it never creates the account. Run `bun run dev:seed` first, so foreign keys
 *   and owner scoping still behave like the real thing.
 */
export type DevSession = {
  session: {
    id: string;
    userId: string;
    token: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
    ipAddress: string;
    userAgent: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    image: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
};

/** An allowlist, not a denylist: only http(s) on localhost, 127.0.0.1 or [::1], on any port. */
export function isLoopbackOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

export function devAuthUserId(env: Record<string, unknown> = {}): string | null {
  const enabled = (env.DEV_AUTH ?? process.env.DEV_AUTH) === "1";
  if (!enabled) return null;
  if (!isLoopbackOrigin(String(env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL ?? "")))
    throw new Error("DEV_AUTH only runs when BETTER_AUTH_URL is a loopback origin (localhost, 127.0.0.1 or [::1]). Unset it in .dev.vars.");
  const userId = String(env.DEV_AUTH_USER_ID ?? process.env.DEV_AUTH_USER_ID ?? "").trim();
  return userId || null;
}

export function devSession(env: Record<string, unknown> = {}): DevSession | null {
  const userId = devAuthUserId(env);
  if (!userId) return null;
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365);
  return {
    session: {
      id: `dev-session-${userId}`,
      userId,
      token: `dev-token-${userId}`,
      expiresAt: expires,
      createdAt: now,
      updatedAt: now,
      ipAddress: "127.0.0.1",
      userAgent: "folio-local-dev",
    },
    user: {
      id: userId,
      name: String(env.DEV_AUTH_NAME ?? process.env.DEV_AUTH_NAME ?? "Local dev user"),
      email: String(env.DEV_AUTH_EMAIL ?? process.env.DEV_AUTH_EMAIL ?? "dev@folio.local"),
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
