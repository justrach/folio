import { keywordSearchMode, type KeywordBenchmarkCase, type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite } from "./keyword-benchmark-types";

export type SavedQuestionMapItem = { id: string; query: string; answered: boolean; state: "unknown" | "not-run" | "earlier-input" | "answer" | "pending" | "attention"; label: string; latestRunId?: string };

/** A run's revision belongs to the run, not the editable case. Compare its frozen inputs. */
export function matchesSavedQuestion(question: KeywordBenchmarkCase, run: KeywordBenchmarkRunSummary): boolean {
  const snapshot = run.case;
  return run.suiteId === question.suiteId && run.caseId === question.id && run.publication === "private"
    && snapshot.query === question.query && snapshot.targetUrl === question.targetUrl
    && snapshot.language === question.language && snapshot.locale === question.locale
    && snapshot.rubricVersion === question.rubricVersion && keywordSearchMode(snapshot.searchMode) === keywordSearchMode(question.searchMode)
    && JSON.stringify(snapshot.websiteResearch ?? null) === JSON.stringify(question.websiteResearch ?? null);
}

export function savedQuestionMap(suite: KeywordBenchmarkSuite, history: KeywordBenchmarkRunSummary[] | null): SavedQuestionMapItem[] {
  return suite.cases.map(question => {
    if (!history) return { id: question.id, query: question.query, answered: false, state: "unknown", label: "History not confirmed" };
    const attempts = history.filter(run => matchesSavedQuestion(question, run)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt));
    const latest = attempts[0];
    const answered = attempts.some(run => run.status === "completed" && run.answerCharacters > 0);
    const latestState = latest && ["queued", "running"].includes(latest.status) ? "pending"
      : latest && ["requires_action", "failed", "cancelled"].includes(latest.status) ? "attention" : null;
    const state = latestState ?? (answered ? "answer" : latest ? "attention" : history.some(run => run.suiteId === suite.id && run.caseId === question.id) ? "earlier-input" : "not-run");
    const label = [answered ? "Answer recorded" : null, latestState === "pending" ? "Latest attempt pending" : latestState === "attention" ? "Latest attempt needs attention" : null].filter(Boolean).join(" · ")
      || (state === "earlier-input" ? "Inputs changed · no matching answer" : state === "not-run" ? "Not run" : "No recorded answer");
    return { id: question.id, query: question.query, answered, state, label, ...(latest ? { latestRunId: latest.id } : {}) };
  });
}

export type SavedQuestionProgressGroup = { key: "answer" | "pending" | "attention" | "earlier-input" | "not-run"; label: string; count: number };

/** Exclusive composition: a matching recorded answer takes precedence over its later attempts. */
export function savedQuestionProgress(items: SavedQuestionMapItem[]): SavedQuestionProgressGroup[] | null {
  if (items.some(item => item.state === "unknown")) return null;
  const groups: SavedQuestionProgressGroup[] = [
    { key: "answer", label: "Answer recorded", count: 0 },
    { key: "pending", label: "Awaiting answer", count: 0 },
    { key: "attention", label: "Needs attention", count: 0 },
    { key: "earlier-input", label: "Inputs changed", count: 0 },
    { key: "not-run", label: "Not run", count: 0 },
  ];
  for (const item of items) {
    const key = item.answered ? "answer" : item.state;
    const group = groups.find(value => value.key === key);
    if (group) group.count += 1;
  }
  return groups;
}
