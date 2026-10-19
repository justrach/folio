import { compareKeywordBenchmarkRuns, type KeywordBenchmarkCase, type KeywordBenchmarkRun, type KeywordBenchmarkRunSummary, type KeywordBenchmarkSuite } from "./keyword-benchmark-types";
import { keywordRecommendationMetrics } from "./keyword-search-mode";
import { matchesSavedQuestion } from "./saved-question-map";

export type AppearanceHistoryValue = "yes" | "no" | "unknown" | "unavailable";
export type AppearanceHistoryPoint = { runId: string; startedAt: string; model: string; currentInputs: boolean; recommended: AppearanceHistoryValue; cited: AppearanceHistoryValue; detail?: KeywordBenchmarkRun };
export type AppearanceHistoryChange = { recommended: string; cited: string; reasons: string[] };
export type QuestionAppearanceHistoryData = { points: AppearanceHistoryPoint[]; totalCompleted: number | null; latestAttempt?: KeywordBenchmarkRunSummary; comparison: AppearanceHistoryChange };
const newestFirst = (a: KeywordBenchmarkRunSummary, b: KeywordBenchmarkRunSummary) => b.createdAt.localeCompare(a.createdAt) || b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
const ownedQuestionRuns = (suite: KeywordBenchmarkSuite, caseId: string, history: readonly KeywordBenchmarkRunSummary[]) => suite.cases.some(question => question.id === caseId)
  ? history.filter(run => run.publication === "private" && run.suiteId === suite.id && run.caseId === caseId).sort(newestFirst) : [];

/** Bounded receipt selection, including earlier inputs so changes remain visible rather than silently pooled. */
export function selectedQuestionHistoryRuns(suite: KeywordBenchmarkSuite, caseId: string, history: readonly KeywordBenchmarkRunSummary[] | null): KeywordBenchmarkRunSummary[] {
  return history ? ownedQuestionRuns(suite, caseId, history).filter(run => run.status === "completed").slice(0, 10) : [];
}
function detailFor(summary: KeywordBenchmarkRunSummary, details: readonly KeywordBenchmarkRun[]): KeywordBenchmarkRun | undefined {
  const frozenQuestion: KeywordBenchmarkCase = { ...summary.case, id: summary.caseId, suiteId: summary.suiteId, revision: 0, createdAt: summary.createdAt, updatedAt: summary.createdAt };
  return details.find(run => run.id === summary.id && run.model === summary.model && run.status === "completed" && run.answer && run.revision >= summary.revision
    && matchesSavedQuestion(frozenQuestion, { ...run, answerCharacters: run.answer.text.length, mentionCount: run.answer.mentions.length, citationCount: run.answer.citations.length }));
}
function laneChange(before: AppearanceHistoryValue, after: AppearanceHistoryValue, recommended: boolean): string {
  if (before === "unavailable" || after === "unavailable") return "Comparison unavailable: a saved answer is missing.";
  if (before === "unknown" || after === "unknown") return "Comparison unavailable: a website identity is unknown.";
  if (before === after) return `Unchanged · ${after === "yes" ? (recommended ? "recommended" : "cited") : (recommended ? "not recommended" : "not cited")}`;
  return after === "yes" ? (recommended ? "Now recommended" : "Now cited as source") : (recommended ? "No longer recommended" : "No longer cited as source");
}

/** Compare adjacent saved completions only. Missing details and changed settings cannot be skipped. */
export function compareAppearanceHistoryPoints(before: AppearanceHistoryPoint, after: AppearanceHistoryPoint): AppearanceHistoryChange {
  const reasons: string[] = [];
  if (!before.currentInputs || !after.currentInputs) reasons.push("The latest two observations do not both match current question inputs.");
  if (!before.detail || !after.detail) reasons.push("Both latest completed saved answers must be available.");
  if (before.detail && after.detail) {
    const a = before.detail, b = after.detail;
    reasons.push(...compareKeywordBenchmarkRuns(a, b).reasons);
    if (a.suiteId !== b.suiteId || a.caseId !== b.caseId) reasons.push("The saved suite or question changed.");
    if (JSON.stringify([...a.allowedDomains].sort()) !== JSON.stringify([...b.allowedDomains].sort())) reasons.push("The allowed domains changed.");
    if (JSON.stringify(a.case.websiteResearch ?? null) !== JSON.stringify(b.case.websiteResearch ?? null)) reasons.push("The website research setup changed.");
    if (a.providerMetadata.searchProvider !== b.providerMetadata.searchProvider) reasons.push("The search provider changed.");
  }
  const unique = [...new Set(reasons)];
  return unique.length ? { recommended: "Comparison unavailable", cited: "Comparison unavailable", reasons: unique }
    : { recommended: laneChange(before.recommended, after.recommended, true), cited: laneChange(before.cited, after.cited, false), reasons: [] };
}

export function questionAppearanceHistory(suite: KeywordBenchmarkSuite, caseId: string, history: readonly KeywordBenchmarkRunSummary[] | null, details: readonly KeywordBenchmarkRun[]): QuestionAppearanceHistoryData {
  const question = suite.cases.find(item => item.id === caseId);
  if (!history || !question) return { points: [], totalCompleted: null, comparison: { recommended: "Comparison unavailable", cited: "Comparison unavailable", reasons: ["Saved history is incomplete or unavailable."] } };
  const runs = ownedQuestionRuns(suite, caseId, history);
  const completed = runs.filter(run => run.status === "completed");
  const points = selectedQuestionHistoryRuns(suite, caseId, history).reverse().map((summary): AppearanceHistoryPoint => {
    const detail = detailFor(summary, details);
    const currentInputs = matchesSavedQuestion(question, summary) && (!detail || JSON.stringify(detail.case.referenceFacts ?? []) === JSON.stringify(question.referenceFacts ?? []));
    const base = { runId: summary.id, startedAt: summary.createdAt, model: summary.model, currentInputs };
    if (!detail) return { ...base, recommended: "unavailable", cited: "unavailable" };
    const metrics = keywordRecommendationMetrics(detail);
    return { ...base, detail, recommended: metrics.targetNamed, cited: metrics.targetCited === null ? "unknown" : metrics.targetCited ? "yes" : "no" };
  });
  const comparison = points.length >= 2 ? compareAppearanceHistoryPoints(points[points.length - 2], points[points.length - 1])
    : { recommended: "Not enough observations", cited: "Not enough observations", reasons: ["Two completed matching observations are needed to compare change."] };
  return { points, totalCompleted: completed.length, latestAttempt: runs[0]?.status !== "completed" ? runs[0] : undefined, comparison };
}
