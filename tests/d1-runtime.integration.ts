import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import * as authSchema from "../src/lib/auth-schema";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { createEvaluationRun, getEvaluationRun, getEvaluationUsage, listEvaluationRuns,
  updateEvaluationRun, EvalStoreError } from "../src/lib/eval-store";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";
import { reserveSeoReport, completeSeoReport, getOwnedSeoReport, listOwnedSeoReports,
  SeoStoreError } from "../src/lib/seo-store";
import type { EvaluationRun } from "../src/lib/evals";
import type { SeoOverviewResult } from "../src/lib/dataforseo";

/** Standalone: node --conditions=react-server --import tsx --test tests/d1-runtime.integration.ts
 * Uses installed workerd through Miniflare's public API. No dev server, Wrangler
 * config, .env files, shared .wrangler/state, or provider requests are involved.
 */
const migrationsDirectory = new URL("../migrations/", import.meta.url);
const databaseId = "d1d10000-0000-4000-8000-000000000001";
const testSecret = "folio-isolated-integration-auth-secret-not-for-deployment";
const password = "Local integration fixture password";

function createRuntime(directory: string) {
  return new Miniflare({
    host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"),
    resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{
      config: {
        name: "folio-isolated-d1-integration", type: "worker", compatibilityDate: "2026-09-13",
        manifest: { mainModule: "worker.mjs", modules: {
          "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Integration binding only", { status: 404 }); } };' },
        } },
        env: { DB: { type: "d1", id: databaseId } },
      },
    }],
  });
}

