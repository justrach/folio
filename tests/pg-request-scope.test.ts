import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { resolve } from "node:path";
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

test("separately loaded application and Worker modules share only the request coordinator", async context => {
  const folder = await mkdtemp(join(tmpdir(), "folio-scope-bundles-"));
  context.after(() => rm(folder, {recursive: true, force: true}));
  const source = await readFile(resolve("src/lib/pg/request-scope.ts"), "utf8");
  const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const paths = [join(folder,"application.mjs"),join(folder,"worker.mjs")];
  await Promise.all(paths.map(path => writeFile(path,compiled)));
  const [copy, workerCopy] = await Promise.all(paths.map(path => import(pathToFileURL(path).href)));
  assert.notEqual(copy.requestResource,workerCopy.requestResource,"The test must evaluate two independent module bodies");
  let created = 0, ended = 0;
  await withDatabaseRequest(async () => {
    const create = () => ({id: ++created, async end() { ended++; }});
    const worker = requestResource("database", create);
    assert.equal(copy.requestResource("database", create), worker);
    assert.equal(workerCopy.requestResource("database", create), worker);
  });
  assert.equal(created, 1); assert.equal(ended, 1);
});
