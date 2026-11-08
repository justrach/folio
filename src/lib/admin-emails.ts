/** Shared with the client so the sidebar can show the link to the right people.
 * The page itself re-checks on the server; this list only decides navigation. */
export const ADMIN_OWNERS = ["rachxpradhan@gmail.com", "yuxilim22@gmail.com"] as const;

export function isAdminOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return (ADMIN_OWNERS as readonly string[]).includes(email.trim().toLowerCase());
}
