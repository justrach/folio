import assert from "node:assert/strict";
import test from "node:test";
import { eq, getTableColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../src/lib/auth-schema-pg";

const dialect = new PgDialect();

test("PostgreSQL auth schema keeps D1 epoch milliseconds and stable identities", () => {
  const milliseconds = 1_726_000_000_123;
  const date = new Date(milliseconds);
  for (const [table, names] of [
    [schema.user, ["createdAt", "updatedAt"]],
    [schema.session, ["expiresAt", "createdAt", "updatedAt"]],
    [schema.account, ["accessTokenExpiresAt", "refreshTokenExpiresAt", "createdAt", "updatedAt"]],
    [schema.verification, ["expiresAt", "createdAt", "updatedAt"]],
  ] as const) {
    const columns = Object.values(getTableColumns(table));
    for (const name of names) {
      const column = columns.find((item) => item.name === name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
      assert.ok(column, `${name} must map to the imported column`);
      assert.equal(column.getSQLType(), "bigint");
      assert.equal(column.mapToDriverValue(date), String(milliseconds));
      assert.deepEqual(column.mapFromDriverValue(String(milliseconds)), date);
    }
  }
  const query = dialect.sqlToQuery(eq(schema.session.expiresAt, date));
  assert.deepEqual(query.params, [String(milliseconds)], "date comparisons must use imported epoch values");
  assert.equal(schema.session.token.name, "token");
  assert.equal(schema.account.password.name, "password");
  assert.equal(schema.account.accessToken.name, "access_token");
  assert.equal(schema.account.refreshToken.name, "refresh_token");
  assert.equal(schema.account.idToken.name, "id_token");
  assert.equal(schema.user.emailVerified.getSQLType(), "boolean");
  assert.equal(schema.rateLimit.lastRequest.getSQLType(), "bigint");
  assert.equal(schema.rateLimit.lastRequest.mapFromDriverValue("1726000000123"), milliseconds);
});
