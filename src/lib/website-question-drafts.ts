/** Deterministic drafts from owner-supplied context; no inferred website facts or model call. */
export function websiteQuestionDrafts(audience: string, task: string): string[] {
  const who = audience.trim(), need = task.trim();
  if (!who || !need || who.length > 60 || need.length > 120 || /[\u0000-\u001f\u007f]/.test(who + need)) return [];
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
