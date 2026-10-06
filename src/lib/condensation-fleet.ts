/** Condensation own-fleet sandboxes. Distinct from OpenAI hosted environments and from the gateway `/v1/sandboxes` path. */
export const CONDENSATION_FLEET_API = "https://api.condensation.ai/v1/fleet";
export const CONDENSATION_FLEET_LEASE_SECONDS = 300;
const MAX_BYTES = 1_000_000;

export type CondensationFleetEnvironment = { CONDENSATION_API_KEY?: string };
export type CondensationFleetOptions = { fetcher?: typeof fetch; timeoutMs?: number };
export type CondensationSandbox = {
  id: string;
  state: string;
  requestId: string | null;
  codegraffBaseUrl: string | null;
};

export class CondensationFleetError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "INVALID_INPUT" | "UPSTREAM_ERROR" | "INVALID_RESPONSE",
    readonly ambiguous = false,
    readonly status?: number,
    readonly requestId?: string | null,
    readonly sandboxId?: string | null,
  ) {
    super(message);
    this.name = "CondensationFleetError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value) ? value : null;
}
function requestId(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function fleetHttpMessage(status: number, snippet: string): string {
  const clean = snippet
    .replace(/cnd_sk_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/cg_sk_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9+/=_-]{32,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const useful = clean.replace(/\[redacted\]/g, "").replace(/[^A-Za-z0-9 ._:-]/g, "").trim();
  if (useful.length < 4) return `Condensation fleet returned HTTP ${status}.`;
  return `Condensation fleet returned HTTP ${status}: ${clean}`;
}

export function condensationFleetConfigured(env: CondensationFleetEnvironment): boolean {
  return Boolean(env.CONDENSATION_API_KEY?.trim());
}

async function fleetRequest(
  path: string,
  env: CondensationFleetEnvironment,
  options: CondensationFleetOptions,
  body?: Record<string, unknown>,
  method?: string,
): Promise<{ value: unknown; requestId: string | null }> {
  const key = env.CONDENSATION_API_KEY?.trim();
  if (!key) throw new CondensationFleetError("Configure the server Condensation API key before using the fleet sandbox.", "NOT_CONFIGURED", false, 503);
  const verb = method ?? (body ? "POST" : "GET");
  let headerRequestId: string | null = null;
  try {
    const response = await (options.fetcher ?? fetch)(`${CONDENSATION_FLEET_API}${path}`, {
      method: verb, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = response.headers.get("x-request-id");
    headerRequestId = raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw) ? raw : null;
    if (!response.ok) {
      const snippet = await response.text().catch(() => "");
      throw new CondensationFleetError(fleetHttpMessage(response.status, snippet), "UPSTREAM_ERROR", Boolean(body) && verb !== "GET", response.status, headerRequestId);
    }
    if (response.status === 204) return { value: null, requestId: headerRequestId };
    if (response.headers.get("content-type")?.split(";")[0].trim() !== "application/json" || Number(response.headers.get("content-length")) > MAX_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("Invalid response size or media type");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response");
    const decoder = new TextDecoder();
    let text = "", bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("Oversized response"); }
        text += decoder.decode(part.value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    return { value: JSON.parse(text), requestId: headerRequestId };
  } catch (error) {
    if (error instanceof CondensationFleetError) throw error;
    throw new CondensationFleetError(
      body && verb !== "GET"
        ? "The Condensation fleet mutation could not be confirmed. A lease may exist; do not repeat it with a new request ID."
        : "The Condensation fleet response could not be read within its time and size limits.",
      "INVALID_RESPONSE", Boolean(body) && verb !== "GET", undefined, headerRequestId);
  }
}

function sandbox(value: unknown, headerRequestId: string | null, ambiguous: boolean): CondensationSandbox {
  const id = record(value) ? safeId(value.id) : null;
  const state = record(value) && typeof value.state === "string" && value.state.length <= 40 ? value.state : "";
  if (!record(value) || !id || !state) {
    throw new CondensationFleetError("Condensation returned an unexpected sandbox. Preserve the request ID for recovery.", "INVALID_RESPONSE", ambiguous, undefined, headerRequestId, id);
  }
  const attached = record(value.codegraff) ? value.codegraff : null;
  const codegraffBaseUrl = attached && typeof attached.baseUrl === "string" && /^https:\/\/[^\s]{1,400}$/.test(attached.baseUrl) ? attached.baseUrl : null;
  return { id, state, requestId: requestId(value.requestId) ?? headerRequestId, codegraffBaseUrl };
}

/** Read-only price quote. Creates no lease. */
export async function condensationFleetPricing(env: CondensationFleetEnvironment, options: CondensationFleetOptions = {}): Promise<unknown> {
  return (await fleetRequest("/pricing", env, options)).value;
}

/** Caller MUST persist requestId before this POST. Never retry with a different requestId. */
export async function createCondensationSandbox(
  input: { requestId: string; leaseSeconds?: number; name?: string; codegraff?: boolean },
  env: CondensationFleetEnvironment,
  options: CondensationFleetOptions = {},
): Promise<CondensationSandbox> {
  if (!requestId(input.requestId)) throw new CondensationFleetError("A UUID request ID is required to create a fleet sandbox.", "INVALID_INPUT", false, 400);
  const leaseSeconds = input.leaseSeconds ?? CONDENSATION_FLEET_LEASE_SECONDS;
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 1800) {
    throw new CondensationFleetError("Fleet leases must be 60–1800 seconds.", "INVALID_INPUT", false, 400);
  }
  if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.length > 120)) {
    throw new CondensationFleetError("Invalid sandbox name.", "INVALID_INPUT", false, 400);
  }
  const result = await fleetRequest("/sandboxes", env, options, {
    requestId: input.requestId, leaseSeconds, codegraff: input.codegraff !== false,
    ...(input.name ? { name: input.name.trim() } : {}),
  });
  return sandbox(result.value, result.requestId, true);
}

export async function getCondensationSandbox(id: string, env: CondensationFleetEnvironment, options: CondensationFleetOptions = {}): Promise<CondensationSandbox> {
  if (!safeId(id)) throw new CondensationFleetError("Invalid saved sandbox ID.", "INVALID_INPUT", false, 400);
  const result = await fleetRequest(`/sandboxes/${id}`, env, options);
  return sandbox(result.value, result.requestId, false);
}

export async function runCondensationCommand(
  id: string, command: string, env: CondensationFleetEnvironment, options: CondensationFleetOptions = {},
): Promise<unknown> {
  if (!safeId(id) || typeof command !== "string" || !command.trim() || command.length > 8_000) {
    throw new CondensationFleetError("Invalid sandbox command.", "INVALID_INPUT", false, 400);
  }
  return (await fleetRequest(`/sandboxes/${id}/exec`, env, options, { command: command.trim() })).value;
}

/** Delete is not proven until a later GET reaches terminated or failed. */
export async function deleteCondensationSandbox(id: string, env: CondensationFleetEnvironment, options: CondensationFleetOptions = {}): Promise<CondensationSandbox | null> {
  if (!safeId(id)) throw new CondensationFleetError("Invalid saved sandbox ID.", "INVALID_INPUT", false, 400);
  const result = await fleetRequest(`/sandboxes/${id}`, env, options, undefined, "DELETE");
  if (result.value == null) return null;
  return sandbox(result.value, result.requestId, true);
}
