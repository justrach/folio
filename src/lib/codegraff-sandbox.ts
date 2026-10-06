/** Codegraff gateway fleet sandboxes. Never falls back to the standard provider. */
export const CODEGRAFF_SANDBOX_API = "https://gateway.codegraff.com/v1/sandboxes";
export const CODEGRAFF_FLEET_LEASE_MINUTES = 15;
const MAX_BYTES = 1_000_000;

export type CodegraffSandboxEnvironment = { CODEGRAFF_API_KEY?: string };
export type CodegraffSandboxOptions = { fetcher?: typeof fetch; timeoutMs?: number };
export type CodegraffFleetSandbox = { id: string; state: string; requestId: string | null };
export type CodegraffSandboxCommand = { exitCode: number; result: string };

export class CodegraffSandboxError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_CONFIGURED" | "INVALID_INPUT" | "UPSTREAM_ERROR" | "INVALID_RESPONSE",
    readonly ambiguous = false,
    readonly status?: number,
    readonly requestId?: string | null,
    readonly sandboxId?: string | null,
  ) {
    super(message);
    this.name = "CodegraffSandboxError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function safeId(value: unknown): value is string {
  return typeof value === "string" && /^cnd_[A-Za-z0-9._-]{1,124}$/.test(value);
}

async function readSandboxJson(response: Response): Promise<unknown> {
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
  return JSON.parse(text);
}

