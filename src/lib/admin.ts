import "server-only";

/**
 * Internal admin allowlist.
 *
 * Two named accounts, plus any address listed in `ADMIN_EMAILS`. The env var is
 * additive so a local dev account can be added in `.dev.vars` without editing
 * code or widening the deployed list.
 */
const OWNERS = ["rachxpradhan@gmail.com", "yuxilim22@gmail.com"];

export function adminEmails(): string[] {
  const extra = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...OWNERS, ...extra])];
}

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
