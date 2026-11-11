import { compareKeywordBenchmarkRuns, type KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { keywordRecommendationMetrics } from "./keyword-search-mode";

/** Shared by the store, the MCP projection and the browser panel. No I/O. */
export type ChangeStatus = "proposed" | "published" | "withdrawn";
/** What one saved answer said about the website. Position is the first listing, when named. */
export type ChangeAnswer = { runId: string; observedAt: string; targetNamed: "yes" | "no" | "unknown"; targetCited: boolean | null; position: number | null };
export type ChangeBaseline = { caseId: string; query: string; answer: ChangeAnswer | null };
export type ChangeQuestionState = "awaiting_publication" | "withdrawn" | "baseline_unmeasured" | "baseline_after_publication"
  | "awaiting_retest" | "retest_incomplete" | "incompatible_retest" | "retested";
export type ChangeMovement = "newly_named" | "no_longer_named" | "newly_cited" | "no_longer_cited" | "moved_up" | "moved_down" | "unchanged" | "unknown";
export type ChangeQuestion = { caseId: string; query: string; state: ChangeQuestionState; baseline: ChangeAnswer | null;
  retest: ChangeAnswer | null; movement: ChangeMovement | null; reasons: string[] };
export type ChangeOutcome = { targeted: number; retested: number; improved: number; declined: number; unchanged: number;
  unknown: number; awaitingRetest: number; unmeasured: number };
export type WebsiteChange = {
  id: string; website: { id: string; url: string; name: string }; title: string; summary: string; status: ChangeStatus;
  recordedBy: { keyId: string | null; keyName: string | null }; files: string[]; referenceUrl: string | null;
  createdAt: string; updatedAt: string;
  publication: { at: string; reportedBy: "agent" | "owner"; provenance: string } | null;
  questions: ChangeQuestion[]; outcome: ChangeOutcome; nextStep: string; caveat: string;
};

export const CHANGE_CAVEAT = "Before and after are saved answers to the same question with matching settings. They describe what was recorded, not proof that this change caused a difference. Missing evidence is unmeasured.";
export const PUBLICATION_PROVENANCE = "Reported by the caller; Folio did not verify that the website changed.";

export function changeAnswer(run: Pick<KeywordBenchmarkRun, "id" | "createdAt" | "status" | "answer" | "case">): ChangeAnswer {
  const metrics = keywordRecommendationMetrics(run);
  return { runId: run.id, observedAt: run.createdAt, targetNamed: metrics.targetNamed, targetCited: metrics.targetCited, position: metrics.targetPositions[0] ?? null };
}

export function changeMovement(before: ChangeAnswer, after: ChangeAnswer): ChangeMovement {
  if (before.targetNamed === "unknown" || after.targetNamed === "unknown") return "unknown";
  if (before.targetNamed !== after.targetNamed) return after.targetNamed === "yes" ? "newly_named" : "no_longer_named";
  if (before.targetCited === false && after.targetCited === true) return "newly_cited";
  if (before.targetCited === true && after.targetCited === false) return "no_longer_cited";
  if (before.position !== null && after.position !== null && before.position !== after.position) return after.position < before.position ? "moved_up" : "moved_down";
  return "unchanged";
}

const sameDomains = (a: string[], b: string[]) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());