async function sandboxRequest(
  path: string,
  env: CodegraffSandboxEnvironment,
  options: CodegraffSandboxOptions,
  method = "GET",
  body?: Record<string, unknown>,
  readOnly = false,
): Promise<{ value: unknown; requestId: string | null }> {
  const key = env.CODEGRAFF_API_KEY?.trim();
  if (!key?.startsWith("cg_sk_")) throw new CodegraffSandboxError("Configure the server Codegraff API key before using a gateway sandbox.", "NOT_CONFIGURED", false, 503);
  const mutation = method !== "GET" && !readOnly;
  let requestId: string | null = null;
  try {
    const response = await (options.fetcher ?? fetch)(`${CODEGRAFF_SANDBOX_API}${path}`, {
      method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const raw = response.headers.get("x-request-id");
    requestId = raw && /^[A-Za-z0-9_-]{1,128}$/.test(raw) ? raw : null;
    if (!response.ok) {
      let sandboxId: string | null = null;
      try {
        const value = await readSandboxJson(response);
        const error = record(value) && record(value.error) ? value.error : null;
        if (path === "" && method === "POST" && body?.codegraff === true && error?.type === "fleet_attach_failed" && safeId(error.sandboxId)) sandboxId = error.sandboxId;
      } catch { /* Preserve the HTTP status without exposing provider response text. */ }
      throw new CodegraffSandboxError(`Codegraff sandbox returned HTTP ${response.status}.`, "UPSTREAM_ERROR", mutation, response.status, requestId, sandboxId);
    }
    // DELETE has no documented response shape. Confirmation requires a subsequent GET.
    if (method === "DELETE" || response.status === 204) {
      await response.body?.cancel().catch(() => undefined);
      return { value: null, requestId };
    }
    return { value: await readSandboxJson(response), requestId };
  } catch (error) {
    if (error instanceof CodegraffSandboxError) throw error;
    throw new CodegraffSandboxError(
      mutation
        ? "The Codegraff sandbox mutation could not be confirmed. Preserve the local reservation; do not repeat it automatically."
        : "The Codegraff sandbox response could not be read within its time and size limits.",
      "INVALID_RESPONSE", mutation, undefined, requestId,
    );
  }
}

function sandbox(value: unknown, requestId: string | null, creation: boolean): CodegraffFleetSandbox {
  const id = record(value) && safeId(value.id) ? value.id : null;
  const state = record(value) && typeof value.state === "string" && value.state.length > 0 && value.state.length <= 40 ? value.state : null;
  if (!record(value) || !id || (!state && !creation) || (value.provider !== undefined && value.provider !== "fleet") ||
    (value.tier !== undefined && value.tier !== "ephemeral")) {
    throw new CodegraffSandboxError("Codegraff returned an unexpected fleet sandbox. Preserve the reservation for recovery.", "INVALID_RESPONSE", creation, undefined, requestId, id);
  }
  // Create documents an ID and spec, not a readiness guarantee; GET must confirm running.
  return { id, state: state ?? "unknown", requestId };
}

/** Caller MUST persist its local reservation before this POST. Gateway create idempotency is not documented. */
export async function createCodegraffFleetSandbox(
  input: { autoStopMinutes?: number; codegraff?: boolean },
  env: CodegraffSandboxEnvironment,
  options: CodegraffSandboxOptions = {},
): Promise<CodegraffFleetSandbox> {
  const autoStopMinutes = input.autoStopMinutes ?? CODEGRAFF_FLEET_LEASE_MINUTES;
  if (!Number.isInteger(autoStopMinutes) || autoStopMinutes < 1 || autoStopMinutes > 30) {
    throw new CodegraffSandboxError("Gateway fleet leases must be 1–30 minutes.", "INVALID_INPUT", false, 400);
  }
  if (input.codegraff !== undefined && typeof input.codegraff !== "boolean") {
    throw new CodegraffSandboxError("Graff attachment must be an explicit boolean.", "INVALID_INPUT", false, 400);
  }
  const result = await sandboxRequest("", env, options, "POST", {
    provider: "fleet", autoStopMinutes, ...(input.codegraff !== undefined ? { codegraff: input.codegraff } : {}),
  });
  const box = sandbox(result.value, result.requestId, true);
  if (input.codegraff) {
    const value = result.value as Record<string, unknown>;
    const attached = record(value.codegraff) ? value.codegraff : null;
    const expiresAt = value.expiresAt;
    if (!attached || attached.attached !== true || attached.scope !== "inference" || typeof expiresAt !== "number" ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || attached.expiresAt !== expiresAt ||
      attached.modelBaseUrl !== "https://gateway.codegraff.com" || attached.command !== "graff") {
      throw new CodegraffSandboxError("The gateway did not confirm lease-bound Graff model access. Guest analysis was not started.", "INVALID_RESPONSE", true, undefined, result.requestId, box.id);
    }
  }
  return box;
}

export async function getCodegraffFleetSandbox(id: string, env: CodegraffSandboxEnvironment, options: CodegraffSandboxOptions = {}): Promise<CodegraffFleetSandbox> {
  if (!safeId(id)) throw new CodegraffSandboxError("Invalid saved gateway fleet sandbox ID.", "INVALID_INPUT", false, 400);
  const result = await sandboxRequest(`/${id}`, env, options);
  const box = sandbox(result.value, result.requestId, false);
  if (box.id !== id) throw new CodegraffSandboxError("Codegraff returned a different sandbox ID.", "INVALID_RESPONSE");
  return box;
}

/** Fleet has no async exec API. Keep each synchronous command within the documented 60-second limit. */
export async function runCodegraffFleetCommand(
  id: string, command: string, env: CodegraffSandboxEnvironment, options: CodegraffSandboxOptions = {},
): Promise<CodegraffSandboxCommand> {
  if (!safeId(id) || typeof command !== "string" || !command.trim() || command.length > 8_000) {
    throw new CodegraffSandboxError("Invalid gateway fleet command.", "INVALID_INPUT", false, 400);
  }
  const { value, requestId } = await sandboxRequest(`/${id}/exec`, env, options, "POST", { command: command.trim(), timeoutSeconds: 15 });
  if (!record(value) || !Number.isSafeInteger(value.exitCode) || typeof value.result !== "string" || value.truncated === true) {
    throw new CodegraffSandboxError("Codegraff returned an incomplete command result. Do not repeat execution automatically.", "INVALID_RESPONSE", true, undefined, requestId, id);
  }
  return { exitCode: value.exitCode as number, result: value.result };
}

export async function downloadCodegraffFleetFile(
  id: string, path: string, env: CodegraffSandboxEnvironment, options: CodegraffSandboxOptions = {},
): Promise<{ contentBase64: string }> {
  if (!safeId(id) || typeof path !== "string" || !path.startsWith("/") || path.length > 1024 || /[\u0000-\u001f]/.test(path)) {
    throw new CodegraffSandboxError("Invalid gateway fleet download.", "INVALID_INPUT", false, 400);
  }
  const { value, requestId } = await sandboxRequest(`/${id}/download`, env, options, "POST", { path }, true);
  if (!record(value) || typeof value.contentBase64 !== "string") {
    throw new CodegraffSandboxError("Codegraff returned an invalid file download.", "INVALID_RESPONSE", false, undefined, requestId);
  }
  return { contentBase64: value.contentBase64 };
}

/** Ended fleet records remain readable. Only a later destroyed/error state confirms cleanup; 404 does not. */
export async function deleteCodegraffFleetSandbox(id: string, env: CodegraffSandboxEnvironment, options: CodegraffSandboxOptions = {}): Promise<void> {
  if (!safeId(id)) throw new CodegraffSandboxError("Invalid saved gateway fleet sandbox ID.", "INVALID_INPUT", false, 400);
  await sandboxRequest(`/${id}`, env, options, "DELETE");
}
