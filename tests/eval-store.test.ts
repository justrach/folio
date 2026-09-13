import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createEvaluationRun, getEvaluationRun, getEvaluationUsage, listEvaluationRuns,
  updateEvaluationRun, createEvaluationBundle, EvalStoreError,
} from "../src/lib/eval-store";
import { createDemoEvaluationRun, verifyEvaluationResult } from "../src/lib/eval-verifier";
import type { EvaluationRun } from "../src/lib/evals";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";

/** Exercise the real migration and SQL against SQLite, behind the small D1 adapter. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial.sql", "0002_evaluations.sql", "0005_eval_evidence_deletion.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(id, id, `${id}@example.com`, Date.now(), Date.now());
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
  return { db, sqlite };
}

async function liveRun(): Promise<EvaluationRun> {
  return { ...await createDemoEvaluationRun(), id: crypto.randomUUID(), mode: "live", status: "queued", captures: [], events: [], result: null, agentOutput: undefined, expectedFacts: undefined };
}

test("private run IDs, history, and writes are scoped to the authenticated owner", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const alice = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  assert.equal((await getEvaluationRun(db, "alice", alice.id))?.id, alice.id);
  assert.equal(await getEvaluationRun(db, "bob", alice.id), null);
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.deepEqual(await listEvaluationRuns(db, "bob"), []);
  await assert.rejects(updateEvaluationRun(db, "bob", { ...alice, error: "Cross-account mutation" }), EvalStoreError);
  assert.equal((await getEvaluationRun(db, "alice", alice.id))?.error, null);
});

test("concurrent starts reserve exactly one active run before provider submission", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const first = await liveRun(); const second = await liveRun();
  const attempts = await Promise.allSettled([
    createEvaluationRun(db, "alice", first, { maxLivePerDay: 10 }),
    createEvaluationRun(db, "alice", second, { maxLivePerDay: 10 }),
  ]);
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.ok(await createEvaluationRun(db, "bob", await liveRun()));
});

test("failed managed attempts retain the daily reservation and demos do not spend it", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  const run = await createEvaluationRun(db, "alice", await liveRun());
  await updateEvaluationRun(db, "alice", { ...run, status: "failed", error: "Provider submission could not be confirmed." });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
  assert.equal((await listEvaluationRuns(db, "alice")).filter(saved => saved.mode === "live").length, 1);
});

test("usage starts at the default allowance, excludes demos, and requires an owner", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const empty = { liveAttemptsLast24Hours: 0, remainingLiveRuns: 1, activeRunId: null, activeRunStatus: null };
  assert.deepEqual(await getEvaluationUsage(db, "alice"), empty);
  await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  assert.deepEqual(await getEvaluationUsage(db, "alice"), empty);
  await assert.rejects(getEvaluationUsage(db, ""), (error: unknown) => error instanceof EvalStoreError && error.status === 401);
  await assert.rejects(getEvaluationUsage(db, "alice", 0), (error: unknown) => error instanceof EvalStoreError && error.status === 500);
});

test("usage counts failed and deleted attempts without leaking another owner's active run", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const deleted = await createEvaluationRun(db, "alice", { ...await liveRun(), status: "completed" }, { maxLivePerDay: 10 });
  await deleteEvaluationEvidence(db, "alice", deleted.id, deleted.revision);
  await createEvaluationRun(db, "alice", { ...await liveRun(), status: "failed" }, { maxLivePerDay: 10 });
  const bob = await createEvaluationRun(db, "bob", await liveRun());
  assert.equal((await listEvaluationRuns(db, "alice")).length, 1);
  assert.deepEqual(await getEvaluationUsage(db, "alice"), {
    liveAttemptsLast24Hours: 2, remainingLiveRuns: 0, activeRunId: null, activeRunStatus: null,
  });
  assert.equal((await getEvaluationUsage(db, "alice", 3)).remainingLiveRuns, 1);
  assert.deepEqual(await getEvaluationUsage(db, "bob"), {
    liveAttemptsLast24Hours: 1, remainingLiveRuns: 0, activeRunId: bob.id, activeRunStatus: "queued",
  });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
});

test("usage reports every active state even after its reservation leaves the daily window", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const earlier = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  let run = await createEvaluationRun(db, "alice", { ...await liveRun(), createdAt: earlier, updatedAt: earlier });
  for (const status of ["queued", "running", "requires_action"] as const) {
    if (run.status !== status) run = await updateEvaluationRun(db, "alice", { ...run, status });
    assert.deepEqual(await getEvaluationUsage(db, "alice"), {
      liveAttemptsLast24Hours: 0, remainingLiveRuns: 1, activeRunId: run.id, activeRunStatus: status,
    });
  }
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun()),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
  await updateEvaluationRun(db, "alice", { ...run, status: "cancelled" });
  assert.equal((await getEvaluationUsage(db, "alice")).activeRunId, null);
});

test("usage uses the same inclusive rolling 24-hour boundary as creation enforcement", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  for (const createdAt of [now - 86_400_001, now - 86_400_000, now]) {
    const at = new Date(createdAt).toISOString();
    await createEvaluationRun(db, "alice", { ...await liveRun(), status: "completed", createdAt: at, updatedAt: at }, { maxLivePerDay: 10 });
  }
  assert.deepEqual(await getEvaluationUsage(db, "alice", 3), {
    liveAttemptsLast24Hours: 2, remainingLiveRuns: 1, activeRunId: null, activeRunStatus: null,
  });
  await assert.rejects(createEvaluationRun(db, "alice", await liveRun(), { maxLivePerDay: 2 }),
    (error: unknown) => error instanceof EvalStoreError && error.status === 429);
});

test("optimistic updates reject stale polling and terminal runs cannot silently reopen", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await liveRun());
  const running = await updateEvaluationRun(db, "alice", { ...run, status: "running", sessionId: "as_fixture" });
  assert.equal(running.revision, 1);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...run, status: "failed" }), EvalStoreError);
  const completed = await updateEvaluationRun(db, "alice", { ...running, status: "completed" });
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, status: "running" }), EvalStoreError);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, mode: "demo" }), EvalStoreError);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...completed, sessionId: "as_other" }), EvalStoreError);
  assert.equal((await getEvaluationRun(db, "alice", run.id))?.status, "completed");
});

test("a private JSON export contains a reproducible frozen verification bundle", async () => {
  const run = await createDemoEvaluationRun();
  const bundle = createEvaluationBundle(run);
  assert.equal(bundle.publication, "private");
  const serialized = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
  const reproduced = await verifyEvaluationResult(serialized.run, serialized.run.agentOutput);
  assert.deepEqual(reproduced, run.result);
  assert.ok(!Object.hasOwn(bundle.run, "userId"));
  assert.ok(!Object.hasOwn(bundle.run, "ownerId"));
});

test("deleting an account removes its private captured evaluation evidence", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  sqlite.prepare("DELETE FROM user WHERE id = ?").run("alice");
  assert.equal(await getEvaluationRun(db, "alice", run.id), null);
});
