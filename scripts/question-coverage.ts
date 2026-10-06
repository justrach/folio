import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseEnv } from "node:util";
import {
  CODING_QUESTION_IDS, QUESTION_COVERAGE_BANK, prepareQuestionCoverage,
  renderQuestionCoverageReport, reviewQuestionCoverage, validateQuestionCoveragePlan, validateQuestionCoverageResult,
  type CoveragePlan, type CoverageResult,
} from "../src/lib/question-coverage";
import { PUBLIC_SEARCH_RANKINGS } from "../src/lib/public-search-rankings";
import { assertPublicQuestionCoverage, type PublicQuestionCoverage } from "../src/lib/public-question-coverage";
import { indexCoverageCatalog, prepareIndexQuestionCoverage, projectIndexQuestionCoverage, validateIndexCoveragePlan, type IndexCoveragePlan } from "../src/lib/index-question-coverage";

const MAX_BYTES = 2 * 1024 * 1024;
class CoverageUsageError extends Error {}
const fail = (message: string): never => { throw new CoverageUsageError(message); };

function parse(argv: string[]) {
  const [command = "--help", ...args] = argv;
  if (command === "--help" && !args.length) return { command: "help" } as const;
  if (command === "list" && !args.length) return { command: "list" } as const;
  if (command !== "plan" && command !== "run" && command !== "report" && command !== "preview" && command !== "publish") return fail("Use list, plan, run, report, preview, publish, or --help.");
  const options = new Map<string, string[]>();
  let confirmSpend = false, confirmPublish = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === "--confirm-spend" && command === "run" && !confirmSpend) { confirmSpend = true; continue; }
    if (name === "--confirm-publish" && command === "publish" && !confirmPublish) { confirmPublish = true; continue; }
    const allowed = command === "plan" ? ["--id", "--receipt", "--question", "--model", "--observation", "--position", "--rankings"] : command === "publish" ? ["--id", "--review-sha256"] : ["--id"];
    if (!allowed.includes(name) || !args[i + 1] || args[i + 1].startsWith("--") ||
        (options.has(name) && name !== "--receipt" && name !== "--question" && name !== "--position")) return fail("Invalid or duplicate coverage option.");
    options.set(name, [...(options.get(name) ?? []), args[++i]]);
  }
  const id = options.get("--id")?.[0];
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) return fail("Provide --id using 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.");
  const receipts = options.get("--receipt") ?? [];
  if (command === "plan" && (receipts.length < 1 || receipts.length > 2)) return fail("Provide one or two --receipt paths.");
  const model = options.get("--model")?.[0];
  if (model !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(model)) return fail("Provide a valid model identifier.");
  const observation = options.get("--observation")?.[0], positions = options.get("--position") ?? [];
  if (command === "plan" && (observation || positions.length || options.has("--rankings"))) {
    if (!observation || !positions.length || positions.length > 2 || options.has("--question") || positions.some(value => !/^[1-9][0-9]{0,3}$/.test(value))) return fail("Index plans require --observation and one or two --position values, without draft --question options.");
  }
  return { command, id, receipts, questions: options.get("--question") ?? CODING_QUESTION_IDS, model, confirmSpend, confirmPublish,
    observation, positions: positions.map(Number), rankings: options.get("--rankings")?.[0], reviewHash: options.get("--review-sha256")?.[0] } as const;
}

function contained(root: string, path: string) {
  const part = relative(root, path);
  if (isAbsolute(part) || part === ".." || part.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) fail("Paths must remain inside the current working directory.");
}

async function readBounded(root: string, path: string) {
  const absolute = resolve(root, path);
  contained(root, absolute);
  const actual = await realpath(absolute);
  contained(root, actual);
  const file = await open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_BYTES) return fail("Input must be a regular file no larger than 2 MB.");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await file.read(buffer, size, buffer.length - size, null);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size > MAX_BYTES) return fail("Input must be no larger than 2 MB.");
    return buffer.subarray(0, size).toString("utf8");
  } finally { await file.close(); }
}

