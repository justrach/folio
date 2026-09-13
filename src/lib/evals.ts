import type { EvaluationCheck } from "./evaluation";

/** Public contracts contain no database credentials, provider tokens or owner IDs. */
export const WEBSITE_EVAL_VERSION = "website-evidence-v1";
export const EVAL_SUITE = {
  id: "website-evidence",
  version: WEBSITE_EVAL_VERSION,
  name: "Website evidence review",
  description: "Can an agent read a captured website, extract supported facts, and return inspectable evidence?",
  tasks: [
    { id: "product-understanding", label: "Product understanding", description: "Compare the returned product name against a separately supplied reference answer when available." },
    { id: "pricing-extraction", label: "Pricing facts", description: "Check stated amount, currency and billing interval; abstain when no trusted price is available." },
    { id: "citation-integrity", label: "Source citations", description: "Resolve evidence IDs and match exact quoted text against the frozen captures." },
    { id: "readable-content", label: "Readable source", description: "Carry through the deterministic HTML readability observation, separately from model findings." },
  ],
  limitations: [
    "This suite measures extraction and evidence integrity on captured input, not search rank or real-world AI recommendation frequency.",
    "An exact quote verifies that text occurs in a source. It does not prove that the source is true or that the quote entails an explanation.",
    "Without reference answers supplied separately from the model, product and price correctness remain unmeasured.",
    "Hashes identify captured UTF-8 text, not raw network response bytes. They detect changed content; they are not a trusted timestamp or source signature.",
    "A repeated model run may produce different output. The verifier and frozen inputs are reproducible; model output is not guaranteed to be identical.",
  ],
} as const;

export type EvaluationStatus = "queued" | "running" | "requires_action" | "completed" | "failed" | "cancelled";
export type PricingFact = { amount: number; currency: string; interval: string };
export type ExpectedFacts = {
  source: "fixture" | "owner-confirmed";
  productName?: string;
  /** null explicitly means the independently checked source does not state a price. */
  pricing?: PricingFact | null;
};
export type EvidenceCapture = {
  id: string;
  url: string;
  capturedAt: string;
  content: string;
  sha256: string;
  hashEncoding?: "utf8-text-v1";
  kind: "page" | "technical-check" | "seo-report";
  transport?: "http" | "fixture";
  technicalChecks?: EvaluationCheck[];
};
export type EvaluationEvent = {
  id: string;
  at: string;
  type: "queued" | "capture" | "session" | "message" | "tool" | "verification" | "status" | "error";
  title: string;
  detail?: string;
  status?: "pending" | "running" | "completed" | "failed";
  data?: Record<string, unknown>;
};
export type EvaluationCitation = {
  field: "productName" | "pricing" | "finding";
  evidenceId: string;
  quote: string;
};
export type EvaluationFinding = {
  dimension: string;
  status: "supported" | "unmeasured";
  evidenceIds: string[];
  explanation: string;
  recommendation: string;
};
export type WebsiteAgentOutput = {
  summary: string;
  facts: { productName: string | null; pricing: PricingFact | null };
  citations: EvaluationCitation[];
  findings: EvaluationFinding[];
  missingEvidence: string[];
  publicationReady: false;
};
export type VerificationCheck = {
  id: string;
  label: string;
  status: "pass" | "fail" | "unmeasured";
  expected: string;
  actual: string;
  detail: string;
  evidenceIds: string[];
};
export type VerifiedEvaluation = {
  summary: string;
  checks: VerificationCheck[];
  passed: number;
  failed: number;
  unmeasured: number;
  measured: number;
  /** Percentage of measured verification checks passed. Never a website rank. */
  verificationScore: number | null;
  findings: EvaluationFinding[];
  citations: EvaluationCitation[];
  limitations: string[];
};
export type EvaluationRun = {
  id: string;
  targetUrl: string;
  siteName: string;
  suiteVersion: string;
  mode: "demo" | "live";
  status: EvaluationStatus;
  createdAt: string;
  updatedAt: string;
  sessionId: string | null;
  model: string | null;
  providerStatus?: string | null;
  captures: EvidenceCapture[];
  events: EvaluationEvent[];
  result: VerifiedEvaluation | null;
  error: string | null;
  usage: Record<string, unknown> | null;
  publication: "private";
  agentOutput?: unknown;
  expectedFacts?: ExpectedFacts;
  revision: number;
};

export function evaluationSummary(run: EvaluationRun) {
  return {
    id: run.id, targetUrl: run.targetUrl, siteName: run.siteName,
    suiteVersion: run.suiteVersion, mode: run.mode, status: run.status,
    createdAt: run.createdAt, updatedAt: run.updatedAt, model: run.model,
    sessionId: run.sessionId, providerStatus: run.providerStatus ?? null,
    preparationFailed: run.mode === "live" && run.status === "failed" && run.sessionId === null &&
      !run.events.some(event => event.id === "session-create-attempt" || event.id === "input-uncertain"),
    result: run.result, error: run.error, publication: run.publication,
    revision: run.revision,
  };
}
