import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { authenticateAgentApiKey, createAgentApiKey, revokeAgentApiKey } from "../src/lib/agent-api-key-store";
import { createOrganization } from "../src/lib/organizations";
import { loadGettingStarted } from "../src/lib/getting-started";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-getting-started-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000032" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["rach", "avery"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
}

test("D1: getting started reads each step from what Folio recorded, for that person only", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-getting-started-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const steps = async (userId: string) => Object.entries((await loadGettingStarted(db, userId)).done).filter(([, done]) => done).map(([id]) => id);
    assert.deepEqual(await steps("rach"), []);

    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-1','rach','https://example.com/','example.com',1,0)").run();
    await db.prepare("INSERT INTO search_console_reports(id,user_id,property,created_at,report_json,summary_json) VALUES('gsc-1','rach','sc-domain:example.com',1,'{}','{}')").run();
    assert.deepEqual(await steps("rach"), ["website", "search-console"]);

    // A key counts once it has been used; it still counts after it's revoked.
    const { key, token } = await createAgentApiKey(db, "rach", { name: "Rach's Claude Code", scopes: ["read"] });
    assert.deepEqual(await steps("rach"), ["website", "search-console"]);
    await authenticateAgentApiKey(db, token, "read");
    await revokeAgentApiKey(db, "rach", key.id);
    assert.deepEqual(await steps("rach"), ["website", "search-console", "agent"]);

    // Only an agent reading a website's report counts as asking what it's missing, not an index search.
    await db.prepare("INSERT INTO agent_index_asks(id,user_id,key_id,tool,question,domain,query_id,result_count,summary,created_at) VALUES('a1','rach',?,'search','seo tools',NULL,NULL,3,'Searched.',1)").bind(key.id).run();
    assert.ok(!(await steps("rach")).includes("ask"));
    await db.prepare("INSERT INTO agent_index_asks(id,user_id,key_id,tool,question,domain,query_id,result_count,summary,created_at) VALUES('a2','rach',?,'website',NULL,'example.com',NULL,2,'Read what example.com is missing.',2)").bind(key.id).run();
    await createOrganization(db, "rach", { name: "Example team" });
    assert.deepEqual(await steps("rach"), ["website", "search-console", "agent", "ask", "team"]);
    // Nothing Rach did counts for Avery.
    assert.deepEqual(await steps("avery"), []);
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
