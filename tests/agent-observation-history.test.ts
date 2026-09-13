import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { createEvaluationRun } from "../src/lib/eval-store";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { managedRunAccess } from "../src/lib/agent-runs";
import { getAgentObservation } from "../src/lib/agent-observation-service";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../migrations/", import.meta.url)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  for (const owner of ["alice", "bob"]) sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(owner, owner, `${owner}@example.test`, Date.now(), Date.now());
  const prepare = (sql: string) => {
    let values: SQLInputValue[] = [];
    const result = { bind(...bound: SQLInputValue[]) { values = bound; return result; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: sqlite.prepare(sql).all(...values), meta: { changes: 1 } }; },
      async run() { const change = sqlite.prepare(sql).run(...values); return { success: true, results: [], meta: { changes: change.changes } }; },
      batch() { const statement = sqlite.prepare(sql); if (/RETURNING\b/i.test(sql)) return { success: true, results: statement.all(...values) };
        statement.run(...values); return { success: true, results: [] }; },
    }; return result;
  };
  const db = { prepare, async batch(statements: ReturnType<typeof prepare>[]) {
    sqlite.exec("BEGIN"); try { const results = statements.map(statement => statement.batch()); sqlite.exec("COMMIT"); return results; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } } as unknown as D1Database;
  return { db, sqlite };
}

test("website history normalizes targets, isolates owners and preserves terminal attempts", async t => {
 const { db, sqlite } = database();
 t.mock.method(globalThis, "fetch", async () => { throw new Error("Saved reads must not fetch"); });
 try {
  const now = new Date(), env = {};
  sqlite.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").run("site", "alice", "https://example.com", "Fixture", now.getTime());
  const base = await createDemoEvaluationRun();
  const run = { ...base, id: "normalized-history", mode: "live" as const, targetUrl: "https://example.com/", siteName: "Fixture",
   model: managedRunAccess(env, "alice").model, expectedFacts: undefined,
   captures: base.captures.map(c => ({ ...c, capturedAt: now.toISOString() })), createdAt: now.toISOString(), updatedAt: now.toISOString() };
  await createEvaluationRun(db, "alice", run, { maxLivePerDay: 3 });
  const input = { kind: "website" as const, websiteId: "site" };
  const result = await getAgentObservation(db, "alice", input, env, { now });
  assert.equal(result.compatibleRun?.id, run.id);
  assert.equal(result.latestCompletedRun?.id, run.id);
  assert.equal(result.historyState, "fresh");
  assert.equal(result.compatibility.latestCompletedMatchesCurrent, true);
  sqlite.prepare("UPDATE sites SET name='Changed name' WHERE id='site'").run();
  const changed = await getAgentObservation(db, "alice", input, env, { now });
  assert.equal(changed.compatibleRun, null);
  assert.equal(changed.latestCompletedRun?.id, run.id);
  assert.equal(changed.historyState, "incompatible_history");
  await assert.rejects(getAgentObservation(db, "bob", input, env), /not found/);
  for (const status of ["failed", "cancelled"] as const) {
   sqlite.prepare("UPDATE evaluation_runs SET status=?,result_json=? WHERE id=?").run(status, JSON.stringify({ ...run, status, result: null }), run.id);
   const terminal = await getAgentObservation(db, "alice", input, env, { now });
   assert.equal(terminal.latestAttempt?.id, run.id);
   assert.equal(terminal.latestAttempt?.status, status);
   assert.equal(terminal.currentAttempt, null);
   assert.equal(terminal.latestCompletedRun, null);
   assert.equal(terminal.historyState, "terminal_attempt");
   assert.equal(terminal.freshness.fresh, false);
  }

 } finally { sqlite.close(); }
});
