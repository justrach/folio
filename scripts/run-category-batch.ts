import { ProviderMutationGate } from "./category-batch-transport";
import { findCategoryReceipts, recoverCategoryReceipt } from "./category-batch-recovery";
import { CategoryBatchRate } from "./category-batch-rate";
import { readFile, writeFile, rename, mkdir, open, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "@cloudflare/workers-types";
import type { AgentsEnvironment } from "../src/lib/agents";
import { publicCollectionCaseId, projectPublicSearchObservation } from "./collect-public-search-rankings";
import { createKeywordBenchmarkSuite, getKeywordBenchmarkRun, getKeywordBenchmarkUsage, reserveKeywordBenchmarkRun, updateKeywordBenchmarkRun } from "../src/lib/keyword-benchmark-store";
import { startKeywordBenchmark, reconcileKeywordBenchmark, keywordBenchmarkAccess, KeywordBenchmarkPersistenceError } from "../src/lib/keyword-benchmark-service";
import { reconcileKeywordBenchmarkSession, KeywordAgentError } from "../src/lib/keyword-benchmark-agent";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";
import { assertPublicCollectionProgress, type PublicCollectionProgress } from "../src/lib/public-dashboard";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";
import type { PublicSearchQuery } from "../src/lib/public-search-rankings";

const directory = ".local/category-batch", rankingPath = "src/data/public-search-rankings.json", progressPath = "src/data/public-search-progress.json";
const active = (run: KeywordBenchmarkRun) => ["queued", "running", "requires_action"].includes(run.status);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function atomic(path: string, value: unknown) { const tmp = `${path}.${crypto.randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: path.startsWith(".local/") ? 0o600 : 0o644 }); await rename(tmp, path); }
export function categoryBatchScope(queries: PublicSearchQuery[]) {
  const counts = new Map<string, number>();
  for (const query of queries) counts.set(query.category, (counts.get(query.category) ?? 0) + 1);
  if (counts.size !== 35 || [...counts.values()].some(count => count !== 100) || new Set(queries.map(query => query.query)).size !== queries.length) throw Error("Expected 100 distinct questions in each of the 35 reviewed categories.");
  return { categoryCount: counts.size, questionCount: queries.length, maxConcurrent: 20, maxSuites: 100, queryHash: digest(queries) };
}
export function interleaveCategories(queries: PublicSearchQuery[]) {
  const groups = new Map<string, PublicSearchQuery[]>();
  for (const query of queries) { const group = groups.get(query.category) ?? []; group.push(query); groups.set(query.category, group); }
  const ordered: PublicSearchQuery[] = [];
  for (let index = 0; ; index++) {
    const wave = [...groups.values()].flatMap(group => group[index] ? [group[index]] : []);
    if (!wave.length) return ordered;
    ordered.push(...wave);
  }
}
async function main() {
  const execute = process.argv.includes("--confirm-spend");
  const maxNewOption = process.argv.find(arg => arg.startsWith("--max-new="));
  const maxNew = maxNewOption ? Number(maxNewOption.slice(10)) : 3500;
  if (!Number.isInteger(maxNew) || maxNew < 1 || maxNew > 3500) throw Error("Invalid process submission bound.");
  const workerOption = process.argv.find(arg => arg.startsWith("--workers="));
  const requestedWorkers = workerOption ? Number(workerOption.slice(10)) : 20;
  if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > 20) throw Error("Workers must be between1 and20.");
  if (process.argv.slice(2).some(arg => !["--confirm-spend", "--publish"].includes(arg) && arg !== workerOption && arg !== maxNewOption) || !process.argv.includes("--publish")) throw Error("Use --publish for saved-result preparation, plus --confirm-spend to execute the authorized batch.");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = await open(`${directory}/runner.lock`, "wx", 0o600); await lock.writeFile(String(process.pid));
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<AgentsEnvironment & { DB: D1Database }>>> | undefined;
  try {
    const artifact = JSON.parse(await readFile(rankingPath, "utf8")); assertPublicSearchRankings(artifact);
    const scope = categoryBatchScope(artifact.queries);
    const selection = JSON.parse(await readFile(".local/website-query-batch/selection.json", "utf8"));
    const ownerId: string = selection.ownerId;
    const manifestPath = `${directory}/manifest.json`;
    const manifest = { ...scope, ownerId, queryIds: artifact.queries.map(query => query.id) };
    try { const saved = JSON.parse(await readFile(manifestPath, "utf8")); if (JSON.stringify(saved) !== JSON.stringify(manifest)) throw Error("Queue identity changed; review required."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await atomic(manifestPath, manifest); }
    proxy = await getPlatformProxy<AgentsEnvironment & { DB: D1Database }>({ configPath: "wrangler.jsonc", persist: { path: ".wrangler/state/v3" }, remoteBindings: false });
    const { DB: db, ...env } = proxy.env;
    const access = keywordBenchmarkAccess(env, ownerId);
    if (!access.canRun || access.maxRunsPerDay !== null) throw Error("This explicit operator batch requires the selected account's established uncapped daily allowance.");
    const queue = new Map<string, KeywordBenchmarkRun>();
    let publishing = Promise.resolve(), stopped = false, submitted = 0;
    let scheduler: Record<string, unknown> = {};
    const existingProgress = JSON.parse(await readFile(progressPath, "utf8")) as PublicCollectionProgress;
    const statuses = new Map(existingProgress.queries.map(item => [item.queryId, item]));
    const save = (query: PublicSearchQuery, run: KeywordBenchmarkRun) => {
      queue.set(query.id, run);
      const work = publishing.then(async () => {
        await atomic(`${directory}/${query.id}.json`, run);
        if (run.status === "completed") {
          const observation = projectPublicSearchObservation(run, query, [ownerId, env.OPENAI_API_KEY ?? ""]);
          if (!artifact.observations.some(item => item.id === observation.id)) { artifact.observations.push(observation); assertPublicSearchRankings(artifact); await atomic(rankingPath, artifact); }
          statuses.set(query.id, { queryId: query.id, status: "completed", startedAt: run.createdAt, finishedAt: run.updatedAt, observationId: observation.id });
        } else statuses.set(query.id, { queryId: query.id, status: run.status === "requires_action" ? "unresolved" : run.status, startedAt: run.createdAt, ...(!active(run) ? { finishedAt: run.updatedAt } : {}) });
        const progress: PublicCollectionProgress = { format: "folio-public-search-progress-v1", updatedAt: new Date().toISOString(), queries: artifact.queries.map(query => statuses.get(query.id) ?? { queryId: query.id, status: "not-started" }) };
        assertPublicCollectionProgress(progress, artifact.queries, artifact.observations); await atomic(progressPath, progress);
        const counts: Record<string, number> = {};
        for (const run of queue.values()) counts[run.status] = (counts[run.status] ?? 0) + 1;
        await atomic(`${directory}/summary.json`, { ...scope, submittedThisProcess: submitted, counts, queued: artifact.queries.length - queue.size, stopped, scheduler, updatedAt: progress.updatedAt });
      });
      publishing = work.catch(() => {}); return work;
    };
    // Caller holds the runner lock and has drained all jobs before entering this checkpoint.
    const receiptCheckpoint = async () => {
      await publishing;
      const waiting = [...queue.values()].filter(active);
      const found = await findCategoryReceipts(waiting.filter(run => !run.sessionId && Boolean(run.createAttemptAt)), env);
      await atomic(`${directory}/checkpoint-receipts.json`, { ...found, checkedAt: new Date().toISOString() });
      let recovered = 0, terminal = 0;
      for (const query of artifact.queries) {
        const previous = queue.get(query.id); if (!previous || !active(previous)) continue;
        let run = (await getKeywordBenchmarkRun(db, ownerId, previous.id))!;
        if (!run) throw Error("Owned checkpoint record disappeared.");
        if (!run.sessionId && found.complete && found.candidates.some(candidate => (candidate as { metadata?: {run_id?: string} }).metadata?.run_id === run.id)) {
          try { run = await recoverCategoryReceipt(db, ownerId, run.id, found.candidates, env); recovered++; }
          catch (error) { console.log(JSON.stringify({ phase: "receipt-not-recovered", queryId: query.id, errorType: error instanceof Error ? error.name : "unknown",
            ...(error instanceof KeywordAgentError ? { code: error.code, httpStatus: error.status ?? null } : {}) })); }
        } else if (run.sessionId && active(run)) {
          try {
            const result = await reconcileKeywordBenchmarkSession(run.sessionId, env, { expectedSearchMode: run.case.searchMode, expectedAllowedDomains: run.allowedDomains });
            if (["completed", "failed", "cancelled"].includes(result.status) || result.initialInputUnconfirmed) run = await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, { status: result.status, answer: result.answer, usage: result.usage, providerMetadata: result.providerMetadata, error: result.error });
          } catch { console.log(JSON.stringify({ phase: "receipt-outcome-unconfirmed", queryId: query.id })); }
        }
        if (!active(run)) terminal++;
        await save(query, run);
      }
      console.log(JSON.stringify({ phase: "receipt-checkpoint", complete: found.complete, checked: found.checked, ...(found.complete ? {} : { reason: found.reason }), recovered, terminal }));
    };
    // Resume from D1, never from a missing filesystem receipt. Reconcile pre-existing sessions with GETs only.
    const rows = await db.prepare("SELECT id,case_id FROM keyword_benchmark_runs WHERE user_id=? ORDER BY created_at DESC").bind(ownerId).all<{ id: string; case_id: string }>();
    const byCase = new Map<string, string>(); for (const row of rows.results) if (!byCase.has(row.case_id)) byCase.set(row.case_id, row.id);
    for (const query of artifact.queries) {
      const id = byCase.get(publicCollectionCaseId(ownerId, query)); if (!id) continue;
      let run = (await getKeywordBenchmarkRun(db, ownerId, id))!;
      if (active(run) && run.sessionId) {
        try {
          const result = await reconcileKeywordBenchmarkSession(run.sessionId, env, { expectedSearchMode: run.case.searchMode, expectedAllowedDomains: run.allowedDomains });
          if (["completed", "failed", "cancelled"].includes(result.status) || result.initialInputUnconfirmed) run = await updateKeywordBenchmarkRun(db, ownerId, run.id, run.revision, { status: result.status, answer: result.answer, usage: result.usage, providerMetadata: result.providerMetadata, error: result.error });
        } catch { console.log(JSON.stringify({ queryId: query.id, status: "retrieval-unconfirmed" })); }
      }
      await save(query, run);
    }
    await receiptCheckpoint();
    const pending = interleaveCategories(artifact.queries.filter(query => !queue.has(query.id)));
    // Separate <=50-case operator suites, with an explicit account-local ceiling; normal creation stays at20.
    const savedCases = await db.prepare("SELECT id FROM keyword_benchmark_cases WHERE user_id=?").bind(ownerId).all<{ id: string }>();
    const existingCaseIds = new Set(savedCases.results.map(row => row.id));
    for (let index = 0; index < pending.length; index += 50) {
      const chunk = pending.slice(index, index + 50), missing: PublicSearchQuery[] = [];
      for (const query of chunk) if (!existingCaseIds.has(publicCollectionCaseId(ownerId, query))) missing.push(query);
      if (missing.length) await createKeywordBenchmarkSuite(db, ownerId, { name: `Public categories · ${digest(missing.map(query => query.id)).slice(0, 12)}`, description: "Explicit public query collection, 100 questions per existing category. No private target or reference facts.", cases: missing.map(query => ({ id: publicCollectionCaseId(ownerId, query), query: query.query, targetUrl: null, language: query.language, locale: query.locale, rubricVersion: "keyword-observation-v1", searchMode: "open-web" })) }, { maxSuites: scope.maxSuites });
    }
    console.log(JSON.stringify({ phase: "prepared", ...scope, previouslyAttempted: queue.size, unstarted: pending.length, published: artifact.observations.length }));
    if (!execute) return;
    const usage = await getKeywordBenchmarkUsage(db, ownerId, { maxRunsPerDay: null, maxActiveRuns: scope.maxConcurrent });
    let slots = Math.min(requestedWorkers, Math.max(0, scope.maxConcurrent - usage.activeRuns));
    if (!slots) throw Error("Existing active attempts occupy all authorized concurrency; no replacement starts.");
    let next = 0, draining = false, creating = false, lastCreateAt = 0, heldThisProcess = 0;
    const rate = new CategoryBatchRate(requestedWorkers, Date.now());
    let recoveryPending = false, lastReceiptCheckpoint = Date.now();
    const jobs = new Set<Promise<void>>();
    const mutations = new ProviderMutationGate();
    const providerFetch: typeof fetch = (url, init) => (init?.method ?? "GET").toUpperCase() === "GET" ? fetch(url, init) : mutations.run(() => fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }));
    const drain = () => { draining = true; console.log(JSON.stringify({ phase: "draining", confirmedOrCreating: jobs.size })); };
    process.on("SIGUSR2", drain); process.on("SIGTERM", drain); process.on("SIGINT", drain);
    const updateScheduler = () => { scheduler = { desiredConcurrency: rate.desired, availableCeiling: Math.max(0, slots - heldThisProcess), activeOrCreating: jobs.size, creating, serializedProviderWrites: true, recoveryPending, lastReceiptCheckpoint: new Date(lastReceiptCheckpoint).toISOString(), createSpacingMs: rate.spacingMs, cooldownUntil: rate.cooldownUntil ? new Date(rate.cooldownUntil).toISOString() : null, stoppedReason: rate.stoppedReason, draining }; };
    async function executeQuestion(query: PublicSearchQuery) {
      let run: KeywordBenchmarkRun | undefined, inCreatePhase = true;
      const releaseCreatePhase = () => { if (inCreatePhase) { creating = false; inCreatePhase = false; } };
      try {
        if (await db.prepare("SELECT id FROM keyword_benchmark_runs WHERE user_id=? AND case_id=?").bind(ownerId, publicCollectionCaseId(ownerId, query)).first()) { stopped = true; rate.stoppedReason = "concurrent-existing-attempt"; releaseCreatePhase(); return; }
        run = await startKeywordBenchmark(db, ownerId, { caseId: publicCollectionCaseId(ownerId, query), kind: "baseline" }, env, { fetcher: async (url, init) => {
          const response = await providerFetch(url, init);
          if (!response.ok) {
            const reader = response.clone().body?.getReader(); let body = "";
            if (reader) { const decoder = new TextDecoder(); let bytes=0; try { while(true) { const item=await reader.read(); if(item.done) break; bytes+=item.value.byteLength; if(bytes>65536) break; body+=decoder.decode(item.value,{stream:true}); } } finally { void reader.cancel().catch(()=>{}); } }
            await atomic(`${directory}/${query.id}-provider-error.json`, { httpStatus: response.status, body, receivedAt: new Date().toISOString() });
          }
          return response;
        }, reserve: async (input, limits) => ({ run: await reserveKeywordBenchmarkRun(db, ownerId, input, { maxRunsPerDay: limits.maxRunsPerDay, maxActiveRuns: scope.maxConcurrent }), created: true }) });
        releaseCreatePhase();
        submitted++;
        const httpStatus = run.providerMetadata.creationHttpStatus;
        if ((httpStatus ?? 0) >= 400 || run.status === "requires_action" && !run.sessionId) {
          rate.failure(httpStatus, Date.now());
          console.log(JSON.stringify({ phase: "provider-backoff", httpStatus: httpStatus ?? null, desiredConcurrency: rate.desired, spacingMs: rate.spacingMs, stoppedReason: rate.stoppedReason }));
        } else if (run.sessionId) rate.receipt(Date.now());
        updateScheduler(); await save(query, run);
        console.log(JSON.stringify({ queryId: query.id, status: run.status, submitted, hasSession: Boolean(run.sessionId), desiredConcurrency: rate.desired }));
        while (active(run) && run.sessionId && Date.now() < Date.parse(run.deadlineAt ?? run.createdAt) + 30_000) {
          await new Promise(resolve => setTimeout(resolve, 5000)); run = await reconcileKeywordBenchmark(db, ownerId, run.id, env, { fetcher: providerFetch }); updateScheduler(); await save(query, run);
        }
        if (active(run) && run.sessionId) { run = await reconcileKeywordBenchmark(db, ownerId, run.id, env, { fetcher: providerFetch }); updateScheduler(); await save(query, run); }
        if (active(run)) heldThisProcess++;
        console.log(JSON.stringify({ queryId: query.id, finalStatus: run.status, published: artifact.observations.length }));
      } catch (error) {
        releaseCreatePhase();
        stopped = true; rate.stoppedReason = "persistence-or-reservation-needs-review";
        if (error instanceof KeywordBenchmarkPersistenceError) await atomic(`${directory}/${query.id}-recovery.json`, error.run);
        console.log(JSON.stringify({ queryId: query.id, status: "stopped-for-review", errorType: error instanceof Error ? error.name : "unknown" }));
      }
    }
    try {
      while ((!stopped && !draining && !rate.stoppedReason && next < Math.min(pending.length, maxNew)) || jobs.size) {
        if (!stopped && !draining && !rate.stoppedReason && Date.now() >= rate.cooldownUntil && (Date.now() - lastReceiptCheckpoint >= 300_000 || (!jobs.size && slots <= heldThisProcess))) recoveryPending = true;
        if (recoveryPending && !jobs.size && !creating && !draining && !rate.stoppedReason) {
          await receiptCheckpoint();
          const refreshed = await getKeywordBenchmarkUsage(db, ownerId, { maxRunsPerDay: null, maxActiveRuns: scope.maxConcurrent });
          slots = Math.min(requestedWorkers, Math.max(0, scope.maxConcurrent - refreshed.activeRuns));
          heldThisProcess = 0; recoveryPending = false; lastReceiptCheckpoint = Date.now();
        }
        const available = Math.max(0, slots - heldThisProcess);
        if (!available && !jobs.size) rate.stoppedReason = "capacity-retained-by-unresolved-attempts";
        if (!recoveryPending && !creating && !stopped && !draining && !rate.stoppedReason && next < Math.min(pending.length, maxNew) && jobs.size < available && rate.canCreate(Date.now(), jobs.size) && Date.now() - lastCreateAt >= rate.spacingMs) {
          const query = pending[next++]; lastCreateAt = Date.now(); creating = true;
          const work = executeQuestion(query); jobs.add(work); work.finally(() => jobs.delete(work));
        }
        updateScheduler();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally { process.off("SIGUSR2", drain); process.off("SIGTERM", drain); process.off("SIGINT", drain); }
    stopped = stopped || Boolean(rate.stoppedReason); updateScheduler();
    await publishing;
    const latestSummary = JSON.parse(await readFile(`${directory}/summary.json`, "utf8"));
    await atomic(`${directory}/summary.json`, { ...latestSummary, stopped, scheduler, updatedAt: new Date().toISOString() });
    console.log(JSON.stringify({ phase: "finished", submitted, stopped, remaining: pending.length - submitted, scheduler }));
  } finally { await proxy?.dispose(); await lock.close(); await rm(`${directory}/runner.lock`, { force: true }); }
}
if (process.argv[1]?.endsWith("run-category-batch.ts")) main().catch(error => { console.error(JSON.stringify({ status: "stopped", errorType: error instanceof Error ? error.name : "unknown", message: "Inspect saved queue and provider state before resuming. No creation retry was made." })); process.exitCode = 1; });
