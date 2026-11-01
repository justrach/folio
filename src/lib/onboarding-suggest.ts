/** Deterministic onboarding helpers. No model call and no network access. */

export type OnboardingCheck = { id: string; label: string; status: string; points: number; maxPoints: number; detail?: string };

/** Failing scored checks, largest point gap first. Optional diagnostics are excluded. */
export function onboardingFixes(checks: OnboardingCheck[]) {
  return checks
    .filter(check => check.maxPoints > 0 && check.status !== "optional" && check.points < check.maxPoints)
    .map(check => ({ ...check, gap: check.maxPoints - check.points }))
    .sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label));
}

export function scoredCheckCount(checks: OnboardingCheck[]) {
  return checks.filter(check => check.maxPoints > 0 && check.status !== "optional").length;
}

const clean = (value: string) => value.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
const STOP_PREFIX = /^(?:the|a|an|our|your)\s+(?:(?:most|best|only|first|fastest|simplest|easiest|leading|modern|complete|open[- ]source)\s+)*/i;
const SUPERLATIVE = /^(?:(?:most|best|only|first|fastest|simplest|easiest|leading|modern|comprehensive|complete|powerful|ultimate|all[- ]in[- ]one)\s+)+/i;
const PRODUCT_NOUN = /\b(framework|platform|library|toolkit|tool|app|service|api|sdk|software|solution|engine|database|cms|editor|marketplace|store|shop|agency|studio|course|school)s?\b/i;

function audienceFrom(phrase: string) {
  const value = clean(phrase).replace(/^(?:all|every|any)\s+/i, "");
  if (!value || value.length > 60) return "";
  const words = value.split(" ");
  // "TypeScript" or "Next.js" names a technology, not people; add the people who use it.
  if (words.length <= 2 && /^[A-Z0-9]/.test(value) && !/s$/i.test(words[words.length - 1])) return `${value} developers`.slice(0, 60);
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function article(noun: string) { return /^(?:[aeio]|u(?!s|n[iy]))/i.test(noun) ? "an" : "a"; }
const PEOPLE = "teams|businesses|companies|developers|people|users|customers|brands|creators|shops|stores|organizations|organisations|startups|engineers|designers|marketers|students|families|founders|agencies";
const HELPS = new RegExp(`\\bhelps?\\s+((?:all\\s+(?:types|kinds|sizes)\\s+of\\s+)?(?:[\\w-]+\\s+){0,3}?(?:${PEOPLE}))\\s+(?:to\\s+)?([^.;!?]+)`, "i");

/**
 * Suggest who the customers are and what they want to do from the checked page's own
 * title and meta description. Returns empty strings when the page does not say.
 */
export function suggestAudienceTask(input: { title?: string | null; description?: string | null }) {
  const texts = [input.description ?? "", input.title ?? ""].map(clean).filter(Boolean);
  let audience = "", task = "";
  for (const text of texts) {
    const sentence = (text.split(/(?<=[.!?])\s|\s[|·–-]\s/)[0] ?? text).replace(/^[A-Z][\w.-]*(?:\s[A-Z][\w.-]*)?\s+(?:is|are)\s+/, "");
    const helps = HELPS.exec(sentence);
    if (helps) {
      if (!audience) audience = audienceFrom(helps[1].replace(/^all\s+(?:types|kinds|sizes)\s+of\s+/i, ""));
      if (!task) task = clean(helps[2]).toLowerCase();
    }
    const match = /^(.*?)\bfor\s+([^.,;:!?|]+?)(?:\s+(?:who|that|to|with|in)\b|[.,;:!?|]|$)/i.exec(sentence);
    const gerund = match && /^[a-z]+ing\b/i.test(clean(match[2]));
    if (!audience && match && !gerund) audience = audienceFrom(match[2]);
    if (!task) {
      const before = clean((match ? match[1] : sentence).replace(STOP_PREFIX, "").replace(SUPERLATIVE, ""));
      const nounMatch = PRODUCT_NOUN.exec(before);
      if (nounMatch) {
        const phrase = clean(before.slice(0, nounMatch.index + nounMatch[0].length)).replace(/^(?:is|are)\s+/i, "");
        const words = phrase.split(" ").slice(-4).join(" ").toLowerCase();
        const noun = words.replace(/s$/, "");
        if (words.length >= 3) task = gerund && match ? `choose ${article(noun)} ${noun} for ${clean(match[2]).toLowerCase()}` : `choose ${article(noun)} ${noun}`;
      }
    }
    if (audience && task) break;
  }
  return { audience: audience.slice(0, 60), task: task.slice(0, 120) };
}

/** Normalises a typed competitor name and its aliases. Duplicates and blanks are removed. */
export function normaliseCompetitor(name: unknown, aliases: unknown) {
  if (typeof name !== "string") return null;
  const value = clean(name);
  if (!value || value.length > 80) return null;
  const list = (Array.isArray(aliases) ? aliases : []).filter((alias): alias is string => typeof alias === "string").map(clean)
    .filter(alias => alias && alias.length <= 80 && alias.toLowerCase() !== value.toLowerCase());
  return { name: value, aliases: [...new Map(list.map(alias => [alias.toLowerCase(), alias])).values()].slice(0, 5) };
}
