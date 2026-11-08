import assert from "node:assert/strict";
import test from "node:test";
import { requestResource, withDatabaseRequest } from "../src/lib/pg/request-scope";

test("database resources share within one request and never cross concurrent requests", async () => {
  let created = 0, ended = 0;
  const create = () => ({ id: ++created, async end() { ended++; } });
  const ids = await Promise.all(Array.from({ length: 30 }, () => withDatabaseRequest(async () => {
    const first = requestResource("database", create);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requestResource("database", create), first);
    return first.id;
  })));
  assert.equal(new Set(ids).size, 30); assert.equal(ended, 30);
});

test("failed writes close resources once without retrying the work", async () => {
  let writes = 0, ended = 0;
  await assert.rejects(withDatabaseRequest(async () => {
    requestResource("database", () => ({ async end() { ended++; } }));
    writes++; throw new Error("Ambiguous write failure");
  }), /Ambiguous write/);
  assert.equal(writes, 1); assert.equal(ended, 1);
});

test("local calls outside a Worker scope get independent resources", async () => {
  const make = () => ({ async end() {} });
  assert.notEqual(requestResource("db", make), requestResource("db", make));
});
