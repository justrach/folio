import type { KeywordBenchmarkAnswer, KeywordBenchmarkUsage } from "./keyword-benchmark-types";
import type { EvaluationRun } from "./evals";

export type AgentApiScope = "read" | "evaluate" | "seo";
export type AgentApiPrincipal = { ownerId: string; keyId: string; scopes: AgentApiScope[] };
export type AgentApiKeySummary = {
  id: string; name: string; prefix: string; scopes: AgentApiScope[];
  createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
export type AgentObservationKind = "website" | "keyword";
export type AgentObservationInput =
  | { kind: "website"; websiteId: string; maxAgeSeconds?: number }
  | { kind: "keyword"; caseId: string; maxAgeSeconds?: number; useSeoTools?: boolean };
export type AgentObservationRun = {
  id: string; kind: AgentObservationKind; status: EvaluationRun["status"]; model: string | null;
  surface: "openai-managed-agents"; createdAt: string; updatedAt: string; observedAt: string | null;
  result: EvaluationRun["result"] | KeywordBenchmarkAnswer;
  usage: EvaluationRun["usage"] | KeywordBenchmarkUsage; error: string | null; pollUrl: string;
  recovery: { runId: string; sessionId: string } | null;
  provenance: { searchMode: "reviewed-domains" | "open-web" | null; harnessVersion: string;
    environmentFingerprint: string | null; allowedDomains: string[]; completedSearchCount: number | null };
};
export type AgentObservation = {
  disposition: "saved" | "fresh_saved" | "existing_active" | "started" | "missing";
  freshness: { maxAgeSeconds: number; observedAt: string | null; ageSeconds: number | null; fresh: boolean };
  run: AgentObservationRun | null;
};
export type AgentObservationEnvelope = AgentObservation;
/** Server-only reservation guard. It never contains the bearer credential. */
export type AgentReservationGuard = { requestId: string; ownerId: string; runId: string };
