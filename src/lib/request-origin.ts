import "server-only";

/**
 * Trusted origin for state-changing requests.
 *
 * Three origins are legitimate: the request's own origin, its Host header (Next
 * development can bind a different address than the browser-facing host), and the
 * configured `BETTER_AUTH_URL`. Local development runs on `http://localhost:3011`
 * while the configured base URL is the deployed domain, so comparing only against
 * the base URL refuses every local write with `invalid_origin`.
 *
 * This does not weaken CSRF protection: a cross-site request carries the
 * attacker's origin, which matches none of these.
 */
export function isTrustedWriteOrigin(request: Request, baseURL: unknown): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const url = new URL(request.url);
  const allowed = new Set<string>([url.origin]);
  const host = request.headers.get("host");
  if (host) allowed.add(`${url.protocol}//${host}`);
  if (typeof baseURL === "string") {
    try { allowed.add(new URL(baseURL).origin); } catch { /* an invalid base URL adds nothing */ }
  }
  return allowed.has(origin);
}
