/**
 * Client-side filtering for the questions already loaded on the private overview.
 * It never widens the server query: results describe the loaded set only.
 */
export type QuestionOutcome = "named" | "not-named" | "unknown" | "not-measured";
export type QuestionFilter = QuestionOutcome | "needs-review";
export type QuestionView = "list" | "cards";

export const QUESTION_FILTERS: { key: QuestionFilter; label: string }[] = [
  { key: "named", label: "Named your site" },
  { key: "not-named", label: "Not named" },
  { key: "unknown", label: "Identity unknown" },
  { key: "not-measured", label: "Not measured" },
  { key: "needs-review", label: "Needs review" },
];

export type QuestionRow = { id: string; query: string; outcome: QuestionOutcome; needsReview: boolean };

export function questionOutcome(named: "yes" | "no" | "unknown" | null): QuestionOutcome {
  return named === null ? "not-measured" : named === "yes" ? "named" : named === "no" ? "not-named" : "unknown";
}

/** Lower-cased whitespace tokens; quoted phrases stay together. */
export function searchTokens(input: string): string[] {
  const tokens: string[] = [];
  for (const match of input.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const token = (match[1] ?? match[2]).trim();
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens.slice(0, 8);
}

/** Every token must appear in the question; any selected filter may match (OR within filters). */
export function filterQuestions<T extends QuestionRow>(rows: readonly T[], tokens: readonly string[], filters: ReadonlySet<QuestionFilter>): T[] {
  return rows.filter(row => {
    const text = row.query.toLowerCase();
    if (!tokens.every(token => text.includes(token))) return false;
    if (!filters.size) return true;
    return filters.has(row.outcome) || (filters.has("needs-review") && row.needsReview);
  });
}

export function filterCounts(rows: readonly QuestionRow[]): Record<QuestionFilter, number> {
  const counts: Record<QuestionFilter, number> = { named: 0, "not-named": 0, unknown: 0, "not-measured": 0, "needs-review": 0 };
  for (const row of rows) { counts[row.outcome]++; if (row.needsReview) counts["needs-review"]++; }
  return counts;
}

export const QUESTION_VIEW_KEY = "folio-overview-question-view";
export const parseQuestionView = (value: unknown): QuestionView => value === "cards" ? "cards" : "list";

/** Scrubber index after a key press, or null when the key is not handled. */
export function scrubIndex(key: string, index: number, length: number): number | null {
  if (length < 1) return null;
  const last = length - 1;
  switch (key) {
    case "ArrowLeft": case "ArrowDown": return Math.max(0, index - 1);
    case "ArrowRight": case "ArrowUp": return Math.min(last, index + 1);
    case "Home": return 0;
    case "End": return last;
    case "PageDown": return Math.max(0, index - 3);
    case "PageUp": return Math.min(last, index + 3);
    default: return null;
  }
}

/** Nearest point index for a horizontal position as a 0–1 fraction of the plotted width. */
export function nearestIndex(fraction: number, length: number): number {
  if (length < 2) return 0;
  return Math.round(Math.min(1, Math.max(0, fraction)) * (length - 1));
}
