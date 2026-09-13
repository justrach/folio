import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy } from "wrangler";
import type { AgentsEnvironment } from "../src/lib/agents";
import { compareKeywordBenchmarkRuns, isKeywordBenchmarkId } from "../src/lib/keyword-benchmark-types";
import { keywordBenchmarkOverview, seedKeywordBenchmark, startKeywordBenchmark, reconcileKeywordBenchmark,
  cancelKeywordBenchmark, getKeywordBenchmarkRun, getKeywordBenchmarkSuite, listKeywordBenchmarkRuns,
  KeywordBenchmarkPersistenceError } from "../src/lib/keyword-benchmark-service";
import { KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2], args = process.argv.slice(3);
const options = new Map<string, string>();
const flags = new Set<string>();
const names = new Set(["owner-id", "template", "website-id", "case-id", "baseline-id", "run-id", "suite-id"]);
class BenchmarkCliUsageError extends Error {}
function help() {
  console.log("Usage: bun run benchmark <seed|start|reconcile|cancel|compare|status> --owner-id <existing-account-id> [options]\n"
    + "seed --template <template-id> [--website-id <owned-site-id>]\nstart --case-id <case-id> [--baseline-id <completed-baseline-id>] --confirm-spend [--wait]\n"
    + "reconcile|cancel --run-id <run-id>\ncompare --baseline-id <baseline-id> --run-id <fresh-id>\nstatus [--suite-id <suite-id>]\n"
    + "All operations use local Wrangler D1 only. Results are private files under .local/keyword-benchmarks. --wait enforces the saved task deadline with one reserved cancel request; this is not a guaranteed billing cap.");
}
async function privateOutput(value: unknown, label: string) {
  const directory = resolve(root, ".local/keyword-benchmarks");
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const path = resolve(directory, `${label}-${crypto.randomUUID()}.json`);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Private result saved: ${path}`);
}
function required(name: string) {
  const value = options.get(name);
  if (!value || !isKeywordBenchmarkId(value)) throw new BenchmarkCliUsageError(`Provide a valid --${name}.`);
  return value;
}
async function main() {
  if (!command || command === "--help") { help(); return; }
  if (!["seed", "start", "reconcile", "cancel", "compare", "status"].includes(command)) throw new BenchmarkCliUsageError("Unknown benchmark command.");
  for (let i = 0; i < args.length; i++) {
    if (["--confirm-spend", "--wait"].includes(args[i])) { flags.add(args[i].slice(2)); continue; }
    const name = args[i].startsWith("--") ? args[i].slice(2) : "";
    if (!names.has(name) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(name)) throw new BenchmarkCliUsageError("Invalid or duplicate benchmark option.");
    options.set(name, args[++i]);
  }
  const ownerId = required("owner-id");
  if (command === "start" && !flags.has("confirm-spend")) throw new BenchmarkCliUsageError("Starting a benchmark spends provider credits. Add --confirm-spend for this explicit start.");
  if (flags.has("wait") && command !== "start") throw new BenchmarkCliUsageError("--wait is supported with an explicit start only.");
  // Wrangler loads ignored server variables itself. Neither their values nor raw errors are printed.
  process.chdir(root);
  const proxy = await getPlatformProxy<AgentsEnvironment & { DB: D1Database }>({ configPath: resolve(root, "wrangler.jsonc"),
    persist: { path: resolve(root, ".wrangler/state/v3") }, remoteBindings: false });
  try {
    const { DB: db, ...env } = proxy.env;
    if (!(await db.prepare("SELECT id FROM user WHERE id=?").bind(ownerId).first())) throw new BenchmarkCliUsageError("The selected local account does not exist.");
    if (command === "seed") {
      await privateOutput(await seedKeywordBenchmark(db, ownerId, { templateId: required("template"), websiteId: options.get("website-id") }), "suite");
    } else if (command === "start") {
      let run = await startKeywordBenchmark(db, ownerId, { caseId: required("case-id"), kind: options.has("baseline-id") ? "fresh" : "baseline", baselineRunId: options.get("baseline-id") }, env);
      await privateOutput(run, "start");
      if (flags.has("wait")) {
        const stopAt = Date.parse(run.deadlineAt ?? run.createdAt) + 30_000;
        while (["queued", "running", "requires_action"].includes(run.status) && run.sessionId && Date.now() < stopAt) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          run = await reconcileKeywordBenchmark(db, ownerId, run.id, env);
        }
        // If creation consumed the wait window, still enforce its persisted deadline once.
        if (["queued", "running", "requires_action"].includes(run.status) && run.sessionId) run = await reconcileKeywordBenchmark(db, ownerId, run.id, env);
        await privateOutput(run, "result");
      }
      console.log(`Benchmark status: ${run.status}.`);
    } else if (command === "reconcile" || command === "cancel") {
      const run = await (command === "cancel" ? cancelKeywordBenchmark : reconcileKeywordBenchmark)(db, ownerId, required("run-id"), env);
      await privateOutput(run, command); console.log(`Benchmark status: ${run.status}.`);
    } else if (command === "compare") {
      const [before, after] = await Promise.all([getKeywordBenchmarkRun(db, ownerId, required("baseline-id")), getKeywordBenchmarkRun(db, ownerId, required("run-id"))]);
      if (!before || !after || after.baselineRunId !== before.id) throw new BenchmarkCliUsageError("Choose the saved baseline linked to this fresh run.");
      await privateOutput({ format: "folio-private-keyword-comparison-v1", before, after, comparison: compareKeywordBenchmarkRuns(before, after) }, "comparison");
    } else {
      const suiteId = options.get("suite-id");
      await privateOutput({ ...await keywordBenchmarkOverview(db, ownerId, env), ...(suiteId ? { suite: await getKeywordBenchmarkSuite(db, ownerId, suiteId) } : {}),
        runs: await listKeywordBenchmarkRuns(db, ownerId, { suiteId }) }, "status");
    }
  } catch (error) {
    if (error instanceof KeywordBenchmarkPersistenceError) { await privateOutput(error.run, "recovery"); console.error(error.message); process.exitCode = 1; }
    else throw error;
  } finally { await proxy.dispose(); }
}
main().catch(error => {
  console.error(error instanceof KeywordBenchmarkStoreError || error instanceof BenchmarkCliUsageError ? error.message : "Benchmark command could not complete. Check arguments, local migrations and account configuration; no automatic start retry was made.");
  process.exitCode = 1;
});
