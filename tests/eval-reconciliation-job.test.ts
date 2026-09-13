import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import {
  authenticateReconciliationJob, handleEvaluationReconciliationRequest,
  runEvaluationReconciliationJob, RECONCILIATION_BATCH_SIZE, RECONCILIATION_LEASE_MS,
} from "../src/lib/eval-reconciliation-job";
import { createEvaluationRun, getEvaluationRun } from "../src/lib/eval-store";
import { createDemoEvaluationRun, DEMO_AGENT_OUTPUT } from "../src/lib/eval-verifier";
import type { EvaluationRun } from "../src/lib/evals";
import scheduler, {
  triggerEvaluationReconciliation, type EvaluationSchedulerEnvironment,
} from "../workers/evaluation-scheduler";

const secret = "fixture-scheduler-secret-with-32-characters";
const env = {
  EVALUATION_RECONCILE_ENABLED: "true", EVALUATION_RECONCILE_SECRET: secret,
  OPENAI_API_KEY: "fixture-openai-key",
};

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial.sql", "0002_evaluations.sql", "0005_eval_evidence_deletion.sql", "0006_background_lease.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
            async first() { return statement.get(...values) ?? null; },
            async all() { return { success: true, results: statement.all(...values) }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  async function seed(id: string, updates: Partial<EvaluationRun> = {}) {
    const owner = `owner-${id}`;
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(owner, owner, `${id}@example.com`, Date.now(), Date.now());
    const run = {
      ...await createDemoEvaluationRun(), id, mode: "live" as const,
      status: "running" as const, sessionId: `sess_${id}`, result: null,
      agentOutput: undefined, ...updates,
    };
    return { run: await createEvaluationRun(db, owner, run), owner };
  }
  return { db, sqlite, seed };
}

