import pg, { type Pool, type PoolClient, type QueryResult } from "pg";

// D1 stores integer millisecond timestamps and counts as JavaScript numbers.
// PostgreSQL's BIGINT parser defaults to strings; reject values JS cannot preserve.
pg.types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("PostgreSQL integer exceeds JavaScript's safe range.");
  return number;
});
// PostgreSQL SUM(bigint) returns NUMERIC, unlike D1's numeric aggregate rows.
pg.types.setTypeParser(1700, (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || (/^-?\d+$/.test(value) && !Number.isSafeInteger(number)))
    throw new Error("PostgreSQL numeric exceeds JavaScript's safe range.");
  return number;
});

/** Convert D1's positional placeholders without touching quoted JSON paths or comments. */
export function postgresSql(input: string): string {
  let sql = input.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  const ignoreConflict = sql !== input;
  // A standalone parameter in an IS NULL test has no inferred PostgreSQL type.
  sql = sql.replace(/\?\s+IS\s+NULL\b/gi, "CAST(? AS text) IS NULL");
  if (ignoreConflict) {
    const returning = /\bRETURNING\b/i.exec(sql);
    sql = returning
      ? `${sql.slice(0, returning.index)} ON CONFLICT DO NOTHING ${sql.slice(returning.index)}`
      : `${sql} ON CONFLICT DO NOTHING`;
  }
  let output = "", position = 1;
  let quote: "'" | '"' | null = null, comment: "line" | "block" | null = null;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i], next = sql[i + 1];
    if (comment === "line") { output += char; if (char === "\n") comment = null; continue; }
    if (comment === "block") { output += char; if (char === "*" && next === "/") { output += next; i++; comment = null; } continue; }
    if (quote) {
      output += char;
      if (char === quote) {
        if (next === quote) { output += next; i++; }
        else quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") { output += char + next; i++; comment = "line"; continue; }
    if (char === "/" && next === "*") { output += char + next; i++; comment = "block"; continue; }
    if (char === "'" || char === '"') { output += char; quote = char; continue; }
    output += char === "?" ? `$${position++}` : char;
  }
  return output;
}

function databaseError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    throw new Error("UNIQUE constraint failed in PostgreSQL", { cause: error });
  }
  throw error;
}

function d1Result<T>(result: QueryResult<T & pg.QueryResultRow>) {
  return {
    results: result.rows as T[],
    success: true,
    meta: { changes: result.command === "SELECT" ? 0 : result.rowCount ?? 0, duration: 0,
      last_row_id: 0, rows_read: result.command === "SELECT" ? result.rows.length : 0,
      rows_written: result.command === "SELECT" ? 0 : result.rowCount ?? 0 },
  };
}

export class PgD1Statement {
  private values: unknown[] = [];
  constructor(readonly database: PgD1Database, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async execute(client?: PoolClient) {
    return this.database.execute(this.sql, this.values, client);
  }
  async all<T>() { return d1Result<T>(await this.execute()); }
  async first<T>(column?: string): Promise<T | null> {
    const row = (await this.execute()).rows[0];
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }
  async run<T>() { return d1Result<T>(await this.execute()); }
  async raw<T>() { return (await this.execute()).rows.map(row => Object.values(row)) as T[]; }
}

/** Temporary D1-shaped bridge while existing stores are converted to native PG.
 * Every app write uses the same transaction lock, preserving D1's serialized
 * count-then-write gates across Worker instances (including batch calls).
 */
export class PgD1Database {
  constructor(readonly pool: Pool) {}
  prepare(sql: string) { return new PgD1Statement(this, sql); }
  private async lockWrites(client: PoolClient) {
    const gate = await client.query("SELECT id FROM folio_write_gate WHERE id=1 FOR UPDATE");
    if (gate.rowCount !== 1) throw new Error("PostgreSQL write gate is missing; refusing an unprotected write.");
  }
  async execute(sql: string, values: unknown[], client?: PoolClient) {
    const text = postgresSql(sql);
    try {
      if (client) return await client.query(text, values);
      if (/^\s*(SELECT|VALUES|EXPLAIN)\b/i.test(text)) return await this.pool.query(text, values);
      const connection = await this.pool.connect();
      try {
        await connection.query("BEGIN");
        await this.lockWrites(connection);
        const result = await connection.query(text, values);
        await connection.query("COMMIT");
        return result;
      } catch (error) { await connection.query("ROLLBACK"); throw error; }
      finally { connection.release(); }
    } catch (error) { databaseError(error); }
  }
  async batch(statements: PgD1Statement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.lockWrites(client);
      const results = [];
      for (const statement of statements) {
        if (statement.database !== this) throw new Error("Cannot batch statements from different databases.");
        results.push(d1Result(await statement.execute(client)));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) { await client.query("ROLLBACK"); databaseError(error); }
    finally { client.release(); }
  }
}
