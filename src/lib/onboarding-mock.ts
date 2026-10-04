export const SAMPLE_WEBSITE_URL = "https://codegraff.com/";
export const SAMPLE_BUSINESS_NAME = "Codegraff";

export const PREVIEW_DISCLAIMER =
  "No website is fetched, no results are measured, nothing is saved to an account. Refresh resets this preview.";

export type ClaimId = "description" | "audience" | "capabilities";

export const CLAIM_ORDER: ClaimId[] = ["description", "audience", "capabilities"];

export interface SampleClaim {
  id: ClaimId;
  label: string;
  text: string;
  sourceLabel: string;
  sourceExcerpt: string;
  sourceUrl: string;
}

const SOURCE_LABEL = "Mock source excerpt — not a real quote or capture";

export const SAMPLE_CLAIMS: Record<ClaimId, SampleClaim> = {
  description: {
    id: "description",
    label: "What the business does",
    text: "Codegraff builds tools for running coding agents and reviewing their work.",
    sourceLabel: SOURCE_LABEL,
    sourceExcerpt: "Tools for running coding agents and reviewing their work.",
    sourceUrl: SAMPLE_WEBSITE_URL,
  },
  audience: {
    id: "audience",
    label: "Who it is for",
    text: "Developers and teams using AI coding agents.",
    sourceLabel: SOURCE_LABEL,
    sourceExcerpt: "Built for developers and teams using coding agents.",
    sourceUrl: SAMPLE_WEBSITE_URL,
  },
  capabilities: {
    id: "capabilities",
    label: "What it offers",
    text: "A desktop workspace, a coding harness, local code intelligence, and hosted sandboxes.",
    sourceLabel: SOURCE_LABEL,
    sourceExcerpt: "Desktop workspace, coding harness, local code intelligence, hosted sandboxes.",
    sourceUrl: SAMPLE_WEBSITE_URL,
  },
};

export type ClaimStatus = "pending" | "accepted" | "rewritten" | "rejected" | "uncertain";

export interface ClaimDecision {
  status: ClaimStatus;
  revision?: string;
}

export type ClaimDecisions = Record<ClaimId, ClaimDecision>;

export function initialClaimDecisions(): ClaimDecisions {
  return {
    description: { status: "pending" },
    audience: { status: "pending" },
    capabilities: { status: "pending" },
  };
}

export function isSampleWebsite(normalizedUrl: string | undefined): boolean {
  return normalizedUrl === SAMPLE_WEBSITE_URL;
}

export function allClaimsDecided(decisions: ClaimDecisions): boolean {
  return CLAIM_ORDER.every((id) => decisions[id].status !== "pending");
}

export interface AssertedClaim {
  id: ClaimId;
  label: string;
  text: string;
  revised: boolean;
}

export function assertedClaims(decisions: ClaimDecisions, siteIsSample = true): AssertedClaim[] {
  const claims: AssertedClaim[] = [];
  for (const id of CLAIM_ORDER) {
    const decision = decisions[id];
    if (decision.status === "accepted" && siteIsSample) {
      claims.push({ id, label: SAMPLE_CLAIMS[id].label, text: SAMPLE_CLAIMS[id].text, revised: false });
    } else if (decision.status === "rewritten" && decision.revision) {
      claims.push({ id, label: SAMPLE_CLAIMS[id].label, text: decision.revision, revised: true });
    }
  }
  return claims;
}

export function rewriteError(text: string): string | null {
  return text.trim().length === 0 ? "Enter your own wording before using it." : null;
}

export const SAMPLE_COMPETITORS = ["Paseo", "Lanes Desktop"] as const;

export interface LineListResult {
  entries: string[];
  errors: string[];
}

export function parseLineList(
  raw: string,
  { maxEntries = 10, maxLength = 200 }: { maxEntries?: number; maxLength?: number } = {},
): LineListResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    if (value.length > maxLength) {
      errors.push(`“${value.slice(0, 40)}…” is longer than ${maxLength} characters.`);
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(value);
  }
  if (entries.length > maxEntries) {
    errors.push(`List is limited to ${maxEntries} entries; ${entries.length} were provided.`);
    return { entries: entries.slice(0, maxEntries), errors };
  }
  return { entries, errors };
}

