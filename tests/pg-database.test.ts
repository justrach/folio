import assert from "node:assert/strict";
import test from "node:test";
import { createPostgresDatabase, PgStatement, type PgExecutor } from "../src/lib/pg/database";

function fakeExecutor() {
  const calls: { sql: string; values: unknown[] }[] = [];
  let rowCount = 1;
  const executor: PgExecutor = {
    query: async <T,>(sql: string, values: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [{ id: "row-1" } as unknown as T], rowCount };
    },
  };
  return { executor, calls, setRowCount: (value: number) => { rowCount = value; } };
}

test("prepare/bind/first translates placeholders and returns the first row", async () => {
  const { executor, calls } = fakeExecutor();
  const db = createPostgresDatabase(executor);
  const row = await db.prepare("SELECT id FROM runs WHERE user_id = ?").bind("alice").first<{ id: string }>();
  assert.deepEqual(row, { id: "row-1" });
  assert.deepEqual(calls[0], { sql: "SELECT id FROM runs WHERE user_id = $1", values: ["alice"] });
});

test("bind chains and does not mutate the original statement", async () => {
  const { executor, calls } = fakeExecutor();
  const db = createPostgresDatabase(executor);
  const base = db.prepare("SELECT ? AS a, ? AS b");
  await base.bind(1).first();
  await base.bind(1).bind(2).first();
  assert.deepEqual(calls[0].values, [1]);
  assert.deepEqual(calls[1].values, [1, 2]);
  assert.ok(base instanceof PgStatement);
});

test("first returns null when no rows match", async () => {
  const executor: PgExecutor = { query: async () => ({ rows: [], rowCount: 0 }) };
  const db = createPostgresDatabase(executor);
  assert.equal(await db.prepare("SELECT 1").first(), null);
});

test("all keeps the D1 result shape and run maps rowCount to meta.changes", async () => {
  const { executor, setRowCount } = fakeExecutor();
  const db = createPostgresDatabase(executor);
  const all = await db.prepare("SELECT id FROM runs").all<{ id: string }>();
  assert.equal(all.success, true);
  assert.deepEqual(all.results, [{ id: "row-1" }]);
  assert.deepEqual(all.meta, { changes: 0 });
  setRowCount(0);
  assert.deepEqual(await db.prepare("UPDATE runs SET status = ?").bind("done").run(), { success: true, meta: { changes: 0 } });
  setRowCount(3);
  assert.deepEqual(await db.prepare("DELETE FROM runs").run(), { success: true, meta: { changes: 3 } });
});

test("batch runs every statement on the transaction executor when one is available", async () => {
  const seen: string[] = [];
  const pool: PgExecutor = {
    query: async () => { seen.push("pool"); return { rows: [], rowCount: 1 }; },
  };
  const tx: PgExecutor = {
    query: async () => { seen.push("tx"); return { rows: [], rowCount: 1 }; },
  };
  const db = createPostgresDatabase({
    ...pool,
    transaction: async <T,>(work: (executor: PgExecutor) => Promise<T>) => work(tx),
  });
  await db.batch([db.prepare("SELECT 1"), db.prepare("SELECT ?").bind(2)]);
  assert.deepEqual(seen, ["tx", "tx"]);
});

test("unsupported SQLite constructs fail at execution rather than silently", async () => {
  const { executor } = fakeExecutor();
  const db = createPostgresDatabase(executor);
  await assert.rejects(() => db.prepare("SELECT * FROM t GLOB 'x*'").all(), /Unsupported SQLite construct/);
});
