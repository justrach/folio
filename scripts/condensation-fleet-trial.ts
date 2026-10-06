/** Live Fleet + graff trial grounded in host-side Codegraff POST /v1/search. Key never enters the box command. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { condensationFleetPricing, createCondensationSandbox, deleteCondensationSandbox,
  getCondensationSandbox, runCondensationCommand, type CondensationSandbox } from "../src/lib/condensation-fleet";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = join(ROOT, ".local", "folio-fleet-glm53-search.json");
const ANSWER = join(ROOT, ".local", "folio-fleet-glm53-search-answer.json");
const SEARCH = join(ROOT, ".local", "folio-codegraff-search-results.json");
const QUERY = "Which coding harnesses support terminal workflows?";
const MODEL = "glm-5.3-flash";
const PROMPT = [
  "Research one user question using the Codegraff hosted search results already written to /tmp/folio-search.json.",
  `Question: ${QUERY}`,
  "Those results came from POST https://gateway.codegraff.com/v1/search. Do not query DuckDuckGo, Bing, Google, or any HTML search-engine results page.",
  "You may webfetch only URLs that already appear in /tmp/folio-search.json.",
  "Return only JSON with text, mentions (name, url, reason, citationUrls), citations (url, title), limitations, and search { provider, query, resultCount, resultUrls }.",
].join("\n");

type Receipt = {
  requestId: string; createdAt: string; sandboxId: string | null; state: string | null;
  codegraffAttached: boolean; search?: string; model?: string; query?: string;
  session?: string; answerChars?: number; mentions?: number; searchResults?: number; cleaned?: boolean; error?: string;
};

type SearchPayload = { provider: string; query: string; resultCount: number; hosts: string[]; results: unknown[] };

async function loadEnv() {
  const text = await readFile(join(ROOT, ".dev.vars"), "utf8");
  for (const line of text.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const condensation = process.env.CONDENSATION_API_KEY?.trim();
  const codegraff = process.env.CODEGRAFF_API_KEY?.trim();
  if (!condensation) throw new Error("CONDENSATION_API_KEY is missing from ignored .dev.vars.");
  if (!codegraff?.startsWith("cg_sk_")) throw new Error("CODEGRAFF_API_KEY is missing from ignored .dev.vars.");
  return { CONDENSATION_API_KEY: condensation, CODEGRAFF_API_KEY: codegraff };
}

async function save(receipt: Receipt) {
  await mkdir(dirname(RECEIPT), { recursive: true });
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
}

function mentions(text: string): number {
  try {
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const value = JSON.parse(json) as { mentions?: unknown[] };
    return Array.isArray(value.mentions) ? value.mentions.length : 0;
  } catch { return 0; }
}

function recordNumber(value: unknown, keys: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of keys) if (typeof row[key] === "number") return row[key];
  return null;
}

function stdoutOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (typeof row.stdout === "string") return row.stdout;
    if (typeof row.result === "string") return row.result;
  }
  return JSON.stringify(value);
}

async function execText(id: string, command: string, env: { CONDENSATION_API_KEY: string }, timeoutMs = 25_000): Promise<string> {
  return stdoutOf(await runCondensationCommand(id, command, env, { timeoutMs }));
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitRunning(id: string, env: { CONDENSATION_API_KEY: string }): Promise<CondensationSandbox> {
  for (let i = 0; i < 20; i++) {
    const box = await getCondensationSandbox(id, env, { timeoutMs: 30_000 });
    if (box.state === "running" || ["terminated", "failed"].includes(box.state)) return box;
    await sleep(3_000);
  }
  return getCondensationSandbox(id, env);
}

async function hostedSearch(key: string): Promise<SearchPayload> {
  try {
    const existing = JSON.parse(await readFile(SEARCH, "utf8")) as SearchPayload;
    if (existing.provider === "codegraff-gateway-v1-search" && existing.resultCount > 0 && existing.query === QUERY) return existing;
  } catch { /* search again */ }
  const response = await fetch("https://gateway.codegraff.com/v1/search", {
    method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 FolioFleetTrial/1.0" },
    body: JSON.stringify({ query: QUERY, numResults: 8, contents: { text: { maxCharacters: 800 } } }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Codegraff /v1/search returned HTTP ${response.status}.`);
  }
  const body = await response.json() as { results?: unknown[] };
  const rows = (body.results ?? []).filter(row => row && typeof row === "object") as Record<string, unknown>[];
  const results = rows.slice(0, 8).map(row => ({ title: row.title, url: row.url, text: String(row.text ?? "").slice(0, 800) }));
  const hosts = results.flatMap(row => typeof row.url === "string" && row.url.startsWith("http") ? [row.url.split("/")[2]] : []);
  const payload: SearchPayload = { provider: "codegraff-gateway-v1-search", query: QUERY, resultCount: results.length, hosts, results };
  await mkdir(dirname(SEARCH), { recursive: true });
  await writeFile(SEARCH, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

async function startDetached(id: string, prompt: string, env: { CONDENSATION_API_KEY: string }): Promise<void> {
  const write = [
    "python3 - <<'PY'",
    "from pathlib import Path",
    `Path('/tmp/folio-research.prompt').write_text(${JSON.stringify(prompt)})`,
    "Path('/tmp/folio-research.sh').write_text('#!/bin/sh\\ngraff --yolo --lean --model " + MODEL + " --max-model-calls 8 -p \"$(cat /tmp/folio-research.prompt)\"\\necho $? > /tmp/folio-research.exit\\n')",
    "print('wrote')",
    "PY",
  ].join("\n");
  await execText(id, write, env, 20_000);
  await execText(id, "chmod +x /tmp/folio-research.sh; rm -f /tmp/folio-research.exit /tmp/folio-research.out; nohup /bin/sh /tmp/folio-research.sh > /tmp/folio-research.out 2>&1 & echo started", env, 15_000);
}

async function pollDetached(id: string, env: { CONDENSATION_API_KEY: string }, maxMs: number): Promise<string> {
  const started = Date.now();
  let last = "";
  while (Date.now() - started < maxMs) {
    last = await execText(id, "if [ -f /tmp/folio-research.exit ]; then echo EXIT:$(cat /tmp/folio-research.exit); fi; wc -c /tmp/folio-research.out 2>/dev/null || echo 0; tail -c 4000 /tmp/folio-research.out 2>/dev/null || true", env, 20_000);
    if (/EXIT:\d+/.test(last)) return last;
    await sleep(5_000);
  }
  return last;
}

async function main() {
const env = await loadEnv();
const search = await hostedSearch(env.CODEGRAFF_API_KEY);
console.log("search-host", search.provider, `results=${search.resultCount}`, `hosts=${search.hosts.join(",") || "none"}`);

let receipt: Receipt;
try {
  receipt = JSON.parse(await readFile(RECEIPT, "utf8")) as Receipt;
  if (!receipt.requestId) throw new Error("empty");
  if (receipt.cleaned || receipt.state === "terminated" || receipt.state === "failed") throw new Error("settled");
  console.log("reusing saved requestId; will not mint a second create");
} catch {
  receipt = { requestId: crypto.randomUUID(), createdAt: new Date().toISOString(), sandboxId: null, state: null, codegraffAttached: true, model: MODEL, query: QUERY, searchResults: search.resultCount, search: `hosts=${search.hosts.join(",")}` };
  await save(receipt);
  console.log("persisted create reservation");
}

const pricing = await condensationFleetPricing(env);
console.log("pricing-read", recordNumber(pricing, ["hourlyUsd", "usdPerHour", "hourUsd"]) ?? "ok");

let box: CondensationSandbox;
if (receipt.sandboxId) {
  box = await waitRunning(receipt.sandboxId, env);
  console.log("reopened", box.state, "codegraff", Boolean(box.codegraffBaseUrl));
} else {
  box = await createCondensationSandbox({ requestId: receipt.requestId, leaseSeconds: 900, name: "folio-glm53-search", codegraff: true }, env, { timeoutMs: 120_000 });
  receipt.sandboxId = box.id; receipt.state = box.state; receipt.codegraffAttached = Boolean(box.codegraffBaseUrl);
  await save(receipt);
  console.log("created", box.state, "codegraff", Boolean(box.codegraffBaseUrl));
  if (box.state !== "running") box = await waitRunning(box.id, env);
}

try {
  if (box.state !== "running") throw new Error(`Sandbox is ${box.state}; not starting a replacement.`);
  const slim = {
    provider: search.provider, query: search.query, resultCount: search.resultCount, hosts: search.hosts,
    results: (search.results as { title?: unknown; url?: unknown; text?: unknown }[]).map(row => ({
      title: row.title, url: row.url, text: String(row.text ?? "").slice(0, 240),
    })),
  };
  const inject = ["python3 - <<'PY'", "from pathlib import Path", `Path('/tmp/folio-search.json').write_text(${JSON.stringify(JSON.stringify(slim))})`, "print('search-injected')", "PY"].join("\n");
  if (inject.length > 7_500) throw new Error("Search payload is too large for a fleet exec command.");
  await execText(box.id, inject, env, 20_000);
  await startDetached(box.id, PROMPT, env);
  const research = await pollDetached(box.id, env, 300_000);
  const text = research.replace(/^EXIT:\d+\n?/, "").replace(/^\s*\d+\s+\S+\n?/, "");
  receipt.session = "graff-codegraff-search"; receipt.answerChars = text.length; receipt.mentions = mentions(text); receipt.searchResults = search.resultCount;
  await writeFile(ANSWER, `${JSON.stringify({ model: MODEL, query: QUERY, path: "host-search-then-graff", search: { provider: search.provider, resultCount: search.resultCount, hosts: search.hosts }, text }, null, 2)}\n`);
  await save(receipt);
  console.log("glm-5.3-flash", /EXIT:0/.test(research) ? "ok" : "incomplete", `chars=${text.length}`, `mentions=${receipt.mentions}`);
} catch (error) {
  receipt.error = error instanceof Error ? error.message.slice(0, 400) : "unknown";
  await save(receipt);
  console.log("trial-error", receipt.error);
} finally {
  if (receipt.sandboxId) {
    await deleteCondensationSandbox(receipt.sandboxId, env, { timeoutMs: 30_000 });
    for (let i = 0; i < 8; i++) {
      const latest = await getCondensationSandbox(receipt.sandboxId, env).catch(() => null);
      if (!latest || ["terminated", "failed"].includes(latest.state)) { receipt.cleaned = true; receipt.state = latest?.state ?? "terminated"; break; }
      receipt.state = latest.state;
      await sleep(2_000);
    }
    await save(receipt);
    console.log("cleanup", receipt.cleaned ? receipt.state : "unconfirmed");
  }
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : "unknown"); process.exit(1); });
