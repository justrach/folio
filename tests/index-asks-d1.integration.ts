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
import { AgentApiError, authenticateAgentApiKey, createAgentApiKey } from "../src/lib/agent-api-key-store";
import { serveFolioMcp, type FolioToolContext } from "../src/lib/folio-mcp";
import { INDEX_ASK_HISTORY, listIndexAsks, recordIndexAsk } from "../src/lib/index-asks";
import { consumeRateSlot } from "../src/lib/seo-rate-limit";
import { crawlStats, crawlWebsite, searchCrawledPages } from "../src/lib/index-pages";
import { directPageSearch, PAGE_EMBEDDING_MODEL } from "../src/lib/page-vectors";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-index-ask-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000027" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
}
async function connect(context: FolioToolContext) {
  const client = new Client({ name: "index-ask-fixture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), context) }));
  const call = async <T,>(name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })).structuredContent as { result?: T; error?: { code: string } };
  return { client, call };
}
type Search = { source: string; items: { queryId: string }[]; nextCursor: string | null; total: number; recorded: boolean };

test("D1 saves a keyed agent's index asks for its owner only; the no-key endpoint and later pages save nothing", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-index-asks-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const count = async () => (await db.prepare("SELECT COUNT(*) AS n FROM agent_index_asks").first<{ n: number }>())!.n;
    const key = await createAgentApiKey(db, "alice", { name: "Research agent", scopes: ["read"] });
    const keyed = await connect({ db, principal: await authenticateAgentApiKey(db, key.token, "read"), env: {} });
    const open = await connect({ db, principal: { ownerId: "", keyId: "", scopes: [] }, env: {}, publicIndex: true });
    try {
      // The no-key endpoint reads the same published data and stores nothing.
      const anonymous = (await open.call<Search>("folio_index_search", { q: "project tools", limit: 3 })).result!;
      assert.equal(anonymous.source, "live-published-data"); assert.equal(anonymous.recorded, false); assert.ok(anonymous.total > 3);
      assert.equal((await open.call<{ recorded: boolean }>("folio_index_website", { domain: "notion.com" })).result!.recorded, false);
      assert.equal(await count(), 0);

      // A keyed ask is saved once; reading the next page of the same ask is not a new ask.
      const first = (await keyed.call<Search>("folio_index_search", { q: "project tools", limit: 3 })).result!;
      assert.equal(first.recorded, true); assert.deepEqual(first.items, anonymous.items);
      assert.equal((await keyed.call<Search>("folio_index_search", { q: "project tools", limit: 3, cursor: first.nextCursor })).result!.recorded, false);
      const answer = (await keyed.call<{ recorded: boolean; question: { id: string; query: string } }>("folio_index_answer", { queryId: first.items[0].queryId })).result!;
      const site = (await keyed.call<{ recorded: boolean; namedIn: number; domain: string }>("folio_index_website", { domain: "https://www.notion.com/pricing" })).result!;
      assert.equal(answer.recorded, true); assert.equal(site.recorded, true); assert.equal(site.domain, "notion.com");
      // The overview is orientation, not an ask; invalid input saves nothing. D1 has no crawl tables,
      // so the crawled index reports itself unavailable, saves no ask, and never reaches the no-key endpoint.
      await keyed.call("folio_index_overview");
      const pages = (await keyed.call<{ available: boolean; items: unknown[]; recorded: boolean }>("folio_index_pages", { q: "cron jobs" })).result!;
      assert.deepEqual([pages.available, pages.items.length, pages.recorded], [false, 0, false]);
      assert.equal((await open.call("folio_index_pages", { q: "cron jobs" })).error?.code, "not_found");
      assert.equal((await open.call<{ crawl: unknown }>("folio_index_website", { domain: "notion.com" })).result!.crawl, null);
      assert.equal((await keyed.call("folio_index_website", { domain: "localhost" })).error?.code, "invalid_input");
      assert.equal(await count(), 3);

      const feed = await listIndexAsks(db, "alice");
      assert.deepEqual(feed.items.map(item => item.tool).sort(), ["answer", "search", "website"]);
      assert.ok(feed.items.every(item => item.keyName === "Research agent"));
      const search = feed.items.find(item => item.tool === "search")!, lookup = feed.items.find(item => item.tool === "website")!, read = feed.items.find(item => item.tool === "answer")!;
      assert.equal(search.question, "project tools"); assert.equal(search.resultCount, first.total); assert.match(search.summary, /published answers? matched “project tools”/);
      assert.equal(lookup.domain, "notion.com"); assert.equal(lookup.resultCount, site.namedIn);
      assert.equal(read.queryId, answer.question.id); assert.ok(read.summary.includes(answer.question.query.slice(0, 40)));
      // Owner isolation, and no credential or owner id in the saved rows.
      assert.deepEqual((await listIndexAsks(db, "bob")).items, []);
      await assert.rejects(listIndexAsks(db, ""), error => error instanceof AgentApiError && error.status === 401);
      const raw = JSON.stringify((await db.prepare("SELECT * FROM agent_index_asks").all()).results);
      assert.equal(raw.includes(key.token), false);
      assert.equal(await recordIndexAsk(db, { ownerId: "missing-owner", keyId: null }, { tool: "search", question: "x", domain: null, queryId: null, resultCount: 0, summary: "x" }), false);

      // History is bounded per owner: the oldest rows fall away, another owner's rows do not.
      await recordIndexAsk(db, { ownerId: "bob", keyId: null }, { tool: "website", question: null, domain: "example.com", queryId: null, resultCount: 0, summary: "Bob's ask" });
      const filler = Array.from({ length: INDEX_ASK_HISTORY }, (_, i) => db.prepare("INSERT INTO agent_index_asks(id,user_id,key_id,tool,question,domain,query_id,result_count,summary,created_at) VALUES(?,?,NULL,'search',?,NULL,NULL,0,'Filler',?)").bind(`filler-${i}`, "alice", `filler ${i}`, 1_000 + i));
      for (let i = 0; i < filler.length; i += 50) await db.batch(filler.slice(i, i + 50));
      assert.equal(await recordIndexAsk(db, { ownerId: "alice", keyId: null }, { tool: "search", question: "newest\u0000 ask", domain: null, queryId: null, resultCount: 1, summary: "Newest" }), true);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_index_asks WHERE user_id='alice'").first<{ n: number }>())!.n, INDEX_ASK_HISTORY);
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM agent_index_asks WHERE id='filler-0'").first<{ n: number }>())!.n, 0);
      assert.equal((await listIndexAsks(db, "alice", 1)).items[0].question, "newest ask");
      assert.equal((await listIndexAsks(db, "bob")).items.length, 1);
      assert.equal(provider.mock.callCount(), 0);
    } finally { await keyed.client.close(); await open.client.close(); }

    // The no-key endpoint's counter: a full window refuses, a different caller is unaffected.
    const slots = await Promise.all(Array.from({ length: 8 }, () => consumeRateSlot(db, "folio:index-mcp:caller-a", 5, 60_000)));
    assert.equal(slots.filter(slot => slot !== null).length, 5);
    assert.equal(await consumeRateSlot(db, "folio:index-mcp:caller-b", 5, 60_000), 1);
    await db.prepare("UPDATE rate_limit SET last_request=? WHERE key=?").bind(Date.now() - 61_000, "folio:index-mcp:caller-a").run();
    assert.equal(await consumeRateSlot(db, "folio:index-mcp:caller-a", 5, 60_000), 1);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("crawled-page reads rank by terms, scope to one website, bound excerpts and never write", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-index-pages-")), current = runtime(directory);
  try {
    const db = await current.getD1Database("DB");
    // Illustrative rows shaped like the crawl tables, in an unqualified fixture schema.
    await db.batch([
      "CREATE TABLE pages (id TEXT PRIMARY KEY, entity_id TEXT, url TEXT, title TEXT, section TEXT, excerpt TEXT, fetched_at TEXT, site_domain TEXT)",
      "CREATE TABLE entities (id TEXT PRIMARY KEY, name TEXT, domain TEXT, category TEXT, description TEXT, counts TEXT, updated_at TEXT)",
      "CREATE TABLE sections (id TEXT PRIMARY KEY, entity_id TEXT, path TEXT, pages INTEGER, share REAL)",
    ].map(sql => db.prepare(sql)));
    const page = (id: string, site: string, url: string, title: string | null, excerpt: string, at: string | null = "2026-11-07T05:00:00.000Z") =>
      db.prepare("INSERT INTO pages VALUES(?,?,?,?,?,?,?,?)").bind(id, `ent_${site}`, url, title, "/docs", excerpt, at, site);
    await db.batch([
      page("p1", "host-a.com", "https://docs.host-a.com/cron", "Cron Jobs &amp; schedules", "Deploy a cron job in one step."),
      page("p2", "host-a.com", "https://host-a.com/blog/deploy", "Deploying apps", "This guide mentions a cron job once and how to deploy it."),
      page("p3", "host-b.com", "https://host-b.com/pricing", "Pricing", "Plans and limits. " + "x".repeat(900) + "\ud83d\ude00"),
      page("p4", "host-b.com", "javascript:alert(1)", "Cron job deploy", "cron job deploy"),
      page("p5", "host-b.com", "https://host-b.com/cron", null, "Only cron is mentioned here.", null),
      db.prepare("INSERT INTO entities VALUES(?,?,?,?,?,?,?)").bind("ent_host-a.com", "Host A", "host-a.com", "Deployment", "Hosting for apps.", JSON.stringify({ inventoryPages: 3970, sampledPages: 30, sections: 20, rankedKeywords: 50 }), "2026-11-07T04:55:21.026Z"),
      db.prepare("INSERT INTO sections VALUES(?,?,?,?,?)").bind("s1", "ent_host-a.com", "/docs", 400, 0.5),
      db.prepare("INSERT INTO sections VALUES(?,?,?,?,?)").bind("s2", "ent_host-a.com", "/blog", 90, 0.1),
    ]);
    const rows = async () => (await db.prepare("SELECT (SELECT COUNT(*) FROM pages)+(SELECT COUNT(*) FROM entities)+(SELECT COUNT(*) FROM sections) AS n").first<{ n: number }>())!.n;
    const before = await rows();

    assert.deepEqual(await crawlStats(db, ""), { available: true, pages: 5, domains: 2, updatedAt: "2026-11-07T05:00:00.000Z" });
    const all = await searchCrawledPages(db, { q: "How do I deploy a cron job?" }, "");
    assert.deepEqual([all.available, all.mode, all.terms.join(" ")], [true, "all_terms", "deploy cron job"]);
    // Title matches outrank excerpt-only matches; a non-http URL is never returned.
    assert.deepEqual(all.items.map(item => item.pageId), ["p1", "p2"]);
    assert.equal(all.items[0].title, "Cron Jobs & schedules"); assert.equal(all.items[0].domain, "host-a.com"); assert.equal(all.items[0].matchedTerms, 3);
    // A subdomain or full URL scopes to the registrable site.
    assert.deepEqual((await searchCrawledPages(db, { q: "cron", domain: "https://docs.host-b.com/anything" }, "")).items.map(item => item.pageId), ["p5"]);
    // Nothing has every word, so any-term matches are used and labelled.
    const any = await searchCrawledPages(db, { q: "pricing cron unicorns" }, "");
    assert.equal(any.mode, "any_term"); assert.ok(any.items.some(item => item.pageId === "p3") && any.items.some(item => item.pageId === "p1"));
    const long = any.items.find(item => item.pageId === "p3")!;
    assert.equal(Array.from(long.excerpt).length, 400);
    assert.deepEqual((await searchCrawledPages(db, { q: "zzzznothing" }, "")).items, []);
    assert.equal((await searchCrawledPages(db, { q: "cron", limit: 1 }, "")).items.length, 1);
    for (const input of [{ q: "!" }, { q: "cron", limit: 26 }, { q: "cron", domain: "localhost" }]) await assert.rejects(searchCrawledPages(db, input, ""), error => error instanceof AgentApiError && error.code === "invalid_input");

    // Semantic first, run by the app: one embedding request, one vector query, each with only its own credential.
    const sent: { host: string; key: string | null; body: Record<string, unknown> }[] = [];
    const row = (id: string, url: string, distance: number) => ({ id: `v2:${id}`, url, title: id === "p2" ? "Deploying apps" : "Pricing", excerpt: "Scheduled tasks run on a timer. " + "y".repeat(900), $dist: distance });
    let dimensions = 768, failures: number[] = [];
    const provider = (async (url: string | URL | Request, init?: RequestInit) => {
      const host = new URL(String(url)).hostname, body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push({ host, key: new Headers(init?.headers).get("authorization"), body });
      const failure = failures.shift();
      if (failure) return new Response("provider body that must not surface", { status: failure });
      return host === "gateway.codegraff.com" ? Response.json({ data: [{ embedding: Array(dimensions).fill(0.1) }] })
        : Response.json({ rows: [row("p2", "https://host-a.com/blog/deploy", 0.18766), row("px", "javascript:alert(1)", 0.2), row("p3", "https://host-b.com/pricing", 0.3)] });
    }) as typeof fetch;
    const engine = directPageSearch({ CODEGRAFF_API_KEY: "embedding-fixture", TURBOPUFFER_API_KEY: "vector-fixture" }, provider)!;
    assert.equal(directPageSearch({ CODEGRAFF_API_KEY: "embedding-fixture" }, provider), undefined);
    const meaning = await searchCrawledPages(db, { q: "run a task on a schedule", limit: 5 }, "", engine);
    assert.deepEqual([meaning.mode, meaning.semantic, meaning.candidates], ["semantic", "used", 2]);
    // The store's order and score are kept, a non-http URL is dropped, and section and fetch time come from the page row.
    assert.deepEqual(meaning.items.map(item => [item.pageId, item.score, item.domain, item.section, item.fetchedAt]), [["p2", 0.812, "host-a.com", "/docs", "2026-11-07T05:00:00.000Z"], ["p3", 0.7, "host-b.com", "/docs", "2026-11-07T05:00:00.000Z"]]);
    assert.equal(Array.from(meaning.items[0].excerpt).length, 400);
    assert.deepEqual(sent.map(item => [item.host, item.key]), [["gateway.codegraff.com", "Bearer embedding-fixture"], ["gcp-us-central1.turbopuffer.com", "Bearer vector-fixture"]]);
    assert.deepEqual(sent[0].body, { model: PAGE_EMBEDDING_MODEL, input: "run a task on a schedule", dimensions: 768 });
    assert.deepEqual([sent[1].body.top_k, sent[1].body.filters, (sent[1].body.rank_by as unknown[])[1]], [5, undefined, "ANN"]);
    // A website search filters in the vector store, by host and subdomains; results are still checked here.
    const scoped = await searchCrawledPages(db, { q: "run a task on a schedule", domain: "www.host-b.com" }, "", engine);
    assert.deepEqual([scoped.mode, scoped.items.map(item => item.pageId).join(), sent[3].body.top_k], ["semantic", "p3", 8]);
    assert.deepEqual(sent[3].body.filters, ["Or", [["domain", "Eq", "host-b.com"], ["domain", "Glob", "*.host-b.com"]]]);
    assert.match(scoped.matching, /Only pages on host-b\.com and its subdomains were compared/);
    // An engine that cannot filter by website is asked for its 100 nearest pages instead.
    const limits: number[] = [];
    const hit = (id: string, url: string, score: number) => ({ id, url, title: "Deploying apps", section: null, excerpt: "Scheduled tasks.", score });
    const unfiltered = { filtersByWebsite: false, search: async (query: { limit: number }) => { limits.push(query.limit); return [hit("p2", "https://host-a.com/blog/deploy", 0.9)]; } };
    // No semantic hit for the website, an embedding of the wrong size, or a failing engine falls back to the word match and says why.
    const none = await searchCrawledPages(db, { q: "cron", domain: "host-b.com" }, "", unfiltered);
    assert.deepEqual([none.mode, none.semantic, none.items.map(item => item.pageId).join(), none.items[0].score, limits.join()], ["all_terms", "no_results", "p5", null, "100"]);
    // One server error is retried once per search; a second one, or a rejected credential, is not.
    let mark = sent.length; failures = [503];
    assert.equal((await searchCrawledPages(db, { q: "deploy cron job" }, "", engine)).mode, "semantic"); assert.equal(sent.length - mark, 3);
    mark = sent.length; failures = [503, 503];
    assert.equal((await searchCrawledPages(db, { q: "deploy cron job" }, "", engine)).semantic, "unavailable"); assert.equal(sent.length - mark, 2);
    mark = sent.length; failures = [401];
    assert.equal((await searchCrawledPages(db, { q: "deploy cron job" }, "", engine)).semantic, "unavailable"); assert.equal(sent.length - mark, 1);
    dimensions = 1536;
    assert.equal((await searchCrawledPages(db, { q: "deploy cron job" }, "", engine)).semantic, "unavailable");
    const down = await searchCrawledPages(db, { q: "deploy cron job" }, "", { filtersByWebsite: true, search: async () => { throw new Error("vector store timeout"); } });
    assert.deepEqual([down.mode, down.semantic, down.items.map(item => item.pageId).join()], ["all_terms", "unavailable", "p1,p2"]);
    assert.match(down.matching, /^Semantic search was unavailable/); assert.equal(all.semantic, "not_configured");

    const site = await crawlWebsite(db, "docs.host-a.com", "");
    assert.deepEqual([site.state, site.domain, site.pagesCrawled, site.profile?.name, site.profile?.inventoryPages, site.profile?.sampledPages], ["in_index", "host-a.com", 2, "Host A", 3970, 30]);
    assert.deepEqual(site.topSections, [{ path: "/docs", pages: 400, share: 0.5 }, { path: "/blog", pages: 90, share: 0.1 }]);
    const crawledOnly = await crawlWebsite(db, "host-b.com", ""), absent = await crawlWebsite(db, "host-c.com", "");
    assert.deepEqual([crawledOnly.state, crawledOnly.pagesCrawled, crawledOnly.profile], ["in_index", 3, null]);
    assert.deepEqual([absent.state, absent.pagesCrawled, absent.lastFetchedAt], ["not_in_index", 0, null]);
    // A database without the crawl tables is reported as unavailable, not as an empty index.
    assert.deepEqual([(await crawlWebsite(db, "host-a.com", "missing_schema")).available, (await searchCrawledPages(db, { q: "cron" }, "missing_schema")).available, (await crawlStats(db, "missing_schema")).available], [false, false, false]);
    assert.equal(await rows(), before);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
