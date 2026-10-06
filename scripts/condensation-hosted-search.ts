/** Host-only Codegraff /v1/search across includeDomains. Never prints the key. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".local", "folio-codegraff-search-domains.json");
const QUERY = "Which coding harnesses support terminal workflows?";
const DOMAINS = [
  "code.claude.com",
  "developers.openai.com",
  "aider.chat",
  "opencode.ai",
  "codegraff.com",
  "github.com",
  "learn.chatgpt.com",
  "developers.google.com",
];

async function loadKey(): Promise<string> {
  for (const line of (await readFile(join(ROOT, ".dev.vars"), "utf8")).split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const key = process.env.CODEGRAFF_API_KEY?.trim();
  if (!key?.startsWith("cg_sk_")) throw new Error("CODEGRAFF_API_KEY is missing from ignored .dev.vars.");
  return key;
}

type Row = {
  domain: string; status: number; resultCount: number; hosts: string[]; titles: string[];
  urls: string[]; cost_micro_usd: number | null; error?: string;
};

async function searchDomain(key: string, domain: string): Promise<Row> {
  const response = await fetch("https://gateway.codegraff.com/v1/search", {
    method: "POST", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 FolioFleetTrial/1.0" },
    body: JSON.stringify({
      query: QUERY, numResults: 5, includeDomains: [domain],
      contents: { text: { maxCharacters: 400 } },
    }),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { domain, status: response.status, resultCount: 0, hosts: [], titles: [], urls: [], cost_micro_usd: null, error: `HTTP ${response.status}` };
  }
  const body = await response.json() as { results?: unknown[]; codegraff_usage?: { cost_micro_usd?: number } };
  const results = (body.results ?? []).filter(row => row && typeof row === "object") as { title?: unknown; url?: unknown }[];
  const urls = results.flatMap(row => typeof row.url === "string" && row.url.startsWith("http") ? [row.url] : []);
  return {
    domain, status: response.status, resultCount: results.length,
    hosts: [...new Set(urls.map(url => new URL(url).host))],
    titles: results.map(row => typeof row.title === "string" ? row.title : "").filter(Boolean).slice(0, 5),
    urls: urls.slice(0, 5),
    cost_micro_usd: typeof body.codegraff_usage?.cost_micro_usd === "number" ? body.codegraff_usage.cost_micro_usd : null,
  };
}

async function main() {
  const key = await loadKey();
  const rows: Row[] = [];
  for (const domain of DOMAINS) {
    const row = await searchDomain(key, domain);
    rows.push(row);
    console.log(domain, `status=${row.status}`, `results=${row.resultCount}`, `hosts=${row.hosts.join(",") || "none"}`, `cost_micro_usd=${row.cost_micro_usd ?? "unknown"}`);
    if (row.status === 402) {
      console.log("stopped-insufficient-credits");
      break;
    }
  }
  const total = rows.reduce((sum, row) => sum + (row.cost_micro_usd ?? 0), 0);
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ provider: "codegraff-gateway-v1-search", query: QUERY, searches: rows, total_cost_micro_usd: total }, null, 2)}\n`);
  console.log("batch", `searches=${rows.length}`, `total_cost_micro_usd=${total}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "unknown"); process.exit(1); });
