import type { PublicPromptExperiment } from "./prompt-evals";

export type PublicRankingRow = {
  name: string;
  mentionedAnswers: number;
  completedAnswers: number;
  /** Observed literal mention percentage, never a quality score. */
  score: number | null;
  rank: number | null;
  promptedQuestions: number;
};

const count = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** All companies share the selected models' observed-answer denominator.
 * Missing or corrupt evidence remains unranked rather than improving a score.
 */
export function buildPublicRanking(
  experiment: PublicPromptExperiment,
  modelId?: string,
): PublicRankingRow[] {
  const models = experiment.models.filter((model) => modelId === undefined || model.model === modelId);
  const names = [...new Set(experiment.models.flatMap((model) => model.trackedCompanies.map((company) => company.name)))];
  const validModels = models.length > 0 && new Set(models.map((model) => model.model)).size === models.length &&
    count(experiment.questionCount) && experiment.questionCount === experiment.questions.length &&
    count(experiment.repeats) && experiment.repeats > 0 &&
    models.every((model) => [model.plannedAnswers, model.completedAnswers, model.failedAnswers, model.unresolvedAnswers].every(count) &&
      model.plannedAnswers === experiment.questionCount * experiment.repeats &&
      model.completedAnswers + model.failedAnswers + model.unresolvedAnswers === model.plannedAnswers);
  const completedAnswers = models.reduce((sum, model) => sum + (count(model.completedAnswers) ? model.completedAnswers : 0), 0);
  const rows = names.map((name): PublicRankingRow => {
    const records = models.map((model) => model.trackedCompanies.filter((company) => company.name === name));
    const valid = validModels && records.every((matches, index) => matches.length === 1 &&
      count(matches[0].mentionedAnswers) && matches[0].mentionedAnswers <= models[index].completedAnswers &&
      count(matches[0].promptedQuestions) && matches[0].promptedQuestions <= experiment.questionCount);
    const mentionedAnswers = records.reduce((sum, matches) => sum + (matches.length === 1 && count(matches[0].mentionedAnswers) ? matches[0].mentionedAnswers : 0), 0);
    const promptedQuestions = Math.max(0, ...records.flatMap((matches) => matches.map((record) => count(record.promptedQuestions) ? record.promptedQuestions : 0)));
    return { name, mentionedAnswers, completedAnswers, promptedQuestions,
      score: valid && completedAnswers > 0 && promptedQuestions === 0 ? mentionedAnswers / completedAnswers * 100 : null,
      rank: null };
  });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
  let rank = 0;
  let previous: number | null = null;
  rows.forEach((row, index) => {
    if (row.score === null) return;
    if (previous !== row.score) rank = index + 1;
    row.rank = rank;
    previous = row.score;
  });
  return rows;
}

/** Public summaries do not contain aliases. Matching names cannot prove that
 * alias definitions stayed unchanged; history is descriptive, not causal.
 * Question order is retained because changing a frozen suite changes its identity.
 */
export function comparableHistory(
  experiments: PublicPromptExperiment[],
  selected: PublicPromptExperiment,
  modelId?: string,
): PublicPromptExperiment[] {
  const signature = (experiment: PublicPromptExperiment) => JSON.stringify({
    questions: experiment.questions,
    questionCount: experiment.questionCount,
    version: experiment.version,
    repeats: experiment.repeats,
    models: experiment.models.map((model) => ({
      model: model.model,
      companies: model.trackedCompanies.map((company) => company.name).sort(),
    })).sort((a, b) => a.model.localeCompare(b.model)),
  });
  const target = signature(selected);
  const seen = new Set<string>();
  return experiments.filter((experiment) => {
    if (seen.has(experiment.id) || !Number.isFinite(Date.parse(experiment.completedAt)) ||
      signature(experiment) !== target ||
      (modelId !== undefined && !experiment.models.some((model) => model.model === modelId))) return false;
    seen.add(experiment.id);
    return true;
  }).sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt) || a.id.localeCompare(b.id));
}

/** Older aggregate-only publications cannot be reverse-engineered into query ranks. */
export function questionExperiment(experiment: PublicPromptExperiment, questionIndex: number): PublicPromptExperiment | null {
  if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= experiment.questions.length) return null;
  const records = experiment.questionResults?.filter(item => item.questionIndex === questionIndex);
  if (records?.length !== 1) return null;
  return { ...experiment, questionCount: 1, questions: [experiment.questions[questionIndex]], models: records[0].models, questionResults: undefined };
}
