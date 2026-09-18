/** Prompt experiments measure observed API answers, not consumer-chatbot rankings. */
export const PROMPT_EVAL_VERSION = "prompt-answers-v1";
export type TrackedCompany = { name: string; aliases: string[] };
export type PromptJobConfig = {
  name: string;
  questions: string[];
  models: string[];
  repeats: number;
  concurrency: number;
  companies: TrackedCompany[];
  website?: { id: string; url: string; name: string };
};
export type PromptTrialStatus =
  | "planned"
  | "reserved"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "needs_attention";
export type PromptTrial = {
  id: string;
  questionIndex: number;
  model: string;
  repeat: number;
  status: PromptTrialStatus;
  sessionId: string | null;
  answer: string | null;
  error: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  completedAt: string | null;
};
export type PromptJob = {
  id: string;
  version: string;
  config: PromptJobConfig;
  status: "queued" | "running" | "paused" | "completed" | "needs_attention";
  createdAt: string;
  updatedAt: string;
  publication: "private" | "public";
  /** Explicit opt-in to the additional per-query public projection. */
  queryBreakdownPublished?: boolean;
  trials: PromptTrial[];
};
export type PromptJobSummary = Pick<
  PromptJob,
  "id" | "status" | "createdAt" | "updatedAt" | "publication"
> & { name: string; planned: number; completed: number; website?: PromptJobConfig["website"] };
export type PromptJobConnection = {
  configured: boolean;
  authorized: boolean;
  canRun: boolean;
  enabled: boolean;
  allowedModels: string[];
  maxConcurrency: number;
  remainingRuns: number;
  message: string;
};

/** Literal alias presence with Unicode word boundaries. No sentiment or endorsement claim. */
export function companyMentioned(
  answer: string,
  company: TrackedCompany,
): boolean {
  return [company.name, ...company.aliases].some((alias) => {
    const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return (
      escaped.length > 0 &&
      new RegExp(
        `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
        "iu",
      ).test(answer)
    );
  });
}
export function promptJobResults(job: PromptJob, questionIndex?: number) {
  return job.config.models.map((model) => {
    const trials = job.trials.filter((trial) => trial.model === model && (questionIndex === undefined || trial.questionIndex === questionIndex));
    const answered = trials.filter(
      (trial) => trial.status === "completed" && trial.answer !== null,
    );
    return {
      model,
      plannedAnswers: trials.length,
      completedAnswers: answered.length,
      failedAnswers: trials.filter((trial) =>
        ["failed", "cancelled"].includes(trial.status),
      ).length,
      unresolvedAnswers: trials.filter(
        (trial) => !["completed", "failed", "cancelled"].includes(trial.status) || (trial.status === "completed" && trial.answer === null),
      ).length,
      trackedCompanies: job.config.companies.map((company) => ({
        name: company.name,
        mentionedAnswers: answered.filter((trial) =>
          companyMentioned(trial.answer!, company),
        ).length,
        promptedQuestions: job.config.questions.filter((question, index) =>
          (questionIndex === undefined || index === questionIndex) && companyMentioned(question, company),
        ).length,
      })),
    };
  });
}
export type PromptQuestionResult = { questionIndex: number; models: ReturnType<typeof promptJobResults> };

export function promptQuestionResults(job: PromptJob): PromptQuestionResult[] {
  return job.config.questions.map((_, questionIndex) => ({ questionIndex, models: promptJobResults(job, questionIndex) }));
}

export type PublicPromptExperiment = {
  id: string;
  name: string;
  completedAt: string;
  questionCount: number;
  questions: string[];
  repeats: number;
  version: string;
  models: ReturnType<typeof promptJobResults>;
  questionResults?: PromptQuestionResult[];
};
export function publicPromptExperiment(job: PromptJob): PublicPromptExperiment {
  const completedAt =
    job.trials
      .map((trial) => trial.completedAt)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1) ?? job.createdAt;
  return {
    id: job.id,
    name: job.config.name,
    completedAt,
    questionCount: job.config.questions.length,
    questions: job.config.questions,
    repeats: job.config.repeats,
    version: job.version,
    models: promptJobResults(job),
    ...(job.queryBreakdownPublished ? { questionResults: promptQuestionResults(job) } : {}),
  };
}