/** `later` holds saved attempts created at or after publication, newest first, per question. */
export function changeQuestions(change: { status: ChangeStatus; publishedAt: string | null; baseline: ChangeBaseline[] },
  evidence: { baselineRuns: Map<string, KeywordBenchmarkRun>; later: Map<string, KeywordBenchmarkRun[]>; incomplete: Map<string, number> }): ChangeQuestion[] {
  return change.baseline.map(item => {
    const base = { caseId: item.caseId, query: item.query, baseline: item.answer, retest: null, movement: null, reasons: [] as string[] };
    if (change.status === "withdrawn") return { ...base, state: "withdrawn" as const };
    if (change.status === "proposed" || !change.publishedAt) return { ...base, state: "awaiting_publication" as const };
    const completed = (evidence.later.get(item.caseId) ?? []).filter(run => run.status === "completed" && run.answer);
    const latest = completed[0] ? changeAnswer(completed[0]) : null;
    if (!item.answer) return { ...base, retest: latest, state: "baseline_unmeasured" as const,
      reasons: ["No completed answer was saved for this question before the change was recorded."] };
    if (Date.parse(item.answer.observedAt) >= Date.parse(change.publishedAt)) return { ...base, retest: latest, state: "baseline_after_publication" as const,
      reasons: ["The baseline answer was saved at or after the reported publication time, so it is not a before measurement."] };
    if (!completed.length) return { ...base, state: (evidence.incomplete.get(item.caseId) ?? 0) > 0 ? "retest_incomplete" as const : "awaiting_retest" as const };
    const before = evidence.baselineRuns.get(item.answer.runId);
    if (!before) return { ...base, retest: latest, state: "incompatible_retest" as const,
      reasons: ["The baseline run is no longer saved, so matching settings cannot be confirmed."] };
    const reasonsFor = (run: KeywordBenchmarkRun) => [...compareKeywordBenchmarkRuns(before, run).reasons,
      ...(sameDomains(before.allowedDomains, run.allowedDomains) ? [] : ["The research corpus changed."])];
    const matched = completed.find(run => reasonsFor(run).length === 0);
    if (!matched) return { ...base, retest: latest, state: "incompatible_retest" as const, reasons: reasonsFor(completed[0]) };
    const retest = changeAnswer(matched);
    return { ...base, retest, state: "retested" as const, movement: changeMovement(item.answer, retest) };
  });
}

export function changeOutcome(questions: ChangeQuestion[]): ChangeOutcome {
  const moved = (values: ChangeMovement[]) => questions.filter(q => q.movement !== null && values.includes(q.movement)).length;
  const inState = (values: ChangeQuestionState[]) => questions.filter(q => values.includes(q.state)).length;
  return { targeted: questions.length, retested: inState(["retested"]),
    improved: moved(["newly_named", "newly_cited", "moved_up"]), declined: moved(["no_longer_named", "no_longer_cited", "moved_down"]),
    unchanged: moved(["unchanged"]), unknown: moved(["unknown"]),
    awaitingRetest: inState(["awaiting_retest", "retest_incomplete"]),
    unmeasured: inState(["baseline_unmeasured", "baseline_after_publication", "incompatible_retest"]) };
}

export function changeNextStep(status: ChangeStatus, outcome: ChangeOutcome): string {
  if (status === "withdrawn") return "This change was withdrawn. No retest is expected.";
  if (status === "proposed") return "When the change is live on the public website, confirm publication (folio_change_update with status \"published\"). Folio does not deploy or verify it.";
  if (outcome.awaitingRetest) return `Retest ${outcome.awaitingRetest} question${outcome.awaitingRetest === 1 ? "" : "s"}: folio_evaluate with kind "keyword", the caseId and maxAgeSeconds 0, so an answer saved before publication is not reused. A new answer is paid and needs the owner's explicit approval. Then read this change again.`;
  if (outcome.retested === outcome.targeted) return "Every targeted question has a matched retest. Report the differences as observations, not as an effect of this change.";
  return "Some questions cannot be compared. Each one lists its reason.";
}

export function changeAnswerLabel(answer: ChangeAnswer | null): string {
  if (!answer) return "No saved answer";
  if (answer.targetNamed === "unknown") return "Could not be determined";
  const cited = answer.targetCited === true ? "cited" : answer.targetCited === false ? "not cited" : "citation unknown";
  return answer.targetNamed === "yes" ? `Named${answer.position === null ? "" : ` at position ${answer.position}`}, ${cited}` : `Not named, ${cited}`;
}
export const CHANGE_MOVEMENT_LABELS: Record<ChangeMovement, string> = {
  newly_named: "Now named", no_longer_named: "No longer named", newly_cited: "Now cited", no_longer_cited: "No longer cited",
  moved_up: "Listed earlier", moved_down: "Listed later", unchanged: "No change", unknown: "Could not be compared" };
export const CHANGE_STATE_LABELS: Record<ChangeQuestionState, string> = {
  awaiting_publication: "Waiting for publication", withdrawn: "Withdrawn", baseline_unmeasured: "No answer saved before the change",
  baseline_after_publication: "Baseline saved after publication", awaiting_retest: "Waiting for a retest",
  retest_incomplete: "Retest not finished", incompatible_retest: "Retest used different settings", retested: "Retested" };