export const OPEN_DISCOVERY_QUESTIONS = [
  "Which tools let developers run multiple coding agents in one workspace?",
  "Which tools give coding agents local repository context?",
] as const;

export const SAMPLE_ANSWERS: Record<string, string[]> = {
  [OPEN_DISCOVERY_QUESTIONS[0]]: ["Paseo", "Codegraff", "Lanes Desktop"],
  [OPEN_DISCOVERY_QUESTIONS[1]]: ["Codegraff", "Sample context tool"],
};

export const SAMPLE_TOPICS = [
  {
    id: "workspace",
    label: "Running coding agents together",
    question: "Which tools let developers run multiple coding agents in one workspace?",
    defaultSelected: true,
  },
  {
    id: "context",
    label: "Understanding an existing codebase",
    question: "Which tools give coding agents local repository context?",
    defaultSelected: true,
  },
  {
    id: "sandbox",
    label: "Running agents in isolated environments",
    question: "Which tools offer isolated environments for coding agents?",
    defaultSelected: false,
  },
] as const;

export type TopicOrigin = "sample" | "custom" | "keyword";

export interface DraftTopic {
  id: string;
  label: string;
  question: string;
  originalQuestion: string;
  selected: boolean;
  origin: TopicOrigin;
}

export function sampleTopicsAllowed(decisions: ClaimDecisions, siteIsSample: boolean): boolean {
  return siteIsSample && decisions.capabilities.status === "accepted";
}

export function customTopicQuestion(topic: string): string {
  return `Which tools are suitable for ${topic}?`;
}

export const keywordGoalQuestion = customTopicQuestion;

function topicKey(origin: TopicOrigin, key: string): string {
  return `${origin}:${key.toLowerCase()}`;
}

function topicSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "topic"
  );
}

function topicDomId(origin: TopicOrigin, label: string): string {
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return `${origin}-${topicSlug(label)}-${hash.toString(36)}`;
}

export function reconcileTopics(
  existing: DraftTopic[],
  parked: Map<string, DraftTopic>,
  {
    includeSample,
    customLabels,
    keywordGoals,
  }: { includeSample: boolean; customLabels: string[]; keywordGoals: string[] },
): { topics: DraftTopic[]; parked: Map<string, DraftTopic> } {
  const byKey = new Map(existing.map((t) => [topicKey(t.origin, t.origin === "sample" ? t.id : t.label), t]));
  const nextParked = new Map(parked);
  const topics: DraftTopic[] = [];
  const push = (topic: DraftTopic, key: string) => {
    const kept = byKey.get(key) ?? nextParked.get(key);
    if (kept) {
      nextParked.delete(key);
      topics.push({ ...kept, selected: kept.selected });
    } else {
      topics.push(topic);
    }
  };
  if (includeSample) {
    for (const topic of SAMPLE_TOPICS) {
      push(
        {
          id: `sample-${topic.id}`,
          label: topic.label,
          question: topic.question,
          originalQuestion: topic.question,
          selected: topic.defaultSelected,
          origin: "sample",
        },
        topicKey("sample", `sample-${topic.id}`),
      );
    }
  }
  customLabels.forEach((label) => {
    push(
      {
        id: topicDomId("custom", label),
        label,
        question: customTopicQuestion(label),
        originalQuestion: customTopicQuestion(label),
        selected: true,
        origin: "custom",
      },
      topicKey("custom", label),
    );
  });
  keywordGoals.forEach((goal) => {
    push(
      {
        id: topicDomId("keyword", goal),
        label: goal,
        question: keywordGoalQuestion(goal),
        originalQuestion: keywordGoalQuestion(goal),
        selected: true,
        origin: "keyword",
      },
      topicKey("keyword", goal),
    );
  });
  for (const topic of existing) {
    if (topic.origin !== "sample") continue;
    const key = topicKey("sample", topic.id);
    if (includeSample && topics.some((t) => t.id === topic.id)) continue;
    nextParked.set(key, topic);
  }
  return { topics, parked: nextParked };
}

export type QuestionMode = "open" | "named-comparison";

export function comparisonPrompt(questionText: string, competitors: string[]): string {
  if (competitors.length === 0) return questionText;
  return `${questionText} Compared against: ${competitors.join(", ")}.`;
}

