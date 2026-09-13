import { AgentApiError } from "./agent-api-key-store";
import type { AgentObservationInput, AgentObservationKind, AgentApiScope } from "./agent-observation-types";

export function onlyFields(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some(key => !allowed.includes(key)))
    throw new AgentApiError("The request contains an unsupported field.", 400, "invalid_request");
}
export function agentIdentifier(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value))
    throw new AgentApiError("Use a valid saved record ID.", 400, "invalid_request");
  return value;
}
export function agentObservationKind(value: unknown): AgentObservationKind {
  if (value !== "website" && value !== "keyword") throw new AgentApiError("Choose website or keyword observations.");
  return value;
}
export function agentMaxAge(value: unknown): number {
  if (value === undefined) return 86_400;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 604_800)
    throw new AgentApiError("maxAgeSeconds must be an integer from 0 to 604800.");
  return value;
}
export function parseAgentObservation(input: Record<string, unknown>): AgentObservationInput {
  const kind = agentObservationKind(input.kind);
  const maxAgeSeconds = agentMaxAge(input.maxAgeSeconds);
  onlyFields(input, ["kind", kind === "website" ? "websiteId" : "caseId", "maxAgeSeconds"]);
  return kind === "website" ? { kind, websiteId: agentIdentifier(input.websiteId), maxAgeSeconds } :
    { kind, caseId: agentIdentifier(input.caseId), maxAgeSeconds };
}
export function parseAgentQuery(url: string): Record<string, unknown> {
  const params = new URL(url).searchParams;
  const input: Record<string, unknown> = Object.create(null);
  for (const key of params.keys()) {
    if (params.getAll(key).length !== 1) throw new AgentApiError("Repeated query parameters are not supported.");
    const value = params.get(key)!;
    if (key === "maxAgeSeconds") {
      if (!/^\d+$/.test(value)) throw new AgentApiError("maxAgeSeconds must be an integer from 0 to 604800.");
      input[key] = Number(value);
    } else input[key] = value;
  }
  return input;
}
export function parseAgentKeyInput(input: Record<string, unknown>): { name: string; scopes: AgentApiScope[]; expiresInDays?: number } {
  onlyFields(input, ["name", "scopes", "expiresInDays"]);
  if (typeof input.name !== "string" || !Array.isArray(input.scopes) || input.scopes.some(scope => scope !== "read" && scope !== "evaluate") ||
    (input.expiresInDays !== undefined && typeof input.expiresInDays !== "number")) throw new AgentApiError("Use a name, read/evaluate scopes, and an optional key lifetime.");
  return { name: input.name, scopes: input.scopes as AgentApiScope[], ...(input.expiresInDays === undefined ? {} : { expiresInDays: input.expiresInDays as number }) };
}
