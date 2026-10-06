/** Try lease token and attached serve URL against Codegraff /v1/search. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCondensationSandbox, deleteCondensationSandbox, runCondensationCommand } from "../src/lib/condensation-fleet";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RECEIPT = join(ROOT, ".local", "folio-fleet-search-diag.json");

async function loadEnv() {
  for (const line of (await readFile(join(ROOT, ".dev.vars"), "utf8")).split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
  const key = process.env.CONDENSATION_API_KEY?.trim();
  if (!key) throw new Error("missing CONDENSATION_API_KEY");
  return { CONDENSATION_API_KEY: key };
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

async function main() {
  const env = await loadEnv();
  const receipt = { requestId: crypto.randomUUID(), sandboxId: null as string | null };
  await mkdir(dirname(RECEIPT), { recursive: true });
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  const box = await createCondensationSandbox({ requestId: receipt.requestId, leaseSeconds: 180, name: "folio-search-diag2", codegraff: true }, env, { timeoutMs: 120_000 });
  receipt.sandboxId = box.id;
  await writeFile(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log("created", box.state, "serve", Boolean(box.codegraffBaseUrl));
  try {
    const command = [
      "python3 - <<'PY'",
      "import json, os, urllib.request",
      "from pathlib import Path",
      "token_path = Path('/root/.graff/token')",
      "print('token-exists', token_path.exists(), 'bytes', token_path.stat().st_size if token_path.exists() else 0)",
      "raw = token_path.read_text().strip() if token_path.exists() else ''",
      "print('token-kind', 'cg' if raw.startswith('cg_sk_') else 'cnd' if raw.startswith('cnd_sk_') else 'other', 'len', len(raw))",
      "print('graff-dir', ' '.join(p.name for p in Path('/root/.graff').iterdir()) if Path('/root/.graff').exists() else 'missing')",
      "keys = []",
      "if raw: keys.append(('graff-token', raw))",
      "harness = Path('/root/.simple-harness-codegraff.json')",
      "if harness.exists():",
      "    data = json.loads(harness.read_text())",
      "    if isinstance(data.get('api_key'), str): keys.append(('harness', data['api_key']))",
      "prov = os.environ.get('CONDENSATION_AGENT_PROVIDER','')",
      "if prov: keys.append(('provider', prov))",
      "urls = ['https://gateway.codegraff.com/v1/search']",
      "for source, key in keys:",
      "    for url in urls:",
      "        req = urllib.request.Request(url, data=json.dumps({'query':'terminal coding harness','numResults':3}).encode(), headers={'Authorization': f'Bearer {key}', 'Content-Type':'application/json', 'User-Agent':'Mozilla/5.0 FolioFleetTrial/1.0'}, method='POST')",
      "        try:",
      "            with urllib.request.urlopen(req, timeout=20) as res:",
      "                body = json.loads(res.read().decode())",
      "                n = len(body.get('results') or [])",
      "                print('ok', source, 'results', n)",
      "        except Exception as e:",
      "            print('fail', source, getattr(e,'status',None))",
      "PY",
    ].join("\n");
    const raw = stdoutOf(await runCondensationCommand(box.id, command, env, { timeoutMs: 40_000 }));
    console.log(raw.replace(/cnd_sk_[A-Za-z0-9]+/g, "cnd_sk_[redacted]").replace(/cg_sk_[A-Za-z0-9]+/g, "cg_sk_[redacted]").slice(0, 1500));
  } finally {
    await deleteCondensationSandbox(box.id, env, { timeoutMs: 30_000 });
    console.log("cleanup done");
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "unknown"); process.exit(1); });