test("internal authentication fails closed and does not disclose configuration or touch D1", async () => {
  let reads = 0;
  const getDb = async () => { reads++; throw new Error("No database access expected"); };
  for (const [headers, overrides, method] of [
    [{}, {}, "POST"],
    [{ Authorization: `Bearer ${secret}x` }, {}, "POST"],
    [{ Authorization: `Bearer ${secret}` }, { EVALUATION_RECONCILE_ENABLED: "false" }, "POST"],
    [{ Authorization: `Bearer ${secret}` }, { EVALUATION_RECONCILE_SECRET: "" }, "POST"],
    [{ Authorization: `Bearer ${secret}` }, {}, "GET"],
  ] as const) {
    const response = await handleEvaluationReconciliationRequest(
      new Request("https://folio.test/api/internal/evaluations/reconcile", { method, headers }), getDb,
      { ...env, ...overrides },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found." });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(reads, 0);
  assert.equal(authenticateReconciliationJob(new Request("https://folio.test", {
    headers: { Authorization: `Bearer ${secret}` },
  }), env), true);
});

test("missing OpenAI configuration or job secret never selects or reconciles runs", async t => {
  const { db, sqlite, seed } = database(); t.after(() => sqlite.close());
  await seed("disabled");
  let calls = 0;
  for (const overrides of [{ OPENAI_API_KEY: "" }, { EVALUATION_RECONCILE_SECRET: "short" }, { EVALUATION_RECONCILE_ENABLED: "false" }]) {
    const result = await runEvaluationReconciliationJob(db, { ...env, ...overrides }, {
      reconcile: async () => { calls++; throw new Error("Must not run"); },
    });
    assert.equal(result.status, "disabled");
  }
  assert.equal(calls, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM background_job_leases").get()?.count, 0);
});

test("bounded batches isolate failures and fairly rotate active live runs across owners", async t => {
  const { db, sqlite, seed } = database(); t.after(() => sqlite.close());
  for (const id of ["a", "b", "c", "d", "e"]) await seed(id);
  await seed("fixture", { mode: "demo", status: "completed" });
  await seed("finished", { status: "completed" });
  await seed("deleted");
  sqlite.prepare("UPDATE evaluation_runs SET deleted_at = ? WHERE id = ?").run(1, "deleted");
  const seen: string[] = [];
  const reconcile = async (connection: D1Database, owner: string, id: string) => {
    assert.equal(owner, `owner-${id}`);
    seen.push(id);
    if (id === "a") throw new Error("Private provider failure includes sensitive evidence");
    return (await getEvaluationRun(connection, owner, id))!;
  };
  const first = await runEvaluationReconciliationJob(db, env, { now: () => 1000, reconcile });
  assert.deepEqual(first, { status: "completed", attempted: RECONCILIATION_BATCH_SIZE, reconciled: 2, failed: 1 });
  const second = await runEvaluationReconciliationJob(db, env, { now: () => 2000, reconcile });
  assert.equal(second.attempted, RECONCILIATION_BATCH_SIZE);
  assert.ok(seen.includes("d") && seen.includes("e"), "A repeated provider failure must not starve other owners");
  assert.ok(!seen.includes("finished") && !seen.includes("fixture"));
  assert.ok(!seen.includes("deleted"));
  assert.ok(!JSON.stringify(first).includes("Private provider"));
});

test("overlapping scheduler invocations hold one lease and stale workers cannot release its replacement", async t => {
  const { db, sqlite, seed } = database(); t.after(() => sqlite.close());
  const { run } = await seed("overlap");
  let release!: () => void;
  let started!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const running = new Promise<void>(resolve => { started = resolve; });
  const first = runEvaluationReconciliationJob(db, env, {
    now: () => 1000,
    reconcile: async () => { started(); await barrier; return run; },
  });
  await running;
  const second = await runEvaluationReconciliationJob(db, env, {
    now: () => 2000,
    reconcile: async () => { throw new Error("A duplicate must not execute"); },
  });
  assert.equal(second.status, "busy");
  sqlite.prepare("UPDATE background_job_leases SET token = ?, expires_at = ?").run("new-lease-owner", 9_999_999);
  release(); await first;
  assert.equal(sqlite.prepare("SELECT token FROM background_job_leases").get()?.token, "new-lease-owner");
});

test("expired lease is recovered and a missing table fails without exposing database details", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  sqlite.prepare("INSERT INTO background_job_leases VALUES(?,?,?)")
    .run("evaluation-read-reconciliation", "dead-invocation", 1);
  const result = await runEvaluationReconciliationJob(db, env, { now: () => RECONCILIATION_LEASE_MS + 1 });
  assert.equal(result.status, "completed");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM background_job_leases").get()?.count, 0);
  sqlite.exec("DROP TABLE background_job_leases");
  const response = await handleEvaluationReconciliationRequest(new Request("https://folio.test", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` },
  }), async () => db, env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Reconciliation unavailable." });
});

test("real job lifecycle reads the saved session and verifies results without a paid POST", async t => {
  const { db, sqlite, seed } = database(); t.after(() => sqlite.close());
  const { run, owner } = await seed("saved");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    requests++;
    assert.equal(init?.method, "GET", "Scheduler must never submit or resume model/tool work");
    const url = String(input);
    if (url.includes("/turns?")) return Response.json({ data: [{
      id: "turn_saved", session_id: "sess_saved", created_at: 1, status: "completed",
    }], has_more: false });
    if (url.includes("/items?")) return Response.json({ data: [{
      id: "final_saved", type: "message", role: "assistant", phase: "final_answer", status: "completed",
      turn_id: "turn_saved", content: [{ type: "output_text", text: JSON.stringify(DEMO_AGENT_OUTPUT) }],
    }], has_more: false });
    return Response.json({ id: "sess_saved", object: "agent.session", status: "idle", created_at: 1, required_actions: [] });
  });
  const response = await handleEvaluationReconciliationRequest(new Request("https://folio.test", {
    method: "POST", headers: { Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ ownerId: "someone-else", runId: "arbitrary", limit: 999 }),
  }), async () => db, env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "completed", attempted: 1, reconciled: 1, failed: 0 });
  assert.equal(requests, 3);
  const saved = await getEvaluationRun(db, owner, run.id);
  assert.equal(saved?.status, "completed");
  assert.equal(saved?.result?.failed, 0);
  assert.equal(saved?.publication, "private");
});

test("a waiting application tool remains private and requires explicit owner action", async t => {
  const { db, sqlite, seed } = database(); t.after(() => sqlite.close());
  const { run, owner } = await seed("waiting");
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "GET", "A scheduled read must not dispatch or return an application tool");
    if (String(input).includes("/turns?")) return Response.json({ data: [{
      id: "turn_waiting", session_id: "sess_waiting", created_at: 1, status: "waiting",
    }], has_more: false });
    if (String(input).includes("/items?")) return Response.json({ data: [], has_more: false });
    return Response.json({
      id: "sess_waiting", object: "agent.session", status: "requires_action", created_at: 1,
      required_actions: [{ type: "function_call", name: "get_saved_seo_report", call_id: "call_saved", arguments: {} }],
    });
  });
  const result = await runEvaluationReconciliationJob(db, env);
  assert.equal(result.reconciled, 1);
  const saved = await getEvaluationRun(db, owner, run.id);
  assert.equal(saved?.status, "requires_action");
  assert.equal(saved?.result, null);
  assert.equal(saved?.publication, "private");
});

test("cron worker has no public fetch handler and only calls its configured service binding", async () => {
  assert.equal("fetch" in scheduler, false);
  let calls = 0;
  const schedulerEnv = {
    ...env,
    FOLIO_APP: { fetch: async (input: string, init?: RequestInit) => {
      calls++;
      assert.equal(input, "https://folio.internal/api/internal/evaluations/reconcile");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${secret}`);
      assert.equal(init?.redirect, "error");
      return Response.json({ status: "completed" });
    } },
  } as unknown as EvaluationSchedulerEnvironment;
  await triggerEvaluationReconciliation({ ...schedulerEnv, EVALUATION_RECONCILE_ENABLED: "false" });
  await triggerEvaluationReconciliation({ ...schedulerEnv, EVALUATION_RECONCILE_SECRET: "" });
  assert.equal(calls, 0);
  await triggerEvaluationReconciliation(schedulerEnv);
  assert.equal(calls, 1);
});
