/** A minimal D1-compatible database over `pg`.
 *
 * Stores call `db.prepare(sql).bind(...).first()/.all()/.run()` and read
 * `meta.changes`. This adapter keeps that contract so a ported store changes one
 * import instead of 132 queries. SQL goes through ./compat, which throws on
 * anything it cannot translate faithfully.
 */
import { toPostgres } from "./compat";

export type PgQueryResult<T> = { rows: T[]; rowCount: number | null };
export type PgExecutor = {
  query<T = Record<string, unknown>>(sql: string, values: unknown[]): Promise<PgQueryResult<T>>;
  /** Optional: execute work inside a transaction on one connection. */
  transaction?<T>(work: (executor: PgExecutor) => Promise<T>): Promise<T>;
};

export type D1LikeResult<T> = {
  success: true;
  results: T[];
  meta: { changes: number };
};

export type D1LikeStatement = {
  bind(...values: unknown[]): D1LikeStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1LikeResult<T>>;
  run(): Promise<{ success: true; meta: { changes: number } }>;
};

export type D1LikeDatabase = {
  prepare(sql: string): D1LikeStatement;
  batch<T = unknown>(statements: D1LikeStatement[]): Promise<D1LikeResult<T>[]>;
};

/** Statements keep their SQL and bindings so a transaction can re-run them on
 * the transaction's connection instead of the pool. */
export class PgStatement implements D1LikeStatement {
  constructor(
    private readonly executor: PgExecutor,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1LikeStatement {
    return new PgStatement(this.executor, this.sql, [...this.values, ...values]);
  }

  withExecutor(executor: PgExecutor) {
    return new PgStatement(executor, this.sql, this.values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.executor.query<T>(toPostgres(this.sql), this.values);
    return result.rows[0] ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1LikeResult<T>> {
    const result = await this.executor.query<T>(toPostgres(this.sql), this.values);
    return { success: true, results: result.rows, meta: { changes: 0 } };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = await this.executor.query(toPostgres(this.sql), this.values);
    return { success: true, meta: { changes: result.rowCount ?? 0 } };
  }
}

export function createPostgresDatabase(executor: PgExecutor): D1LikeDatabase {
  return {
    prepare: (sql: string) => new PgStatement(executor, sql),
    batch: async <T,>(statements: D1LikeStatement[]) => {
      const runAll = async (target: PgExecutor) => {
        const results: D1LikeResult<T>[] = [];
        for (const item of statements) {
          const statement = item instanceof PgStatement ? item.withExecutor(target) : item;
          results.push(await statement.all<T>());
        }
        return results;
      };
      return executor.transaction ? executor.transaction(runAll) : runAll(executor);
    },
  };
}
