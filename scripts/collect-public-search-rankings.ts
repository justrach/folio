import { chmod, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy } from "wrangler";
import { isKeywordOpenWebModel } from "../src/lib/keyword-models";
import type { AgentsEnvironment } from "../src/lib/agents";
import { isKeywordBenchmarkId, keywordSearchMode, type KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkSuite, KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { getKeywordBenchmarkRun, listKeywordBenchmarkRuns, reconcileKeywordBenchmark, startKeywordBenchmark,
  KeywordBenchmarkPersistenceError } from "../src/lib/keyword-benchmark-service";
import type { PublicSearchQuery, PublicSearchRankings } from "../src/lib/public-search-rankings";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";
import { projectPublicSearchObservation, PublicCollectionUsageError } from "../src/lib/public-observation-projection";
export { projectPublicSearchObservation, PublicCollectionUsageError } from "../src/lib/public-observation-projection";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactPath = resolve(root, "src/data/public-search-rankings.json");
const suiteName = "Public search collection · v1";
const suiteDescription = "Private source evidence for explicit public search-observation exports. Saving or collecting does not publish an answer.";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const active = (run: KeywordBenchmarkRun) => ["queued", "running", "requires_action"].includes(run.status);

export function publicCollectionCaseId(ownerId: string, query: PublicSearchQuery) {
  return `public-search-${hash([ownerId, query.id, query.query, query.language, query.locale, "open-web", "keyword-observation-v1"]).slice(0, 48)}`;
}
function sameQuery(run: KeywordBenchmarkRun, query: PublicSearchQuery) {
  return run.case.query === query.query && run.case.language === query.language && run.case.locale === query.locale;
}
export function parsePublicCollectionCli(argv: string[]) {
  const command = argv[0];
  if (!command || command === "--help") return { command: "help", ownerId: "", queryId: undefined, runId: undefined, model: undefined, wait: false, publish: false };
  if (!["seed", "start", "reconcile", "status", "export"].includes(command)) throw new PublicCollectionUsageError("Unknown public collection command.");
  const values = new Map<string, string>(), flags = new Set<string>();
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (["--confirm-spend", "--wait", "--publish"].includes(key)) {
      if (flags.has(key)) throw new PublicCollectionUsageError("Duplicate command flag.");
      flags.add(key); continue;
    }
    if (!["--owner-id", "--query-id", "--run-id", "--model"].includes(key) || values.has(key) || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new PublicCollectionUsageError("Invalid or duplicate command option.");
    values.set(key, argv[++i]);
  }
  const ownerId = values.get("--owner-id") ?? "", queryId = values.get("--query-id"), runId = values.get("--run-id");
  if (!isKeywordBenchmarkId(ownerId)) throw new PublicCollectionUsageError("Provide a valid --owner-id for an existing local account.");
  if (command === "start" && (!queryId || !flags.has("--confirm-spend"))) throw new PublicCollectionUsageError("Select one --query-id and explicitly add --confirm-spend to start paid collection.");
  if (flags.has("--confirm-spend") && command !== "start") throw new PublicCollectionUsageError("--confirm-spend applies only to start.");
  if (flags.has("--wait") && !["start", "reconcile"].includes(command)) throw new PublicCollectionUsageError("--wait applies only to start or reconcile.");
  if (flags.has("--publish") && command !== "export") throw new PublicCollectionUsageError("Only export --publish may change the public artifact.");
  if (["reconcile", "export"].includes(command) && !isKeywordBenchmarkId(runId)) throw new PublicCollectionUsageError("Provide a valid saved --run-id.");
  if (runId && !["reconcile", "export"].includes(command)) throw new PublicCollectionUsageError("--run-id applies only to reconcile or export.");
  if (queryId && !["start", "status"].includes(command)) throw new PublicCollectionUsageError("--query-id applies only to start or status.");
  const model = values.get("--model");
  if (model !== undefined && (command !== "start" || !isKeywordOpenWebModel(model))) throw new PublicCollectionUsageError("Choose a supported --model only for an explicit start.");
  return { command, ownerId, queryId, runId, model, wait: flags.has("--wait"), publish: flags.has("--publish") };
}
async function readArtifact() {
  const value: unknown = JSON.parse(await readFile(artifactPath, "utf8")); assertPublicSearchRankings(value); return value;
}
async function privateOutput(value: unknown, label: string) {
  const directory = resolve(root, ".local/public-search-collections");
  await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
  const filename = resolve(directory, `${label}-${crypto.randomUUID()}.json`);
  await writeFile(filename, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(`Private result saved: ${filename}`);
}
/** Stable private case IDs make simultaneous seeding converge without another schema. */
export async function ensurePublicCollectionSuite(db: D1Database, ownerId: string, queries: PublicSearchQuery[]) {
  if (!queries.length || queries.length > 50) throw new PublicCollectionUsageError("The public query set must contain 1–50 reviewed queries.");
  const ids = queries.map(query => publicCollectionCaseId(ownerId, query));
  const existing = async () => {
    const row = await db.prepare("SELECT suite_id FROM keyword_benchmark_cases WHERE user_id=? AND id=?").bind(ownerId, ids[0]).first<{ suite_id: string }>();
    if (!row) return null;
    const suite = await getKeywordBenchmarkSuite(db, ownerId, row.suite_id);
    if (!suite || suite.name !== suiteName || suite.description !== suiteDescription || suite.cases.length !== queries.length
      || !queries.every((query, index) => suite.cases.some(value => value.id === ids[index] && value.query === query.query
        && value.language === query.language && value.locale === query.locale && value.targetUrl === null
        && !value.referenceFacts?.length && value.rubricVersion === "keyword-observation-v1" && keywordSearchMode(value.searchMode) === "open-web")))
      throw new PublicCollectionUsageError("The dedicated collection suite changed. Review the private source before starting another collection.");
    return suite;
  };
  const saved = await existing(); if (saved) return saved;
  try {
    return await createKeywordBenchmarkSuite(db, ownerId, { name: suiteName, description: suiteDescription,
      cases: queries.map((query, index) => ({ id: ids[index], query: query.query, targetUrl: null, language: query.language, locale: query.locale,
        rubricVersion: "keyword-observation-v1", searchMode: "open-web" })) });
  } catch (error) { const raced = await existing(); if (raced) return raced; throw error; }
}
async function checkedRun(db: D1Database, ownerId: string, runId: string, queries: PublicSearchQuery[]) {
  const run = await getKeywordBenchmarkRun(db, ownerId, runId);
  const query = run && queries.find(value => run.caseId === publicCollectionCaseId(ownerId, value) && sameQuery(run, value));
  if (!run || !query || run.case.targetUrl !== null || (run.case.referenceFacts?.length ?? 0) > 0 || keywordSearchMode(run.case.searchMode) !== "open-web")
    throw new PublicCollectionUsageError("Choose an owned run from this dedicated public-query collection.");
  return { run, query };
}
async function waitForRun(db: D1Database, ownerId: string, initial: KeywordBenchmarkRun, env: AgentsEnvironment) {
  let run = initial;
  const stopAt = Date.parse(run.deadlineAt ?? run.createdAt) + 30_000;
  while (active(run) && run.sessionId && Date.now() < stopAt) {
    await new Promise(resolveWait => setTimeout(resolveWait, 3000));
    run = await reconcileKeywordBenchmark(db, ownerId, run.id, env);
  }
  // The existing service durably reserves one deadline cancellation; acknowledgement is nonterminal.
  if (active(run) && run.sessionId) run = await reconcileKeywordBenchmark(db, ownerId, run.id, env);
  return run;
}
function help() {
  console.log("Usage: node --conditions=react-server --import tsx scripts/collect-public-search-rankings.ts <seed|start|reconcile|status|export> --owner-id <existing-local-account>\n"
    + "start --query-id <public-query-id> --confirm-spend [--model gpt-6-astra|gpt-6-sol|gpt-6-luna] [--wait]\nreconcile --run-id <saved-run-id> [--wait]\nstatus [--query-id <public-query-id>]\nexport --run-id <completed-run-id> [--publish]\n"
    + "Raw evidence stays private in local D1 and .local/public-search-collections. Export writes a private preview unless --publish is explicit. Only start creates a paid task; --wait retrieves it and enforces its saved deadline, not a guaranteed billing cap.");
}
async function main() {
  const options = parsePublicCollectionCli(process.argv.slice(2));
  if (options.command === "help") { help(); return; }
  const artifact = await readArtifact();
  const selected = options.queryId ? artifact.queries.find(value => value.id === options.queryId) : undefined;
  if (options.queryId && !selected) throw new PublicCollectionUsageError("Choose a query ID declared in the public artifact.");
  process.chdir(root);
  const proxy = await getPlatformProxy<AgentsEnvironment & { DB: D1Database }>({ configPath: resolve(root, "wrangler.jsonc"),
    persist: { path: resolve(root, ".wrangler/state/v3") }, remoteBindings: false });
  try {
    const { DB: db, ...env } = proxy.env;
    if (!(await db.prepare("SELECT id FROM user WHERE id=?").bind(options.ownerId).first())) throw new PublicCollectionUsageError("The selected local account does not exist.");
    if (options.command === "seed" || options.command === "start") {
      // Suites are bounded to fifty cases; a large index spans deterministic chunks.
      if (options.command === "seed") {
        for (let offset = 0; offset < artifact.queries.length; offset += 50)
          await privateOutput(await ensurePublicCollectionSuite(db, options.ownerId, artifact.queries.slice(offset, offset + 50)), "suite");
        return;
      }
      const offset = Math.floor(artifact.queries.findIndex(query => query.id === selected!.id) / 50) * 50;
      await ensurePublicCollectionSuite(db, options.ownerId, artifact.queries.slice(offset, offset + 50));
      let run = await startKeywordBenchmark(db, options.ownerId, { caseId: publicCollectionCaseId(options.ownerId, selected!), kind: "baseline", model: options.model }, env);
      await privateOutput(run, "start");
      if (options.wait) { run = await waitForRun(db, options.ownerId, run, env); await privateOutput(run, "result"); }
      console.log(`Collection status: ${run.status}.`); if (["failed", "cancelled", "requires_action"].includes(run.status)) process.exitCode = 2;
    } else if (options.command === "reconcile") {
      const saved = await checkedRun(db, options.ownerId, options.runId!, artifact.queries);
      let run = await reconcileKeywordBenchmark(db, options.ownerId, saved.run.id, env);
      if (options.wait) run = await waitForRun(db, options.ownerId, run, env);
      await privateOutput(run, "result"); console.log(`Collection status: ${run.status}.`);
      if (["failed", "cancelled", "requires_action"].includes(run.status)) process.exitCode = 2;
    } else if (options.command === "status") {
      const ids = new Set((selected ? [selected] : artifact.queries).map(query => publicCollectionCaseId(options.ownerId, query)));
      const runs = (await Promise.all([...ids].map(caseId => listKeywordBenchmarkRuns(db, options.ownerId, { caseId })))).flat();
      await privateOutput({ queryIds: (selected ? [selected] : artifact.queries).map(query => query.id), runs }, "status");
    } else {
      const { run, query } = await checkedRun(db, options.ownerId, options.runId!, artifact.queries);
      const observation = projectPublicSearchObservation(run, query, [options.ownerId, env.OPENAI_API_KEY ?? ""]);
      await privateOutput(observation, "public-preview");
      if (!options.publish) { console.log("Public preview saved. The public artifact is unchanged; export --publish explicitly to append this observation."); return; }
      // Serialize explicit exports; a crashed export leaves a visible lock for operator review.
      const lockPath = resolve(root, ".local/public-search-collections/publish.lock");
      let lock;
      try { lock = await open(lockPath, "wx", 0o600); }
      catch { throw new PublicCollectionUsageError("Another export holds the private publish lock. Check its process before retrying; nothing was published."); }
      try {
      const latest = await readArtifact();
      if (!latest.queries.some(value => JSON.stringify(value) === JSON.stringify(query))) throw new PublicCollectionUsageError("The public query changed during export. Nothing was published.");
      const duplicate = latest.observations.find(value => value.id === observation.id);
      if (duplicate && JSON.stringify(duplicate) !== JSON.stringify(observation)) throw new PublicCollectionUsageError("A conflicting public observation already exists. Nothing was published.");
      if (duplicate) { console.log("This sanitized observation is already in the public artifact."); return; }
      const next: PublicSearchRankings = { ...latest, observations: [...latest.observations, observation] }; assertPublicSearchRankings(next);
      const temporary = `${artifactPath}.${crypto.randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx", mode: 0o644 }); await rename(temporary, artifactPath); }
      finally { await rm(temporary, { force: true }); }
      console.log("Sanitized observation appended to src/data/public-search-rankings.json. No deployment was performed.");
      } finally { await lock.close(); await rm(lockPath, { force: true }); }
    }
  } catch (error) {
    if (error instanceof KeywordBenchmarkPersistenceError) { await privateOutput(error.run, "recovery"); throw new PublicCollectionUsageError("The provider receipt could not be saved. Keep the private recovery file and retrieve the same run; no replacement was started."); }
    throw error;
  } finally { await proxy.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error instanceof PublicCollectionUsageError || error instanceof KeywordBenchmarkStoreError ? error.message
    : "Collection command could not complete. Check the private saved state, arguments and local configuration. No automatic session retry was made.");
  process.exitCode = 1;
});
