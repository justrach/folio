import { keywordRecommendationMetrics } from "./keyword-search-mode";
import { matchesSavedQuestion } from "./saved-question-map";
import type { KeywordBenchmarkRun, KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "./keyword-benchmark-types";

export type QuestionAppearanceValue = "yes" | "no" | "unknown" | "unmeasured" | "unavailable";
export type QuestionAppearanceRow = {
  caseId: string; question: string; recommended: QuestionAppearanceValue; cited: QuestionAppearanceValue;
  runId?: string; model?: string; startedAt?: string; note: string;
};
const newestFirst = (a: KeywordBenchmarkRunSummary, b: KeywordBenchmarkRunSummary) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);

/** Fetch precisely these owned receipts; missing latest detail must never select an older answer. */
export function latestQuestionAppearanceRuns(suite: KeywordBenchmarkSuite, history: readonly KeywordBenchmarkRunSummary[] | null): KeywordBenchmarkRunSummary[] {
  if (!history) return [];
  return suite.cases.flatMap(question => {
    const completed = history.filter(run => run.status === "completed" && matchesSavedQuestion(question, run)).sort(newestFirst)[0];
    return completed ? [completed] : [];
  });
}

export function questionAppearance(suite: KeywordBenchmarkSuite, history: readonly KeywordBenchmarkRunSummary[] | null, details: readonly KeywordBenchmarkRun[]): QuestionAppearanceRow[] {
  const selected = latestQuestionAppearanceRuns(suite, history);
  return suite.cases.map((question): QuestionAppearanceRow => {
    const base = { caseId: question.id, question: question.query };
    if (!history) return { ...base, recommended: "unavailable", cited: "unavailable", note: "Saved history is incomplete or unavailable." };
    const attempts = history.filter(run => matchesSavedQuestion(question, run)).sort(newestFirst);
    const latest = attempts[0];
    const completed = selected.find(run => run.caseId === question.id);
    const latestNote = latest?.status === "queued" || latest?.status === "running" ? `Latest attempt pending (${latest.status}).`
      : latest?.status === "requires_action" ? "Latest attempt needs attention."
      : latest?.status === "failed" || latest?.status === "cancelled" ? `Latest attempt ${latest.status}.` : "";
    if (!completed) return { ...base, recommended: "unmeasured", cited: "unmeasured", note: latestNote || (history.some(run => run.suiteId === suite.id && run.caseId === question.id) ? "Inputs changed; no matching completed answer." : "No completed answer for this question.") };
    const receipt = { runId: completed.id, model: completed.model, startedAt: completed.createdAt };
    const detail = details.find(run => run.id === completed.id && run.status === "completed" && run.answer && run.revision >= completed.revision && run.model === completed.model
      && matchesSavedQuestion(question, { ...run, answerCharacters: run.answer.text.length, mentionCount: run.answer.mentions.length, citationCount: run.answer.citations.length }));
    if (!detail) return { ...base, ...receipt, recommended: "unavailable", cited: "unavailable", note: `Latest completed run’s saved answer is unavailable.${latestNote ? ` ${latestNote}` : ""}` };
    const metrics = keywordRecommendationMetrics(detail);
    return { ...base, ...receipt, recommended: metrics.targetNamed, cited: metrics.targetCited === null ? "unknown" : metrics.targetCited ? "yes" : "no",
      note: `Latest completed answer.${latest && latest.id !== completed.id && latestNote ? ` ${latestNote}` : ""}` };
  });
}
