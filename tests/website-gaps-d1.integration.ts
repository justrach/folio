import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { authenticateAgentApiKey, createAgentApiKey } from "../src/lib/agent-api-key-store";
import { serveFolioMcp } from "../src/lib/folio-mcp";
import type { WebsiteGapsReport } from "../src/lib/website-gaps";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-website-gaps-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000028" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
}

test("D1: an agent reads one owned website's gaps over MCP from saved data, recording only its own activity", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-website-gaps-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-a','alice','https://www.example-tool.com/','Example tool',?,0)").bind(Date.now()).run();
    // Illustrative saved lookups: an older one with numbers, a newer one that returned nothing.
    const result = (fetchedAt: string, organic: object, backlinks: object) => JSON.stringify({ id: "r", domain: "example-tool.com", provider: "DataForSEO", fetchedAt, status: "complete", organic, backlinks });
    await db.batch([
      db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES('seo-old','alice','example-tool.com',1000,'2026-11-01T00:00:00.000Z',?)")
        .bind(result("2026-11-01T00:00:00.000Z", { status: "empty", data: null }, { status: "success", data: { backlinks: 4, referringDomains: 2, brokenBacklinks: 0 } })),
      db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES('seo-new','alice','example-tool.com',2000,'2026-11-10T00:00:00.000Z',?)")
        .bind(result("2026-11-10T00:00:00.000Z", { status: "error", data: null }, { status: "error", data: null })),
    ]);
    const counts = async () => JSON.stringify((await db.prepare("SELECT (SELECT COUNT(*) FROM sites) s,(SELECT COUNT(*) FROM seo_reports) r,(SELECT COUNT(*) FROM agent_index_asks) a,(SELECT COUNT(*) FROM keyword_benchmark_runs) k").first()));
    const before = await counts();
    const connect = async (owner: string) => {
      const key = await createAgentApiKey(db, owner, { name: "Gap reader", scopes: ["read"] });
      const client = new Client({ name: "website-gaps-fixture", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), { db, principal: await authenticateAgentApiKey(db, key.token, "read"), env: {} }) }));
      return client;
    };
    const alice = await connect("alice"), bob = await connect("bob");
    try {
      const listed = (await alice.listTools()).tools.find(tool => tool.name === "folio_website_gaps");
      assert.ok(listed?.outputSchema, "the tool publishes its output schema");
      const response = await alice.callTool({ name: "folio_website_gaps", arguments: { websiteId: "site-a" } });
      assert.equal(response.isError, undefined, JSON.stringify(response));
      const report = (response.structuredContent as { result: WebsiteGapsReport }).result;
      assert.equal(report.website.domain, "example-tool.com");
      // The newer empty lookup does not hide the older one with numbers.
      assert.deepEqual([report.search.state, report.search.reportId, report.search.referringDomains, report.search.rankingKeywords.state], ["measured", "seo-old", { state: "value", value: 2 }, "none"]);
      assert.deepEqual(report.gaps.map(gap => gap.id), ["google-no-rankings", "links-few"]);
      // D1 has no crawl or ranking tables: those read as unavailable, not as empty.
      assert.deepEqual([report.google.state, report.crawl.state], ["unavailable", "unavailable"]);
      assert.equal(report.aiAnswers.source, "live-published-data"); assert.ok((report.aiAnswers.publishedQuestions ?? 0) > 0);
      assert.deepEqual(report.aiAnswers.yourQuestions, { completed: 0, named: 0 });
      assert.match(report.summary, /^Google doesn’t show example-tool\.com for any US search yet\. Only 2 websites link to it\./);
      // Another owner cannot read it, and an unknown ID is a clear error.
      const denied = await bob.callTool({ name: "folio_website_gaps", arguments: { websiteId: "site-a" } });
      assert.equal((denied.structuredContent as { error: { code: string } }).error.code, "not_found");
      // The read changes no saved record; it adds one line to the owner's agent activity.
      assert.equal(await counts(), before.replace('"a":0', '"a":1'), "reading gaps records one agent ask and nothing else");
      assert.equal((report as WebsiteGapsReport & { recorded: boolean }).recorded, true);
      assert.equal(provider.mock.callCount(), 0);
    } finally { await alice.close(); await bob.close(); }
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
