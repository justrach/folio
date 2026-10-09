import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/lib/auth-schema-pg";
import { PgD1Database } from "../src/lib/pg-d1";
import { startWebsiteResearch, websiteResearchOverview } from "../src/lib/website-research-service";
import { reconcileKeywordBenchmark } from "../src/lib/keyword-benchmark-service";
import { summarizeOwnedWebsites } from "../src/lib/keyword-benchmark-store";
import { checkResearchSources } from "../src/lib/research-source-check";
import { completeSeoReport, latestDomainSeoMetrics, reserveSeoReport } from "../src/lib/seo-store";
import type { SeoOverviewResult } from "../src/lib/dataforseo";
import { researchAnswer, researchHistory, researchSession, researchTarget } from "./fixtures/website-research";

/** Branch queries (research, page check, comparison, domain metrics) against the PostgreSQL compatibility layer.
 * FOLIO_PG_TEST_URL=postgresql://...@127.0.0.1:55432/... node --conditions=react-server --import tsx --test tests/pg-branch-queries.integration.ts */
test("PostgreSQL runs research, page check, comparison and saved DataForSEO metrics", async () => {
  const url = process.env.FOLIO_PG_TEST_URL;
  if (!url || !/^postgres(?:ql)?:\/\/[^@]*@?127\.0\.0\.1:55432\//.test(url)) throw new Error("Only the isolated localhost:55432 PostgreSQL server is accepted.");
  const schemaName = `folio_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 2 });
  const pool = new Pool({ connectionString: url, options: `-c search_path=${schemaName},public`, max: 4 });
  try {
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    await pool.query(await readFile(new URL("../migrations/postgres/0001_schema.sql", import.meta.url), "utf8"));
    const auth = betterAuth({ appName: "Folio PG branch test", baseURL: "http://folio.test", secret: "folio-postgres-test-only-secret-not-for-deployment",
      database: drizzleAdapter(drizzle(pool, { schema }), { provider: "pg", schema }), emailAndPassword: { enabled: true, minPasswordLength: 10, maxPasswordLength: 128 }, telemetry: { enabled: false } });
    const signUp = await auth.api.signUpEmail({ body: { name: "PG fixture", email: "pg-branch@folio.test", password: "Only a local test password" }, asResponse: true });
    const owner = (await signUp.json() as { user: { id: string } }).user.id;
    const db = new PgD1Database(pool) as unknown as D1Database;
    for (const [id, site] of [["site_pg", researchTarget], ["site_pg_two", "https://example.org/"]])
      await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind(id, owner, site, "PG site", Date.now()).run();
    const env = { OPENAI_API_KEY: "synthetic-pg-key", OPENAI_ALLOWED_USER_IDS: owner, DECISIONS_ALLOWED_USER_IDS: owner };

    let creates = 0, decisions = 0;
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input) === "https://api.openai.com/v1/decisions") {
        decisions++;
        const body = JSON.parse(String(init?.body));
        return Response.json({ model: "gpt-6-luna", usage: { input_tokens: 99, output_tokens: 0 }, answers: body.questions.map((q: { name: string }) => ({ type: "choice", name: q.name, choice: "supports", confidence: 0.9,
          probabilities: [{ value: "supports", probability: 0.9 }, { value: "partial", probability: 0.05 }, { value: "not_supported", probability: 0.05 }] })) });
      }
      if (init?.method === "POST") { creates++; return Response.json(researchSession(`session_pg_${creates}`, "query-discovery")); }
      const id = /\/sessions\/([^/?]+)/.exec(String(input))![1];
      const history = researchHistory(id, researchAnswer("query-discovery"));
      if (String(input).includes("/turns?")) return Response.json({ data: [history.turn], has_more: false });
      if (String(input).includes("/items?")) return Response.json({ data: history.items.filter(item => item.action?.type !== "open_page"), has_more: false });
      return Response.json(researchSession(id, "query-discovery"));
    };
    const pageFetcher: typeof fetch = async () => new Response("<html><body><h1>Reproducible setup workflow</h1></body></html>", { headers: { "Content-Type": "text/html" } });

    const started = await startWebsiteResearch(db, owner, "site_pg", { stage: "query-discovery", requestKey: "pg_one", confirmSpend: true, model: "gpt-6-luna" }, env, { fetcher });
    const waiting = await reconcileKeywordBenchmark(db, owner, started.id, env, { fetcher });
    assert.equal(waiting.status, "requires_action"); assert.equal(waiting.providerMetadata.sourceCheck, "eligible");
    const overview = await websiteResearchOverview(db, owner, "site_pg", env);
    assert.deepEqual(overview.runs.map(run => run.id), [started.id]);
    const checked = await checkResearchSources(db, owner, started.id, { confirmSpend: true, revision: waiting.revision }, env, { fetcher, pageFetcher });
    assert.equal(checked.status, "completed"); assert.equal(checked.providerMetadata.sourceCheck, "completed");
    assert.equal(decisions, 1); assert.equal(creates, 1);
    await assert.rejects(checkResearchSources(db, owner, started.id, { confirmSpend: true, revision: checked.revision }, env, { fetcher, pageFetcher }), /once/);

    const summary = await summarizeOwnedWebsites(db, owner, { searchMode: "open-web" });
    assert.equal(summary.snapshots.length, 2, "both owned sites are summarized");
    assert.ok(summary.snapshots.every(snapshot => snapshot.answered === 0), "private research is excluded from search-answer metrics");

    const result = (domain: string, rank: number) => ({ id: crypto.randomUUID(), domain, provider: "DataForSEO", fetchedAt: new Date().toISOString(), status: "complete",
      totalCostUsd: null, knownCostUsd: 0, costIsComplete: false, notes: [],
      organic: { status: "success", data: { organicKeywords: 6, estimatedMonthlyTraffic: 0.2 }, error: null, costUsd: null, taskId: null, providerVersion: null, endpoint: "fixture", fetchedAt: new Date().toISOString() },
      backlinks: { status: "success", data: { backlinks: 883, referringDomains: 836, authorityRank: rank, authorityRankScale: 100 }, error: null, costUsd: null, taskId: null, providerVersion: null, endpoint: "fixture", fetchedAt: new Date().toISOString() } }) as unknown as SeoOverviewResult;
    const report = await reserveSeoReport(db, owner, "example.com");
    await completeSeoReport(db, owner, report.id, result("example.com", 18));
    const metrics = await latestDomainSeoMetrics(db, owner, ["https://www.example.com/", "example.org"]);
    assert.equal(metrics.get("example.com")?.domainRank, 18); assert.equal(metrics.get("example.com")?.referringDomains, 836);
    assert.equal(metrics.has("example.org"), false);
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});
    await admin.end();
  }
});
