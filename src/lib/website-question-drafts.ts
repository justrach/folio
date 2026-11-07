import { MAX_CUSTOMER_GROUPS } from "./onboarding-customers";

/** Ten drafts, interleaved so every customer group appears before any group repeats. */
export function websiteCustomerGroupDrafts(customerGroups: string[], task: string): string[] {
  if (customerGroups.length > MAX_CUSTOMER_GROUPS) return [];
  const seen = new Set<string>();
  const groups = customerGroups.filter(value => {
    const key = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!groups.length) return [];
  const drafts = groups.map(group => websiteQuestionDrafts(group, task));
  if (drafts.some(questions => !questions.length)) return [];
  const questions: string[] = [];
  for (let index = 0; questions.length < 10; index++) {
    for (const group of drafts) {
      questions.push(group[index]);
      if (questions.length === 10) break;
    }
  }
  return questions;
}

/** Deterministic drafts from owner-supplied context; no inferred website facts or model call. */
export function websiteQuestionDrafts(audience: string, task: string): string[] {
  const who = audience.trim().replace(/\s+/g, " "), need = task.trim();
  if (!who || !need || need.length > 120 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(audience) || /[\u0000-\u001f\u007f]/.test(need)) return [];
  // "choose a library" is already a buying decision; "shortlist to choose a library" reads badly.
  const choice = /^choos(?:e|ing)\s+(?:(?:a|an|the)\s+)?(.+)$/i.exec(need);
  if (choice) {
    const [head, tail = ""] = choice[1].split(/(?=\s(?:for|to)\s)/, 2), thing = `${/^[aeio]/i.test(head) ? "an" : "a"} ${head}${tail}`;
    return [
      `Which ${head}${tail} should ${who} choose? Explain the tradeoffs.`,
      `For ${who} choosing ${thing}, which options are easiest to start using?`,
      `What costs and limitations should ${who} compare before choosing ${thing}?`,
      `Which ${head} options${tail} have the clearest pricing and limits for ${who}?`,
      `What setup work does each leading ${head}${tail} need for ${who}?`,
      `Which ${head} options${tail} help ${who} keep control of their data?`,
      `How can ${who} test ${thing} before paying?`,
      `What support is available when ${who} use ${thing}?`,
      `What would make ${thing} unsuitable for ${who}?`,
      `How can ${who} switch to a different ${head} later?`,
    ];
  }
  return [
    `Which products should ${who} shortlist to ${need}? Explain the tradeoffs.`,
    `For ${who} who need to ${need}, which options are easiest to start using?`,
    `What costs and limitations should ${who} compare before choosing a product to ${need}?`,
    `Which options for ${who} to ${need} have the clearest pricing and limits?`,
    `What setup work is needed for ${who} to ${need} with the leading options?`,
    `Which options help ${who} to ${need} while keeping control of their data?`,
    `How can ${who} test whether an option helps them ${need} before paying?`,
    `What support is available when ${who} use a product to ${need}?`,
    `What would make an option unsuitable for ${who} who need to ${need}?`,
    `How can ${who} switch providers after choosing a product to ${need}?`,
  ];
}