async function applyMigrations(db: D1Database) {
  // readD1Migrations is not exported by the installed Wrangler. Its public SQL
  // parser is also used by Wrangler's migration runner and preserves triggers.
  const names = (await readdir(migrationsDirectory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  assert.ok(names.length > 0, "The repository must provide D1 migrations.");
  await db.prepare("CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const applied = await db.prepare("SELECT name FROM d1_migrations ORDER BY name").all<{ name: string }>();
  const existing = new Set(applied.results.map(row => row.name));
  for (const name of names) {
    if (existing.has(name)) continue;
    const statements = unstable_splitSqlQuery(await readFile(new URL(name, migrationsDirectory), "utf8"));
    assert.ok(statements.length > 0, `${name} must contain SQL statements.`);
    const results = await db.batch([
      ...statements.map(statement => db.prepare(statement)),
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").bind(name),
    ]);
    assert.ok(results.every(result => result.success), `All statements in ${name} must apply.`);
  }
  const journal = await db.prepare("SELECT name FROM d1_migrations ORDER BY name").all<{ name: string }>();
  assert.deepEqual(journal.results.map(row => row.name), names);
  return names;
}

async function withIsolatedDatabase(work: (db: D1Database) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "folio-d1-integration-"));
  let runtime: Miniflare | undefined;
  try {
    runtime = createRuntime(directory);
    const db = await runtime.getD1Database("DB");
    await applyMigrations(db);
    await work(db);
  } finally {
    try { await runtime?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
}

function createTestAuth(db: D1Database) {
  // The application's real schema and adapter, with explicit fixture-only
  // configuration so getAuth() never needs a Worker context or environment.
  const database = drizzle(db, { schema: authSchema });
  return betterAuth({
    appName: "Folio D1 integration", baseURL: "http://folio.test", secret: testSecret,
    database: drizzleAdapter(database, { provider: "sqlite", schema: authSchema }),
    emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    telemetry: { enabled: false },
  });
}

async function signUp(db: D1Database, name: string) {
  const auth = createTestAuth(db);
  const response = await auth.api.signUpEmail({
    body: { name, email: `${name}@example.test`, password }, asResponse: true,
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { user: { id: string; email: string } };
  assert.ok(body.user.id);
  const cookies = response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookies.includes("session_token="), "Better Auth must issue a persisted session cookie.");
  const headers = new Headers({ cookie: cookies });
  const session = await auth.api.getSession({ headers });
  assert.equal(session?.user.id, body.user.id);
  return { id: body.user.id, email: body.user.email, headers };
}

async function liveRun(status: EvaluationRun["status"] = "queued"): Promise<EvaluationRun> {
  return { ...await createDemoEvaluationRun(), id: crypto.randomUUID(), mode: "live", status,
    captures: [], events: [], result: null, agentOutput: undefined, expectedFacts: undefined };
}

function seoFixture(): SeoOverviewResult {
  const fetchedAt = new Date().toISOString();
  return {
    id: crypto.randomUUID(), domain: "example.com", provider: "DataForSEO", fetchedAt,
    organic: { status: "empty", data: null, error: null, costUsd: 0.01,
      taskId: "offline-organic-fixture", providerVersion: "fixture", endpoint: "/v3/dataforseo_labs/google/domain_rank_overview/live", fetchedAt },
    backlinks: { status: "error", data: null, error: null, costUsd: null,
      taskId: null, providerVersion: null, endpoint: "/v3/backlinks/summary/live", fetchedAt },
    status: "partial", totalCostUsd: null, knownCostUsd: 0.01, costIsComplete: false,
    notes: ["Synthetic database fixture. No SEO provider request was made."],
  };
}

test("real D1 nullable website daily cap retains reservations and the atomic active-run guard", { timeout: 90_000 }, async () => {
  await withIsolatedDatabase(async db => {
    const alice = await signUp(db, "unmetered-fixture");
    const bob = await signUp(db, "metered-fixture");
    for (let i = 0; i < 7; i++) await createEvaluationRun(db, alice.id, await liveRun("failed"), { maxLivePerDay: null });
    const usage = await getEvaluationUsage(db, alice.id, null);
    assert.equal(usage.liveAttemptsLast24Hours, 7); assert.equal(usage.remainingLiveRuns, null);
    const raced = await Promise.allSettled(Array.from({ length: 5 }, async () => createEvaluationRun(db, alice.id, await liveRun(), { maxLivePerDay: null })));
    assert.equal(raced.filter(value => value.status === "fulfilled").length, 1);
    assert.equal((await getEvaluationUsage(db, alice.id, null)).remainingLiveRuns, null);
    assert.ok((await getEvaluationUsage(db, alice.id, null)).activeRunId);
    await createEvaluationRun(db, bob.id, await liveRun("failed"));
    await assert.rejects(createEvaluationRun(db, bob.id, await liveRun()), error => error instanceof EvalStoreError && error.status === 429);
    assert.equal((await getEvaluationUsage(db, bob.id)).remainingLiveRuns, 0);
  });
});

test("real D1 applies every migration and supports Better Auth, private repositories, foreign keys and batch rollback", { timeout: 90_000 }, async () => {
  await withIsolatedDatabase(async db => {
    assert.equal((await db.prepare("PRAGMA foreign_keys").first<{ foreign_keys: number }>())?.foreign_keys, 1);
    const trigger = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?")
      .bind("erase_deleted_evaluation_tool_calls").first<{ name: string }>();
    assert.equal(trigger?.name, "erase_deleted_evaluation_tool_calls");
    const alice = await signUp(db, "alice");
    const bob = await signUp(db, "bob");
    const orm = drizzle(db, { schema: authSchema });
    const storedAlice = await orm.select().from(authSchema.user).where(eq(authSchema.user.id, alice.id)).get();
    assert.ok(storedAlice?.createdAt instanceof Date, "Drizzle must decode D1 timestamp_ms columns.");
    assert.equal(storedAlice.emailVerified, false);
    assert.equal((await orm.select().from(authSchema.account).where(eq(authSchema.account.userId, alice.id)).all()).length, 1);
    assert.equal((await orm.select().from(authSchema.session).where(eq(authSchema.session.userId, alice.id)).all()).length, 1);

    const evaluation = await createEvaluationRun(db, alice.id, await createDemoEvaluationRun());
    assert.deepEqual(await getEvaluationRun(db, alice.id, evaluation.id), evaluation);
    assert.equal(await getEvaluationRun(db, bob.id, evaluation.id), null);
    assert.deepEqual(await listEvaluationRuns(db, bob.id), []);
    await assert.rejects(updateEvaluationRun(db, bob.id, { ...evaluation, error: "Other owner's mutation" }), EvalStoreError);
    await assert.rejects(createEvaluationRun(db, "nonexistent-owner", await createDemoEvaluationRun()), /FOREIGN KEY/i);

    const reserved = await reserveSeoReport(db, alice.id, "https://www.example.com/");
    const result = seoFixture();
    await assert.rejects(completeSeoReport(db, bob.id, reserved.id, result), SeoStoreError);
    const report = await completeSeoReport(db, alice.id, reserved.id, result);
    assert.deepEqual((await getOwnedSeoReport(db, alice.id, report.id))?.result, result);
    assert.equal(await getOwnedSeoReport(db, bob.id, report.id), null);
    assert.deepEqual(await listOwnedSeoReports(db, bob.id), []);
    await assert.rejects(completeSeoReport(db, alice.id, report.id, result), SeoStoreError);
    await assert.rejects(reserveSeoReport(db, "nonexistent-owner", "example.com"), /FOREIGN KEY/i);

    const rollbackId = "rollback-user";
    await assert.rejects(db.batch([
      db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
        .bind(rollbackId, "Rollback fixture", "rollback@example.test", Date.now(), Date.now()),
      db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at) VALUES(?,?,?,?)")
        .bind("rollback-report", "nonexistent-owner", "example.com", Date.now()),
    ]), /FOREIGN KEY/i);
    assert.equal(await db.prepare("SELECT id FROM user WHERE id = ?").bind(rollbackId).first(), null);

    await orm.delete(authSchema.user).where(eq(authSchema.user.id, alice.id)).run();
    assert.equal(await getEvaluationRun(db, alice.id, evaluation.id), null);
    assert.equal(await getOwnedSeoReport(db, alice.id, report.id), null);
    assert.equal(await createTestAuth(db).api.getSession({ headers: alice.headers }), null);
    assert.equal((await orm.select().from(authSchema.account).where(eq(authSchema.account.userId, alice.id)).all()).length, 0);
    assert.equal((await createTestAuth(db).api.getSession({ headers: bob.headers }))?.user.id, bob.id);
  });
});

test("real D1 serializes concurrent reservations and CAS updates while deletion retains usage and erases tool records", { timeout: 90_000 }, async () => {
  await withIsolatedDatabase(async db => {
    const owner = await signUp(db, "reservation-owner");
    const candidates = await Promise.all(Array.from({ length: 6 }, () => liveRun()));
    const starts = await Promise.allSettled(candidates.map(run => createEvaluationRun(db, owner.id, run, { maxLivePerDay: 4 })));
    const accepted = starts.filter((result): result is PromiseFulfilledResult<EvaluationRun> => result.status === "fulfilled");
    assert.equal(accepted.length, 1);
    for (const result of starts.filter(result => result.status === "rejected")) assert.ok(result.reason instanceof EvalStoreError);
    const run = accepted[0].value;
    assert.deepEqual(await getEvaluationUsage(db, owner.id, 4), {
      liveAttemptsLast24Hours: 1, remainingLiveRuns: 3, activeRunId: run.id, activeRunStatus: "queued",
    });
    const updates = await Promise.allSettled([
      updateEvaluationRun(db, owner.id, { ...run, status: "running", sessionId: "fixture-session", error: "poll-A" }),
      updateEvaluationRun(db, owner.id, { ...run, status: "running", sessionId: "fixture-session", error: "poll-B" }),
    ]);
    assert.equal(updates.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(updates.filter(result => result.status === "rejected").length, 1);
    const running = await getEvaluationRun(db, owner.id, run.id);
    assert.equal(running?.revision, 1);
    assert.ok(running?.error === "poll-A" || running?.error === "poll-B");
    await assert.rejects(deleteEvaluationEvidence(db, owner.id, run.id, running!.revision), /Cancel the active run/);
    const terminal = await updateEvaluationRun(db, owner.id, { ...running!, status: "failed", error: "Synthetic terminal result" });
    await assert.rejects(updateEvaluationRun(db, owner.id, { ...terminal, status: "running" }), EvalStoreError);
    await db.prepare("INSERT INTO agent_tool_calls(run_id,user_id,session_id,turn_id,call_id,tool_name,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(run.id, owner.id, "fixture-session", "fixture-turn", "fixture-call", "read_saved_seo_report", "uncertain", Date.now(), Date.now()).run();
    const deleted = await deleteEvaluationEvidence(db, owner.id, run.id, terminal.revision).catch(async error => {
      const persisted = await db.prepare("SELECT deleted_at FROM evaluation_runs WHERE id = ?").bind(run.id).first<{ deleted_at: number | null }>();
      const tool = await db.prepare("SELECT run_id FROM agent_tool_calls WHERE run_id = ?").bind(run.id).first();
      assert.fail(`Deletion returned an error after D1 execution (tombstone saved: ${Boolean(persisted?.deleted_at)}, tool row remains: ${Boolean(tool)}): ${String(error)}`);
    });
    assert.equal(deleted.remoteSessionDeleted, false);
    assert.equal(await getEvaluationRun(db, owner.id, run.id), null);
    assert.deepEqual(await listEvaluationRuns(db, owner.id), []);
    assert.equal(await db.prepare("SELECT run_id FROM agent_tool_calls WHERE run_id = ?").bind(run.id).first(), null);
    assert.deepEqual(await getEvaluationUsage(db, owner.id), {
      liveAttemptsLast24Hours: 1, remainingLiveRuns: 0, activeRunId: null, activeRunStatus: null,
    });
    const tombstone = await db.prepare("SELECT target_url, session_id, result_json, deleted_at FROM evaluation_runs WHERE id = ?")
      .bind(run.id).first<{ target_url: string; session_id: string | null; result_json: string; deleted_at: number }>();
    assert.equal(tombstone?.target_url, "");
    assert.equal(tombstone?.session_id, null);
    assert.equal(tombstone?.result_json, "{}");
    assert.ok(tombstone?.deleted_at);
    await assert.rejects(createEvaluationRun(db, owner.id, await liveRun()),
      (error: unknown) => error instanceof EvalStoreError && error.status === 429);
  });
});

test("D1 auth, evaluations, SEO observations and deletion quotas survive runtime restart; another directory starts empty", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-d1-restart-"));
  const otherDirectory = await mkdtemp(join(tmpdir(), "folio-d1-independent-"));
  let runtime: Miniflare | undefined;
  let otherRuntime: Miniflare | undefined;
  try {
    runtime = createRuntime(directory);
    const first = await runtime.getD1Database("DB");
    const migrationNames = await applyMigrations(first);
    const owner = await signUp(first, "persistent-owner");
    const savedEvaluation = await createEvaluationRun(first, owner.id, await createDemoEvaluationRun());
    const reserved = await reserveSeoReport(first, owner.id, "example.com");
    const savedSeo = await completeSeoReport(first, owner.id, reserved.id, seoFixture());
    const deletedAttempt = await createEvaluationRun(first, owner.id, await liveRun("failed"));
    await deleteEvaluationEvidence(first, owner.id, deletedAttempt.id, deletedAttempt.revision);
    const usageBefore = await getEvaluationUsage(first, owner.id);

    await runtime.dispose();
    runtime = undefined;
    runtime = createRuntime(directory);
    const reopened = await runtime.getD1Database("DB");
    // Read before running migrations: the schema and records must already exist.
    assert.deepEqual(await getEvaluationRun(reopened, owner.id, savedEvaluation.id), savedEvaluation);
    assert.deepEqual(await getOwnedSeoReport(reopened, owner.id, savedSeo.id), savedSeo);
    assert.equal(savedSeo.result?.totalCostUsd, null, "Unknown cost must remain null across restart.");
    assert.deepEqual(await getEvaluationUsage(reopened, owner.id), usageBefore);
    assert.equal(await getEvaluationRun(reopened, owner.id, deletedAttempt.id), null);
    assert.deepEqual((await reopened.prepare("SELECT name FROM d1_migrations ORDER BY name").all<{ name: string }>()).results.map(row => row.name), migrationNames);
    const restoredAuth = createTestAuth(reopened);
    assert.equal((await restoredAuth.api.getSession({ headers: owner.headers }))?.user.id, owner.id);
    const signedIn = await restoredAuth.api.signInEmail({ body: { email: owner.email, password } });
    assert.equal(signedIn.user.id, owner.id, "Better Auth must verify the credential stored before restart.");
    await assert.rejects(createEvaluationRun(reopened, owner.id, await liveRun()),
      (error: unknown) => error instanceof EvalStoreError && error.status === 429);
    assert.deepEqual(await applyMigrations(reopened), migrationNames, "The migration journal makes an already migrated restart a no-op.");

    otherRuntime = createRuntime(otherDirectory);
    const independent = await otherRuntime.getD1Database("DB");
    assert.equal(await independent.prepare("SELECT name FROM sqlite_master WHERE name = 'user'").first(), null);
    await applyMigrations(independent);
    assert.equal((await independent.prepare("SELECT COUNT(*) AS count FROM user").first<{ count: number }>())?.count, 0);
    assert.deepEqual(await listEvaluationRuns(independent, owner.id), []);
    assert.deepEqual(await listOwnedSeoReports(independent, owner.id), []);
    assert.deepEqual(await getEvaluationUsage(independent, owner.id), {
      liveAttemptsLast24Hours: 0, remainingLiveRuns: 1, activeRunId: null, activeRunStatus: null,
    });
    assert.equal(await createTestAuth(independent).api.getSession({ headers: owner.headers }), null);
  } finally {
    // Dispose both real workerd runtimes before deleting only our unique dirs.
    const disposals = await Promise.allSettled([runtime?.dispose(), otherRuntime?.dispose()]);
    await Promise.all([rm(directory, { recursive: true, force: true }), rm(otherDirectory, { recursive: true, force: true })]);
    const failure = disposals.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) throw failure.reason;
  }
});
