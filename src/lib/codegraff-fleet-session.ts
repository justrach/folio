import type { CondensationFleetEnvironment, CondensationFleetOptions } from "./condensation-fleet";
import { CondensationFleetError } from "./condensation-fleet";

const SESSION = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_BYTES = 1_000_000;

export type CodegraffFleetTurn = {
  session: string;
  model: string;
  text: string;
  events: number;
  lastSeq: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function header(env: CondensationFleetEnvironment) {
  const key = env.CONDENSATION_API_KEY?.trim();
  if (!key) throw new CondensationFleetError("Configure the server Condensation API key before using Codegraff in the fleet box.", "NOT_CONFIGURED", false, 503);
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function readBody(response: Response, max = MAX_BYTES): Promise<string> {
  if (response.headers.get("content-type")?.includes("application/json") === false &&
    response.headers.get("content-type")?.includes("ndjson") === false &&
    response.headers.get("content-type")?.includes("text/") === false &&
    response.headers.get("content-type") != null) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("Unexpected media type");
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
      if (bytes > max) { await reader.cancel(); throw new Error("Oversized response"); }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

function eventText(value: unknown): string {
  if (!record(value)) return "";
  if (value.type === "text" && typeof value.text === "string") return value.text;
  if (value.type === "turn" && typeof value.text === "string") return value.text;
  if (typeof value.delta === "string") return value.delta;
  if (typeof value.content === "string") return value.content;
  return "";
}

function eventSeq(value: unknown, fallback: number): number {
  if (record(value) && typeof value.seq === "number" && Number.isSafeInteger(value.seq)) return value.seq;
  if (record(value) && typeof value.n === "number" && Number.isSafeInteger(value.n)) return value.n;
  return fallback;
}

/** Create or resume a named Codegraff conversation on an attached fleet box. Do not resend a prompt after a dropped stream. */
export async function runCodegraffFleetTurn(
  baseUrl: string,
  input: { session: string; prompt: string; model: string },
  env: CondensationFleetEnvironment,
  options: CondensationFleetOptions = {},
): Promise<CodegraffFleetTurn> {
  if (!/^https:\/\/[^\s]{1,400}$/.test(baseUrl) || !SESSION.test(input.session) || !input.prompt.trim() || input.prompt.length > 8_000 ||
    !/^[a-zA-Z0-9._-]{1,80}$/.test(input.model)) {
    throw new CondensationFleetError("Invalid Codegraff fleet session input.", "INVALID_INPUT", false, 400);
  }
  const origin = baseUrl.replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const headers = header(env);
  const open = await fetcher(`${origin}/v1/sessions`, {
    method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    headers, body: JSON.stringify({ session: input.session, model: input.model, yolo: true, maxModelCalls: 6 }),
  });
  if (!open.ok && open.status !== 409) {
    await open.body?.cancel().catch(() => undefined);
    throw new CondensationFleetError(`Codegraff fleet session returned HTTP ${open.status}.`, "UPSTREAM_ERROR", true, open.status);
  }
  const opened = await readBody(open).catch(() => "");
  let sessionId = input.session;
  try {
    const parsed = JSON.parse(opened) as unknown;
    if (record(parsed) && typeof parsed.session_id === "string" && SESSION.test(parsed.session_id)) sessionId = parsed.session_id;
  } catch { /* keep requested session name */ }
  let lastSeq = 0, events = 0, text = "", sent = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = sent ? `${origin}/v1/sessions/${encodeURIComponent(sessionId)}/events?from=${lastSeq}`
      : `${origin}/v1/sessions/${encodeURIComponent(sessionId)}`;
    const response = await fetcher(url, {
      method: sent ? "GET" : "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 130_000),
      headers, ...(sent ? {} : { body: JSON.stringify({ type: "user", content: input.prompt }) }),
    });
    if (!sent) sent = true;
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new CondensationFleetError(`Codegraff fleet turn returned HTTP ${response.status}.`, "UPSTREAM_ERROR", false, response.status);
    }
    const body = await readBody(response);
    const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    let finished = false;
    for (const line of lines) {
      let value: unknown = line;
      try { value = JSON.parse(line); } catch { /* keep raw line */ }
      events += 1;
      lastSeq = eventSeq(value, lastSeq + 1);
      const part = eventText(value);
      if (part) text += part;
      else if (typeof value === "string" && !value.startsWith("{")) text += value;
      if (record(value) && (value.type === "turn" || value.type === "done" || value.done === true)) finished = true;
    }
    if (finished || text.trim()) break;
  }
  if (!text.trim()) throw new CondensationFleetError("Codegraff finished without a retained answer. Do not resend the prompt.", "INVALID_RESPONSE", false);
  return { session: sessionId, model: input.model, text: text.slice(0, 50_000), events, lastSeq };
}

/** Status-only probe. Never logs the base URL. */
export async function probeCodegraffFleetServe(
  baseUrl: string,
  env: CondensationFleetEnvironment,
  options: CondensationFleetOptions = {},
): Promise<{ healthz: number; schema: number }> {
  if (!/^https:\/\/[^\s]{1,400}$/.test(baseUrl)) throw new CondensationFleetError("Invalid Codegraff fleet session input.", "INVALID_INPUT", false, 400);
  const origin = baseUrl.replace(/\/$/, "");
  const fetcher = options.fetcher ?? fetch;
  const headers = header(env);
  const healthz = await fetcher(`${origin}/healthz`, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
  await healthz.body?.cancel().catch(() => undefined);
  const schema = await fetcher(`${origin}/v1/schema`, { method: "GET", redirect: "manual", cache: "no-store", headers, signal: AbortSignal.timeout(options.timeoutMs ?? 15_000) });
  await schema.body?.cancel().catch(() => undefined);
  return { healthz: healthz.status, schema: schema.status };
}