async function artifactDirectory(root: string, id: string, create: boolean) {
  let directory = root;
  for (const part of [".local", "question-coverage", id]) {
    directory = join(directory, part);
    if (create) {
      try { await mkdir(directory, { mode: 0o700 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (part === id) return fail("This plan ID already exists; no files were overwritten.");
      }
    }
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail("Artifact directories must not be symlinks.");
    contained(root, await realpath(directory));
  }
  return directory;
}

async function save(root: string, directory: string, name: string, value: unknown, markdown = false) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return fail("Unsafe artifact directory.");
  contained(root, await realpath(directory));
  await writeFile(join(directory, name), markdown ? String(value) : JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

async function credentials(root: string) {
  let key = process.env.TYPESAFE_API_KEY;
  if (!key?.trim()) {
    try { key = parseEnv(await readBounded(root, ".dev.vars")).TYPESAFE_API_KEY; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") return fail("Could not read local configuration; no inference was made."); }
  }
  if (!key?.trim()) return fail("Configure a nonempty TYPESAFE_API_KEY; no inference was made.");
  return key;
}

function validResult(value: unknown, plan: CoveragePlan) {
  try { return validateQuestionCoverageResult(value, plan); }
  catch { return fail("Invalid coverage result."); }
}

async function main() {
  const input = parse(process.argv.slice(2));
  if (input.command === "help") {
    console.log("Usage: bun run index:questions list\n"
      + "       bun run index:questions plan --id <new-id> --receipt <path> [--receipt <path>] [--question <bank-id>] [--model <model>]\n"
      + "       bun run index:questions run --id <existing-id> --confirm-spend\n"
      + "       bun run index:questions report --id <existing-id>\n"
      + "       bun run index:questions plan --id <new-id> --observation <public-observation-id> --position <returned-position> --receipt <path> [--rankings <public-snapshot>]\n"
      + "       bun run index:questions preview --id <completed-index-plan>\n"
      + "       bun run index:questions publish --id <completed-index-plan> --confirm-publish --review-sha256 <preview-hash>\n"
      + "Only run contacts the provider. Private artifacts: .local/question-coverage/<id>/. Reservations are never retried or overwritten.");
    return;
  }
  if (input.command === "list") { console.log(JSON.stringify(QUESTION_COVERAGE_BANK, null, 2)); return; }
  const root = await realpath(process.cwd());
  if (input.command === "plan") {
    const evidences: unknown[] = [];
    for (const path of input.receipts) {
      const receipt = JSON.parse(await readBounded(root, path));
      evidences.push(receipt.website);
    }
    const rankings = input.rankings ? JSON.parse(await readBounded(root, input.rankings)) : PUBLIC_SEARCH_RANKINGS;
    const plan = input.observation ? prepareIndexQuestionCoverage(rankings, input.observation, input.positions, evidences, input.model)
      : prepareQuestionCoverage(evidences, input.questions, input.model);
    const directory = await artifactDirectory(root, input.id, true);
    await save(root, directory, "plan.json", plan);
    const index = "coverage" in plan ? plan : undefined;
    await save(root, directory, "plan.md", renderQuestionCoverageReport(index ? index.coverage : plan as CoveragePlan, undefined, index && indexCoverageCatalog(index)), true);
    console.log(`Prepared private plan: .local/question-coverage/${input.id}/plan.json`);
    return;
  }
  const directory = await artifactDirectory(root, input.id, false);
  const frozen = JSON.parse(await readBounded(root, join(directory, "plan.json")));
  const index: IndexCoveragePlan | undefined = frozen.format === "folio-index-question-coverage-plan-v1" ? validateIndexCoveragePlan(frozen) : undefined;
  const catalog = index && indexCoverageCatalog(index);
  const plan = index ? index.coverage : validateQuestionCoveragePlan(frozen);
  if (input.command === "preview" || input.command === "publish") {
    if (!index) return fail("Public previews require a plan linked to an existing index observation.");
    const result = JSON.parse(await readBounded(root, join(directory, "result.json")));
    const outcome = JSON.parse(await readBounded(root, join(directory, "outcome.json")));
    if (outcome.status !== "completed") return fail("Only a completed saved coverage result can be previewed.");
    const projection = projectIndexQuestionCoverage(index, result, outcome.evaluatedAt);
    const text = JSON.stringify(projection, null, 2) + "\n";
    const reviewHash = createHash("sha256").update(text).digest("hex");
    if (input.command === "preview") {
      process.stdout.write(text);
      console.error(`Review this exact public projection. SHA-256: ${reviewHash}. Nothing has been published.`);
      return;
    }
    if (!input.confirmPublish || input.reviewHash !== reviewHash) return fail("Publication requires --confirm-publish and the exact preview --review-sha256.");
    const path = "src/data/public-question-coverage.json";
    const current: unknown = JSON.parse(await readBounded(root, path));
    // Exact frozen wording and search provenance must still match the publication.
    if (!index.rankings.queries.every(query => isDeepStrictEqual(query, PUBLIC_SEARCH_RANKINGS.queries.find(item => item.id === query.id))) ||
        !index.rankings.observations.every(observation => isDeepStrictEqual(observation, PUBLIC_SEARCH_RANKINGS.observations.find(item => item.id === observation.id)))) return fail("The frozen question/observation is not in the current checked-in index. Publish its matching public observation first.");
    assertPublicQuestionCoverage(projection, PUBLIC_SEARCH_RANKINGS);
    assertPublicQuestionCoverage(current, PUBLIC_SEARCH_RANKINGS);
    const keys = new Set(projection.records.map(record => `${record.observationId}:${record.position}`));
    const merged: PublicQuestionCoverage = { format: projection.format, records: [...current.records.filter(record => !keys.has(`${record.observationId}:${record.position}`)), ...projection.records] };
    assertPublicQuestionCoverage(merged, PUBLIC_SEARCH_RANKINGS);
    const handle = await open(resolve(root, path), constants.O_WRONLY | constants.O_NOFOLLOW);
    try { await handle.writeFile(JSON.stringify(merged, null, 2) + "\n"); await handle.truncate(Buffer.byteLength(JSON.stringify(merged, null, 2) + "\n")); } finally { await handle.close(); }
    console.log("Updated the local public index coverage artifact. No commit, deployment or provider call was made.");
    return;
  }
  if (input.command === "report") {
    let result: CoverageResult | undefined;
    try { result = validateQuestionCoverageResult(JSON.parse(await readBounded(root, join(directory, "result.json"))), plan, catalog); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    process.stdout.write(renderQuestionCoverageReport(plan, result, catalog));
    return;
  }
  if (!input.confirmSpend) return fail("Add --confirm-spend to authorize one paid inference.");
  // A reservation of any state blocks a second inference, even if no result was saved.
  try { await lstat(join(directory, "reservation.json")); return fail("A reservation already exists; retry is refused. Preserve all artifacts."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const key = await credentials(root);
  await save(root, directory, "reservation.json", { status: "pending", requestSha256: plan.requestSha256, model: plan.request.model, costUsd: null });
  const started = performance.now();
  try {
    // Review the exact frozen provider body immediately before dispatch. The validated
    // parent plan constructs state solely from public HTTPS page text, not receipt metadata.
    const body = JSON.stringify(plan.request);
    if (body.includes(key) || body.includes(JSON.stringify(key).slice(1, -1))) fail("Outbound request contains the configured credential; inference was refused.");
    const result = validateQuestionCoverageResult(await reviewQuestionCoverage(plan, key, catalog), plan, catalog);
    await save(root, directory, "result.json", result);
    await save(root, directory, "report.md", renderQuestionCoverageReport(plan, result, catalog), true);
    await save(root, directory, "outcome.json", { status: "completed", evaluatedAt: new Date().toISOString(), latencyMs: performance.now() - started, model: result.model, usage: result.usage, costUsd: null });
    console.log(`Completed private coverage: .local/question-coverage/${input.id}/report.md; dollar cost unknown.`);
  } catch {
    // The immutable pending reservation survives interruptions and all persistence failures.
    try { await save(root, directory, "outcome.json", { status: "needs_attention", latencyMs: performance.now() - started, model: plan.request.model, usage: null, costUsd: null }); } catch { /* Preserve pending/unknown. */ }
    fail("Inference or persistence stopped after reservation; cost is unknown. Preserve artifacts; no automatic retry was made.");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof CoverageUsageError ? error.message : "Coverage command stopped; preserve existing artifacts. No automatic retry was made.");
    process.exitCode = 1;
  });
}
