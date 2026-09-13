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
import { KeywordBenchmarkStoreError, previewKeywordBenchmarkHoldRelease, releaseKeywordBenchmarkHold } from "../src/lib/keyword-benchmark-store";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const names = new Set(["owner-id", "template", "website-id", "case-id", "baseline-id", "run-id", "suite-id", "revision"]);
export class BenchmarkCliUsageError extends Error {}
export function parseKeywordBenchmarkCli(argv: string[]) {
  const [command, ...args] = argv;
  const options = new Map<string, string>(), flags = new Set<string>();
  if (!command || command === "--help") return { command: "help", options, flags };
  if (!["seed", "start", "reconcile", "cancel", "compare", "status", "hold-preview", "release-hold"].includes(command)) throw new BenchmarkCliUsageError("Unknown benchmark command.");
  for (let i = 0; i < args.length; i++) {
    if (["--confirm-spend", "--wait", "--acknowledge-unknown-cost"].includes(args[i])) {
      const flag = args[i].slice(2);
      if (flags.has(flag)) throw new BenchmarkCliUsageError("Duplicate benchmark flag.");
      flags.add(flag); continue;
    }
    const name = args[i].startsWith("--") ? args[i].slice(2) : "";
    if (!names.has(name) || !args[i + 1] || args[i + 1].startsWith("--") || options.has(name)) throw new BenchmarkCliUsageError("Invalid or duplicate benchmark option.");
    options.set(name, args[++i]);
  }
  if (command === "start" && !flags.has("confirm-spend")) throw new BenchmarkCliUsageError("Starting a benchmark spends provider credits. Add --confirm-spend for this explicit start.");
  if (flags.has("confirm-spend") && command !== "start") throw new BenchmarkCliUsageError("--confirm-spend applies only to start.");
  if (flags.has("wait") && command !== "start") throw new BenchmarkCliUsageError("--wait is supported with an explicit start only.");
  if (flags.has("acknowledge-unknown-cost") && command !== "release-hold") throw new BenchmarkCliUsageError("Unknown-cost acknowledgement applies only to release-hold.");
  const holdCommand = command === "hold-preview" || command === "release-hold";
  if (holdCommand) {
    if ([...options.keys()].some(name => !["owner-id", "run-id", "revision"].includes(name))) throw new BenchmarkCliUsageError("Hold operations accept only owner, run and expected revision.");
    for (const name of ["owner-id", "run-id"]) if (!isKeywordBenchmarkId(options.get(name))) throw new BenchmarkCliUsageError(`Provide a valid --${name}.`);
    const revision = options.get("revision");
    if (!revision || !/^(0|[1-9][0-9]*)$/.test(revision) || !Number.isSafeInteger(Number(revision))) throw new BenchmarkCliUsageError("Provide the current nonnegative --revision from the saved run.");
    if (command === "release-hold" && !flags.has("acknowledge-unknown-cost")) throw new BenchmarkCliUsageError("Releasing a local hold leaves the provider outcome and cost unknown. Add --acknowledge-unknown-cost for this explicit release.");
  } else if (options.has("revision")) throw new BenchmarkCliUsageError("--revision applies only to hold operations.");
  return { command, options, flags };
}
function help() {
  console.log("Usage: bun run benchmark <seed|start|reconcile|cancel|compare|status|hold-preview|release-hold> --owner-id <existing-account-id> [options]\n"
    + "seed --template <template-id> [--website-id <owned-site-id>]\nstart --case-id <case-id> [--baseline-id <completed-baseline-id>] --confirm-spend [--wait]\n"
    + "reconcile|cancel --run-id <run-id>\ncompare --baseline-id <baseline-id> --run-id <fresh-id>\nstatus [--suite-id <suite-id>]\n"
    + "hold-preview --run-id <unknown-creation-run-id> --revision <current-revision>\nrelease-hold --run-id <same-run-id> --revision <reviewed-revision> --acknowledge-unknown-cost\n"
    + "Hold release permits different cases only. It does not cancel or retry the original task, resolve its cost, or reset its quota accounting.\n"
    + "All operations use local Wrangler D1 only. Results are private files under .local/keyword-benchmarks. --wait enforces the saved task deadline with one reserved cancel request; this is not a guaranteed billing cap.");
}
async function privateOutput(value: unknown, label: string) {
  const directory = resolve(root, ".local/keyword-benchmarks");
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const path = resolve(directory, `${label}-${crypto.randomUUID()}.json`);
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Private result saved: ${path}`);
}
function required(options: Map<string, string>, name: string) {
  const value = options.get(name);
  if (!value || !isKeywordBenchmarkId(value)) throw new BenchmarkCliUsageError(`Provide a valid --${name}.`);
  return value;
}
async function main() {
  const { command, options, flags } = parseKeywordBenchmarkCli(process.argv.slice(2));
  if (command === "help") { help(); return; }
  const ownerId = required(options, "owner-id");
  // Wrangler loads ignored server variables itself. Neither their values nor raw errors are printed.
  process.chdir(root);
  const proxy = await getPlatformProxy<AgentsEnvironment & { DB: D1Database }>({ configPath: resolve(root, "wrangler.jsonc"),
    persist: { path: resolve(root, ".wrangler/state/v3") }, remoteBindings: false });
  try {
    const { DB: db, ...env } = proxy.env;
    if (!(await db.prepare("SELECT id FROM user WHERE id=?").bind(ownerId).first())) throw new BenchmarkCliUsageError("The selected local account does not exist.");
    if (command === "hold-preview" || command === "release-hold") {
      const runId = required(options, "run-id"), revision = Number(options.get("revision"));
      const result = command === "hold-preview" ? await previewKeywordBenchmarkHoldRelease(db, ownerId, runId, revision)
        : await releaseKeywordBenchmarkHold(db, ownerId, runId, revision, { acknowledgeUnknownCost: true });
      await privateOutput(result, command);
      console.log(command === "hold-preview" ? "Preview saved. No state changed and no provider request was made."
        : "Local hold released for different cases only. The original provider outcome and cost remain unknown. No provider request was made.");
    } else if (command === "seed") {
      await privateOutput(await seedKeywordBenchmark(db, ownerId, { templateId: required(options, "template"), websiteId: options.get("website-id") }), "suite");
    } else if (command === "start") {
      let run = await startKeywordBenchmark(db, ownerId, { caseId: required(options, "case-id"), kind: options.has("baseline-id") ? "fresh" : "baseline", baselineRunId: options.get("baseline-id") }, env);
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
      const run = await (command === "cancel" ? cancelKeywordBenchmark : reconcileKeywordBenchmark)(db, ownerId, required(options, "run-id"), env);
      await privateOutput(run, command); console.log(`Benchmark status: ${run.status}.`);
    } else if (command === "compare") {
      const [before, after] = await Promise.all([getKeywordBenchmarkRun(db, ownerId, required(options, "baseline-id")), getKeywordBenchmarkRun(db, ownerId, required(options, "run-id"))]);
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
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof KeywordBenchmarkStoreError || error instanceof BenchmarkCliUsageError ? error.message : "Benchmark command could not complete. Check arguments, local migrations and account configuration; no automatic start retry was made.");
  process.exitCode = 1;
});
