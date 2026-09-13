import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";
import {
  createEvaluationRun, getEvaluationRun, listEvaluationRuns, updateEvaluationRun, EvalStoreError,
} from "../src/lib/eval-store";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial.sql", "0002_evaluations.sql", "0005_eval_evidence_deletion.sql", "0007_agent_tool_calls.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(id, id, `${id}@example.com`, Date.now(), Date.now());
  let beforeDeletion: (() => void) | undefined;
  const db = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values: SQLInputValue[]) {
          return {
            async run() {
              if (sql.includes("deleted_at = ?")) beforeDeletion?.();
              return { success: true, meta: { changes: Number(statement.run(...values).changes) } };
            },
            async first() {
              if (sql.includes("deleted_at = ?")) beforeDeletion?.();
              return statement.get(...values) ?? null;
            },
            async all() { return { success: true, results: statement.all(...values) }; },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, sqlite, beforeDeletion: (callback: () => void) => { beforeDeletion = callback; } };
}

const hasStatus = (status: number) => (error: unknown) => error instanceof EvalStoreError && error.status === status;

test("deletion erases all saved evidence while retaining only a quota tombstone", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", {
    ...await createDemoEvaluationRun(), mode: "live", sessionId: "as_private_session",
    error: "Private provider detail", usage: { privateDetails: "usage-secret" },
  });
  sqlite.prepare(`INSERT INTO agent_tool_calls
    (run_id,user_id,session_id,turn_id,call_id,tool_name,state,created_at,updated_at)
    VALUES(?,?,?,?,?,'read_saved_seo_report','submitted',?,?)`)
    .run(run.id, "alice", "as_private_session", "turn_private", "call_private", Date.now(), Date.now());
  const result = await deleteEvaluationEvidence(db, "alice", run.id, run.revision);
  assert.equal(result.scope, "folio-saved-evidence");
  assert.equal(result.remoteSessionDeleted, false);
  const row = sqlite.prepare("SELECT * FROM evaluation_runs WHERE id = ?").get(run.id)!;
  assert.equal(row.result_json, "{}");
  assert.equal(row.target_url, "");
  assert.equal(row.suite_version, "");
  assert.equal(row.session_id, null);
  assert.equal(row.created_at, Date.parse(run.createdAt));
  assert.equal(row.mode, "live");
  assert.equal(row.status, "completed");
  assert.equal(row.revision, run.revision + 1);
  assert.ok(Number(row.deleted_at) > 0);
  assert.ok(!JSON.stringify(row).includes("Sable"));
  assert.ok(!JSON.stringify(row).includes("private_session"));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_tool_calls WHERE run_id = ?").get(run.id)?.count, 0);
  assert.equal(await getEvaluationRun(db, "alice", run.id), null);
  assert.deepEqual(await listEvaluationRuns(db, "alice"), []);
  await assert.rejects(updateEvaluationRun(db, "alice", { ...run, revision: run.revision + 1 }), hasStatus(409));
  await assert.rejects(createEvaluationRun(db, "alice", {
    ...await createDemoEvaluationRun(), mode: "live", status: "queued",
  }), hasStatus(429));
});

test("another owner cannot delete or probe saved evidence, and repeat deletion is unavailable", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  await assert.rejects(deleteEvaluationEvidence(db, "bob", run.id, run.revision), hasStatus(404));
  assert.equal((await getEvaluationRun(db, "alice", run.id))?.captures.length, run.captures.length);
  await deleteEvaluationEvidence(db, "alice", run.id, run.revision);
  await assert.rejects(deleteEvaluationEvidence(db, "alice", run.id, run.revision), hasStatus(404));
});

test("active and action-required sessions must reach a terminal state before evidence deletion", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  for (const status of ["queued", "running", "requires_action"] as const) {
    const run = await createEvaluationRun(db, "alice", { ...await createDemoEvaluationRun(), status });
    await assert.rejects(deleteEvaluationEvidence(db, "alice", run.id, run.revision), hasStatus(409));
    assert.equal((await getEvaluationRun(db, "alice", run.id))?.status, status);
    const cancelled = await updateEvaluationRun(db, "alice", { ...run, status: "cancelled" });
    await deleteEvaluationEvidence(db, "alice", run.id, cancelled.revision);
  }
});

test("stale revisions and a concurrent change cannot erase a newer saved return", async t => {
  const context = database(); t.after(() => context.sqlite.close());
  const run = await createEvaluationRun(context.db, "alice", await createDemoEvaluationRun());
  await assert.rejects(deleteEvaluationEvidence(context.db, "alice", run.id, run.revision + 1), hasStatus(409));
  context.beforeDeletion(() => {
    context.sqlite.prepare("UPDATE evaluation_runs SET revision = revision + 1 WHERE id = ?").run(run.id);
  });
  await assert.rejects(deleteEvaluationEvidence(context.db, "alice", run.id, run.revision), hasStatus(409));
  const row = context.sqlite.prepare("SELECT deleted_at,result_json FROM evaluation_runs WHERE id = ?").get(run.id)!;
  assert.equal(row.deleted_at, null);
  assert.ok(String(row.result_json).includes("Sable Analytics"));
});

test("invalid or unauthenticated deletion requests leave the record intact", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await createDemoEvaluationRun());
  await assert.rejects(deleteEvaluationEvidence(db, "", run.id, 0), hasStatus(401));
  for (const revision of [undefined, null, "0", -1, 0.5, Infinity])
    await assert.rejects(deleteEvaluationEvidence(db, "alice", run.id, revision), hasStatus(400));
  assert.ok(await getEvaluationRun(db, "alice", run.id));
});
