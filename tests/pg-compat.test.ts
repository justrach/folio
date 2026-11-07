import assert from "node:assert/strict";
import test from "node:test";
import { toPositional, toPostgres } from "../src/lib/pg/compat";

test("placeholders become positional and quoted question marks are left alone", () => {
  assert.equal(
    toPositional("SELECT * FROM runs WHERE user_id = ? AND note = 'what?' AND id = ?"),
    "SELECT * FROM runs WHERE user_id = $1 AND note = 'what?' AND id = $2",
  );
  assert.equal(toPositional("SELECT 'it''s ?' , ?"), "SELECT 'it''s ?' , $1");
});

test("json_extract becomes a jsonb text extraction", () => {
  const sql = toPostgres("SELECT json_extract(case_json,'$.targetUrl') AS url FROM cases WHERE id = ?");
  assert.equal(sql, "SELECT (case_json::jsonb #>> '{targetUrl}') AS url FROM cases WHERE id = $1");
});

test("nested json_extract paths keep their segments", () => {
  assert.equal(
    toPostgres("SELECT json_extract(result_json, '$.answer.text') FROM runs"),
    "SELECT (result_json::jsonb #>> '{answer,text}') FROM runs",
  );
});

test("json_each becomes jsonb_array_elements with the same alias", () => {
  const sql = toPostgres(
    "SELECT c.value FROM runs JOIN json_each(result_json,'$.captures') c ON true WHERE runs.id = ?",
  );
  assert.match(sql, /jsonb_array_elements\(\(result_json::jsonb #> '\{captures\}'\)\)/);
  assert.equal(sql.includes("json_each"), false);
});

test("sqlite date formatting maps to to_char with milliseconds", () => {
  const sql = toPostgres("SELECT strftime('%Y-%m-%dT%H:%M:%fZ',created_at/1000.0,'unixepoch') AS at FROM runs");
  assert.match(sql, /to_char\(to_timestamp\(created_at\/1000\.0\) AT TIME ZONE 'UTC'/);
});

test("two-argument MAX and MIN become GREATEST and LEAST, aggregates untouched", () => {
  assert.equal(
    toPostgres("UPDATE runs SET at = MAX(COALESCE(at, 0), ?) WHERE id = ?"),
    "UPDATE runs SET at = GREATEST(COALESCE(at, 0), $1) WHERE id = $2",
  );
  assert.equal(toPostgres("SELECT MAX(created_at) FROM runs"), "SELECT MAX(created_at) FROM runs");
  assert.equal(toPostgres("SELECT MIN(created_at) FROM runs"), "SELECT MIN(created_at) FROM runs");
});

test("INSERT OR IGNORE gains ON CONFLICT DO NOTHING before RETURNING", () => {
  assert.equal(
    toPostgres("INSERT OR IGNORE INTO rate_limit (id, key) VALUES (?, ?) RETURNING count"),
    "INSERT INTO rate_limit (id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING count",
  );
  assert.equal(
    toPostgres("INSERT OR IGNORE INTO tags (id) VALUES (?)"),
    "INSERT INTO tags (id) VALUES ($1) ON CONFLICT DO NOTHING",
  );
});

test("a realistic reservation query survives translation with no sqlite syntax left", () => {
  const sql = toPostgres(`INSERT INTO rate_limit (id, key, count, last_request)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN last_request < ? THEN 1 ELSE count + 1 END,
        last_request = CASE WHEN last_request < ? THEN ? ELSE last_request END
      WHERE last_request < ? OR count < 20
      RETURNING count`);
  assert.ok(sql.includes("$1") && sql.includes("$7"));
  assert.equal(sql.includes("?"), false);
  assert.match(sql, /\$\d+/);
});

test("unsupported sqlite constructs throw instead of running wrong SQL", () => {
  assert.throws(() => toPostgres("SELECT * FROM t GLOB 'x*'"), /Unsupported SQLite construct/);
  assert.throws(() => toPostgres("INSERT OR REPLACE INTO t (id) VALUES (?)"), /not supported/);
  assert.throws(() => toPostgres("SELECT json_extract(x, 'value') FROM t"), /Unsupported json_extract path/);
});
