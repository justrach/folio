import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { runCondensationSearchExperiment, type CondensationSearchReceipt } from "../src/lib/condensation-search-experiment";
import { CondensationReportError, renderCondensationReport } from "../src/lib/condensation-report";
import { normalizeScanUrl } from "../src/lib/scanner";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, ".local", "condensation-search");
export class ExperimentUsageError extends Error {}

export function parseCondensationSearchCli(argv: string[]) {
  const [command, ...args] = argv;
  if (!command || (command === "--help" && !args.length)) return { command: "help" as const };
  if (command !== "run" && command !== "inspect" && command !== "report") throw new ExperimentUsageError("Use run, inspect, report, or --help.");
  const options = new Map<string, string>();
  let confirmSpend = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === "--confirm-spend" && !confirmSpend) { confirmSpend = true; continue; }
    if (!["--id", "--query", "--website", "--model"].includes(name) || options.has(name) || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new ExperimentUsageError("Invalid or duplicate experiment option.");
    }
    options.set(name, args[++i]);
  }
  const id = options.get("--id");
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw new ExperimentUsageError("Provide --id using 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.");
  if (command === "inspect" || command === "report") {
    if (confirmSpend || options.size !== 1) throw new ExperimentUsageError(`${command} accepts only --id and never contacts a provider.`);
    if (command === "inspect") return { command: "inspect" as const, id };
    return { command: "report" as const, id };
  }
  let websiteUrl: string | undefined;
  if (options.has("--website")) {
    try {
      const url = normalizeScanUrl(options.get("--website")!);
      if (url.search) throw new Error("Query-bearing URL");
      websiteUrl = url.href;
    } catch { throw new ExperimentUsageError("Provide --website as a public HTTPS URL without credentials, query parameters or custom ports."); }
  }
  const query = options.get("--query")?.trim() ?? (websiteUrl ? "Evaluate the captured website's product clarity, audience, pricing clarity and technical HTML issues." : undefined);
  if (!query || query.length > 2_000) throw new ExperimentUsageError("Provide --query with 1–2000 characters, or --website for captured-page evaluation.");
  const model = options.get("--model") ?? "glm-5.3-flash";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(model)) throw new ExperimentUsageError("Provide a valid model identifier.");
  if (!confirmSpend) throw new ExperimentUsageError(websiteUrl
    ? "This sends captured public website evidence to Codegraff and spends model and sandbox credits. Add --confirm-spend to start."
    : "This sends your query to Codegraff and spends search, model and sandbox credits. Add --confirm-spend to start.");
  return { command, id, query, model, ...(websiteUrl ? { websiteUrl } : {}) } as const;
}

async function credentials() {
  let local: Record<string, string | undefined> = {};
  try { local = parseEnv(await readFile(join(ROOT, ".dev.vars"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ExperimentUsageError("Could not read local configuration; no provider request was made."); }
  const env = {
    CODEGRAFF_API_KEY: process.env.CODEGRAFF_API_KEY ?? local.CODEGRAFF_API_KEY,
  };
  if (!env.CODEGRAFF_API_KEY?.trim().startsWith("cg_sk_")) {
    throw new ExperimentUsageError("Configure CODEGRAFF_API_KEY in the environment or ignored .dev.vars. No provider request was made.");
  }
  return env;
}

async function main() {
  const input = parseCondensationSearchCli(process.argv.slice(2));
  if (input.command === "help") {
    console.log("Usage: bun run experiment:search run --id <new-local-id> --query <question> [--model <model>] --confirm-spend\n"
      + "       bun run experiment:search run --id <new-local-id> --website <public-https-url> [--query <focus>] [--model <model>] --confirm-spend\n"
      + "       bun run experiment:search inspect --id <existing-local-id>\n"
      + "       bun run experiment:search report --id <existing-local-id>\n"
      + "Runs host-side Codegraff search OR bounded same-site public HTML capture, then frozen-evidence analysis in a Codegraff gateway fleet sandbox.\n"
      + "Private receipts and reports live under .local/condensation-search/<id>/. Existing IDs are never relaunched.\n"
      + "Inspect and report are local-only. No OpenAI Agents session, production switch, or public publication occurs.");
    return;
  }
  const directory = join(OUTPUT, input.id);
  if (input.command === "inspect" || input.command === "report") {
    let receipt: unknown;
    try { receipt = JSON.parse(await readFile(join(directory, "receipt.json"), "utf8")) as unknown; }
    catch { throw new ExperimentUsageError("No readable receipt exists for that ID. Preserve its directory and reservation.json; do not relaunch uncertain work."); }
    if (input.command === "inspect") { console.log(JSON.stringify(receipt, null, 2)); return; }
    const report = renderCondensationReport(receipt);
    const path = join(directory, "report.md");
    try { await writeFile(path, report.markdown, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ExperimentUsageError("A private report already exists for this receipt; it was not overwritten.");
      throw new ExperimentUsageError("The private report could not be saved; no provider request was made.");
    }
    console.log(`Private ${report.completed ? "report" : "incomplete attempt summary"}: .local/condensation-search/${input.id}/report.md`);
    if (!report.completed) process.exitCode = 1;
    return;
  }
  const env = await credentials();
  await mkdir(OUTPUT, { recursive: true, mode: 0o700 });
  await chmod(OUTPUT, 0o700);
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ExperimentUsageError("This experiment ID already exists. Inspect it; rerunning or overwriting its evidence is refused.");
    throw error;
  }
  const requestId = crypto.randomUUID();
  await writeFile(join(directory, "reservation.json"), JSON.stringify({ requestId, query: input.query, model: input.model, ...(input.websiteUrl ? { websiteUrl: input.websiteUrl, mode: "host-website-frozen-evidence" } : { mode: "host-search-frozen-evidence" }), provider: "codegraff-gateway-fleet", createdAt: new Date().toISOString() }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const save = async (receipt: CondensationSearchReceipt) => {
    const pending = join(directory, "receipt.pending.json");
    await writeFile(pending, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
    await rename(pending, join(directory, "receipt.json"));
  };
  console.log(`Starting one paid ${input.websiteUrl ? "website" : "search"} experiment. Waiting for the sandbox agent and cleanup; this can take several minutes.`);
  const receipt = await runCondensationSearchExperiment({ query: input.query, ...(input.websiteUrl ? { websiteUrl: input.websiteUrl } : {}), model: input.model, requestId }, env, { save });
  console.log(`Private receipt: .local/condensation-search/${input.id}/receipt.json`);
  console.log(`Result: ${receipt.status}; cleanup: ${receipt.cleanup}; cost: unknown.`);
  if (receipt.status !== "completed" || receipt.cleanup !== "confirmed") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof ExperimentUsageError || error instanceof CondensationReportError ? error.message : "Experiment stopped. Preserve its local reservation and receipt: provider work or cleanup may be uncertain. No automatic retry was made.");
    process.exitCode = 1;
  });
}
