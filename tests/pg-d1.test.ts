import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PgD1Database, postgresSql } from "../src/lib/pg-d1";

test("PostgreSQL bridge translates D1 placeholders without changing quoted JSON paths", () => {
  assert.equal(postgresSql("SELECT json_extract(body,'$.?') FROM records WHERE id=? AND (? IS NULL OR owner=?) -- ?\n"),
    "SELECT json_extract(body,'$.?') FROM records WHERE id=$1 AND (CAST($2 AS text) IS NULL OR owner=$3) -- ?\n");
  assert.equal(postgresSql("INSERT OR IGNORE INTO records (id) SELECT ? RETURNING id"),
    "INSERT INTO records (id) SELECT $1  ON CONFLICT DO NOTHING RETURNING id");
});

test("PostgreSQL bridge commits a batch together and rolls it back on error", async () => {
  const calls: string[] = [];
  let fail = false;
  const client = {
    query: async (text: string) => {
      calls.push(text);
      if (fail && text.includes("INSERT INTO second")) throw new Error("insertion failed");
      return { rows: [], rowCount: 1, command: text.startsWith("INSERT") ? "INSERT" : "SELECT" };
    },
    release: () => calls.push("RELEASE"),
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const db = new PgD1Database(pool);
  const statements = [db.prepare("INSERT INTO first(id) VALUES(?)").bind("one"), db.prepare("INSERT INTO second(id) VALUES(?)").bind("two")];
  await db.batch(statements);
  assert.deepEqual(calls, ["BEGIN", "SELECT id FROM folio_write_gate WHERE id=1 FOR UPDATE", "INSERT INTO first(id) VALUES($1)", "INSERT INTO second(id) VALUES($1)", "COMMIT", "RELEASE"]);
  calls.length = 0;
  fail = true;
  await assert.rejects(db.batch(statements), /insertion failed/);
  assert.deepEqual(calls, ["BEGIN", "SELECT id FROM folio_write_gate WHERE id=1 FOR UPDATE", "INSERT INTO first(id) VALUES($1)", "INSERT INTO second(id) VALUES($1)", "ROLLBACK", "RELEASE"]);
});
