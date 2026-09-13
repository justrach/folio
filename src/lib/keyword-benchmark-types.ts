/** A baseline is a saved model observation, never an answer key or ground truth. */
export const KEYWORD_BENCHMARK_SURFACE = "openai-managed-agents" as const;
export const KEYWORD_BENCHMARK_QUERY_MAX_LENGTH = 2000;
export type KeywordSearchMode = "reviewed-domains" | "open-web";
/** Missing mode belongs to the original, bounded documentation research contract. */
export function keywordSearchMode(mode?: KeywordSearchMode): KeywordSearchMode {
  if (mode === undefined) return "reviewed-domains";
  if (mode === "reviewed-domains" || mode === "open-web") return mode;
  throw new Error("Invalid keyword search mode.");
}
export function isKeywordBenchmarkId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

export type KeywordBenchmarkCaseInput = {
  query: string;
  targetUrl: string | null;
  language: string;
  locale: string;
  rubricVersion: string;
  searchMode?: KeywordSearchMode;
  /** Private, independently supplied references. Never include these in model input. */
  referenceFacts?: { id: string; statement: string }[];
};
export type KeywordBenchmarkCase = KeywordBenchmarkCaseInput & {
  id: string; suiteId: string; revision: number; createdAt: string; updatedAt: string;
};
export type KeywordBenchmarkSuite = {
  id: string; name: string; description: string; createdAt: string; cases: KeywordBenchmarkCase[];
};
export type KeywordBenchmarkSuiteSummary = Omit<KeywordBenchmarkSuite, "cases"> & { caseCount: number };
export type KeywordBenchmarkExecution = {
  model: string;
  harnessVersion: string;
  environmentType: string;
  /** Stable digest of relevant sandbox configuration, without credentials. */
  environmentFingerprint: string;
};
export type KeywordBenchmarkAnswer = {
  text: string;
  mentions: { name: string; url: string | null; reason?: string; citationUrls?: string[] }[];
  citations: { url: string; title?: string; quote?: string }[];
  /** Optional deterministic checks; quoted URLs alone do not establish verification. */
  evidence?: { id: string; outcome: "passed" | "failed" | "unmeasured"; detail: string }[];
  limitations?: string[];
  /** Actual provider-returned evidence. Private export data; never trusted instructions. */
  collection?: KeywordCollectionEvidence;
};
export type KeywordCollectionEvidence = {
  format: "folio-keyword-collection-v1";
  searchMode: KeywordSearchMode;
  collectedAt: string;
  sessionId: string;
  rootTurnId: string;
  finalAnswerItemId: string;
  finalAnswerJson: string;
  searchItems: Record<string, unknown>[];
  validationItem: Record<string, unknown>;
};
export type KeywordBenchmarkUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};
export type KeywordBenchmarkStatus = "queued" | "running" | "requires_action" | "completed" | "failed" | "cancelled";
export type KeywordBenchmarkRun = KeywordBenchmarkExecution & {
  id: string;
  suiteId: string;
  caseId: string;
  kind: "baseline" | "fresh";
  baselineRunId: string | null;
  surface: typeof KEYWORD_BENCHMARK_SURFACE;
  publication: "private";
  case: KeywordBenchmarkCaseInput;
  status: KeywordBenchmarkStatus;
  sessionId: string | null;
  createAttemptAt: string | null;
  allowedDomains: string[];
  deadlineAt: string | null;
  cancelAttemptAt: string | null;
  cancelAcknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  answer: KeywordBenchmarkAnswer | null;
  usage: KeywordBenchmarkUsage;
  providerMetadata: { environmentId: string | null; requestId: string | null; turnId: string | null };
  error: string | null;
};
export type KeywordBenchmarkRunSummary = Omit<KeywordBenchmarkRun, "answer" | "case"> & {
  case: Omit<KeywordBenchmarkCaseInput, "referenceFacts">;
  answerCharacters: number; mentionCount: number; citationCount: number;
};
export type KeywordBenchmarkComparison = {
  comparable: boolean;
  reasons: string[];
  answerTextChanged: boolean | null;
  addedMentions: string[];
  removedMentions: string[];
  addedCitations: string[];
  removedCitations: string[];
};

/** Side-by-side observations are always available; changes are not causal scores. */
export function compareKeywordBenchmarkRuns(before: KeywordBenchmarkRun, after: KeywordBenchmarkRun): KeywordBenchmarkComparison {
  const reasons: string[] = [];
  if (keywordSearchMode(before.case.searchMode) !== keywordSearchMode(after.case.searchMode)) reasons.push("The search mode changed.");
  if (before.status !== "completed" || after.status !== "completed" || !before.answer || !after.answer)
    reasons.push("Both runs need completed answers.");
  for (const field of ["query", "targetUrl", "language", "locale", "rubricVersion"] as const)
    if (before.case[field] !== after.case[field]) reasons.push(`The ${field} changed.`);
  if (JSON.stringify(before.case.referenceFacts ?? []) !== JSON.stringify(after.case.referenceFacts ?? [])) reasons.push("The independent reference facts changed.");
  for (const field of ["surface", "model", "harnessVersion", "environmentType", "environmentFingerprint"] as const)
    if (before[field] !== after[field]) reasons.push(`The ${field} changed.`);
  const difference = (a: string[], b: string[]) => [...new Set(a)].filter(value => !new Set(b).has(value));
  const beforeMentions = before.answer?.mentions.map(value => value.name) ?? [];
  const afterMentions = after.answer?.mentions.map(value => value.name) ?? [];
  const beforeCitations = before.answer?.citations.map(value => value.url) ?? [];
  const afterCitations = after.answer?.citations.map(value => value.url) ?? [];
  const bothAnswers = Boolean(before.answer && after.answer);
  return {
    comparable: reasons.length === 0, reasons,
    answerTextChanged: before.answer && after.answer ? before.answer.text !== after.answer.text : null,
    addedMentions: bothAnswers ? difference(afterMentions, beforeMentions) : [], removedMentions: bothAnswers ? difference(beforeMentions, afterMentions) : [],
    addedCitations: bothAnswers ? difference(afterCitations, beforeCitations) : [], removedCitations: bothAnswers ? difference(beforeCitations, afterCitations) : [],
  };
}