export function sampleObservation(
  topic: DraftTopic,
  { siteIsSample, mode }: { siteIsSample: boolean; mode: QuestionMode },
): { positions: string[] } | null {
  if (!siteIsSample || mode !== "open") return null;
  if (topic.origin !== "sample" || topic.question !== topic.originalQuestion) return null;
  const positions = SAMPLE_ANSWERS[topic.question];
  return positions ? { positions } : null;
}

export function competitorPosition(name: string, positions: string[]): number | null {
  const index = positions.findIndex((entry) => entry.toLowerCase() === name.trim().toLowerCase());
  return index === -1 ? null : index + 1;
}

export const SAMPLE_TECHNICAL_SUMMARY = [
  { label: "Page title", detail: "Present in the mock page capture" },
  { label: "Canonical link", detail: "Present in the mock page capture" },
  { label: "Sitemap reference", detail: "Present in the mock page capture" },
] as const;

export const SAMPLE_AGENT_ACTION = {
  title: "Make the website’s identity clear",
  observation: "The mock page title names Graff while the mock opening introduces Harness.",
  recommendation:
    "Review the page title and opening together. Keep Codegraff as the business identity and explain the offering without assuming prior brand knowledge.",
  verification: "Check the rendered title and opening; then review the same saved question separately.",
} as const;

export const EXPORT_DISCLAIMER =
  "Illustrative onboarding sample. Not measured, not persisted, and not based on live retrieval.";

export interface OnboardingExport {
  mock: true;
  measured: false;
  persisted: false;
  disclaimer: string;
  websiteUrl: string | null;
  businessName: string;
  sampleWebsite: boolean;
  suggestions: Record<ClaimId, string>;
  claimDecisions: Record<ClaimId, { status: ClaimStatus; revision?: string; original: string }>;
  acceptedProfile: AssertedClaim[];
  topics: Array<{ label: string; question: string; origin: TopicOrigin; selected: boolean; edited: boolean }>;
  competitors: string[];
  keywordGoals: string[];
  agentActions: typeof SAMPLE_AGENT_ACTION[];
  questions: Array<{
    text: string;
    mode: QuestionMode;
    origin: TopicOrigin;
    edited: boolean;
    illustrativeFindings: string[] | null;
  }>;
}

export function buildOnboardingExport({
  websiteUrl,
  businessName,
  decisions,
  topics,
  competitors,
  keywordGoals,
  mode,
}: {
  websiteUrl: string | undefined;
  businessName: string;
  decisions: ClaimDecisions;
  topics: DraftTopic[];
  competitors: string[];
  keywordGoals: string[];
  mode: QuestionMode;
}): OnboardingExport {
  const siteIsSample = isSampleWebsite(websiteUrl);
  const claimDecisions = {} as OnboardingExport["claimDecisions"];
  for (const id of CLAIM_ORDER) {
    const decision = decisions[id];
    claimDecisions[id] = {
      status: decision.status,
      original: siteIsSample ? SAMPLE_CLAIMS[id].text : "",
      ...(decision.revision ? { revision: decision.revision } : {}),
    };
  }
  const selected = topics.filter((t) => t.selected && t.question.trim().length > 0);
  return {
    mock: true,
    measured: false,
    persisted: false,
    disclaimer: EXPORT_DISCLAIMER,
    websiteUrl: websiteUrl ?? null,
    businessName,
    sampleWebsite: siteIsSample,
    suggestions: Object.fromEntries(
      CLAIM_ORDER.map((id) => [id, siteIsSample ? SAMPLE_CLAIMS[id].text : ""]),
    ) as Record<ClaimId, string>,
    claimDecisions,
    acceptedProfile: assertedClaims(decisions, siteIsSample),
    topics: topics.map((t) => ({
      label: t.label,
      question: t.question,
      origin: t.origin,
      selected: t.selected,
      edited: t.question !== t.originalQuestion,
    })),
    competitors,
    keywordGoals,
    agentActions: siteIsSample ? [SAMPLE_AGENT_ACTION] : [],
    questions: selected.map((t) => ({
      text: t.question,
      mode,
      origin: t.origin,
      edited: t.question !== t.originalQuestion,
      illustrativeFindings: sampleObservation(t, { siteIsSample, mode })?.positions ?? null,
    })),
  };
}
