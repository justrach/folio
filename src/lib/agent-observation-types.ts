import type { KeywordBenchmarkAnswer, KeywordBenchmarkUsage } from "./keyword-benchmark-types";
import type { EvaluationRun } from "./evals";

/** `changes` records owner-visible website changes; it never spends or edits the website. */
export type AgentApiScope = "read" | "evaluate" | "seo" | "changes";
export const AGENT_API_SCOPES: readonly AgentApiScope[] = ["read", "evaluate", "seo", "changes"];
/** `organizations`: the organizations whose shared websites the key may read; null or absent means all of the owner's. */
export type AgentApiPrincipal = { ownerId: string; keyId: string; scopes: AgentApiScope[]; organizations?: string[] | null };
export type AgentApiKeySummary = {
  id: string; name: string; prefix: string; scopes: AgentApiScope[];
  /** Organization IDs the key is limited to; null means all of the owner's organizations. Own websites are always readable. */
  organizations?: string[] | null;
  /** "sign-in": an app the person approved on Folio's consent page (OAuth); it never held the key. "key": a key the person copied. */
  connection?: "key" | "sign-in";
  createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
/** Whether a key limited to `allowed` (null = all) may read what is shared in `organizationId`. */
export const keyReadsOrganization = (allowed: string[] | null | undefined, organizationId: string) => !allowed || allowed.includes(organizationId);
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
    environmentFingerprint: string | null; environmentType?: string | null; allowedDomains: string[]; completedSearchCount: number | null };
};
export type AgentObservation = {
  disposition: "saved" | "fresh_saved" | "existing_active" | "started" | "missing";
  freshness: { maxAgeSeconds: number; observedAt: string | null; ageSeconds: number | null; fresh: boolean };
  run: AgentObservationRun | null;
};
export type AgentObservationEnvelope = AgentObservation;
/** Server-only reservation guard. It never contains the bearer credential. */
export type AgentReservationGuard = { requestId: string; ownerId: string; runId: string };
