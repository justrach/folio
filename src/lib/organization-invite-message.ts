/**
 * The note an owner sends someone they added by email. Folio sends no email itself: the owner's own
 * mail app opens with this text (mailto), or they copy it into chat. Client-safe; no secrets.
 */
export const signInLink = (origin: string) => `${origin.replace(/\/$/, "")}/login?next=/orgs`;

export function inviteMessage(input: { organization: string; email: string; origin: string; from?: string | null }) {
  const subject = `Join ${input.organization} on Folio`;
  const body = [
    "Hi,",
    `I’ve added you to ${input.organization} on Folio, where we see how our websites show up in Google and AI answers.`,
    `Sign in with Google or GitHub as ${input.email} and you’ll join automatically:\n${signInLink(input.origin)}`,
    "From there you can read the websites we share and connect your own AI agent.",
    ...(input.from ? [input.from] : []),
  ].join("\n\n");
  return { subject, body };
}

/** Opens the owner's mail app with the note filled in. The address was validated when it was added. */
export function inviteMailto(input: Parameters<typeof inviteMessage>[0]) {
  const { subject, body } = inviteMessage(input);
  return `mailto:${encodeURIComponent(input.email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
