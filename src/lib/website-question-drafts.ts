/** Deterministic drafts from owner-supplied context; no inferred website facts or model call. */
export function websiteQuestionDrafts(audience: string, task: string): string[] {
  const who = audience.trim(), need = task.trim();
  if (!who || !need || who.length > 60 || need.length > 120 || /[\u0000-\u001f\u007f]/.test(who + need)) return [];
  return [
    `Which products should ${who} shortlist to ${need}? Explain the tradeoffs.`,
    `For ${who} who need to ${need}, which options are easiest to start using?`,
    `What costs and limitations should ${who} compare before choosing a product to ${need}?`,
  ];
}
