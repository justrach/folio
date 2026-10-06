import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { startWebsiteResearch, websiteResearchOverview } from "../src/lib/website-research-service";
import { reconcileKeywordBenchmark, startKeywordBenchmark } from "../src/lib/keyword-benchmark-service";
import { getKeywordBenchmarkRun, getKeywordBenchmarkUsage, listKeywordBenchmarkRuns, listKeywordBenchmarkSuites, listWebsiteKeywordRunsPage } from "../src/lib/keyword-benchmark-store";
import { folioOutputSchema } from "../src/lib/folio-mcp-schemas";
import { previewKeywordPublication, publishKeywordObservation } from "../src/lib/public-keyword-store";
import { savedVisibility, visibilityFilters } from "../src/lib/visibility-service";
import { getAgentObservationRun } from "../src/lib/agent-observation-service";
import { projectWebsitePublicObservation } from "../src/lib/public-observation-projection";
import { researchAnswer, researchHistory, researchQuery, researchSession, researchTarget } from "./fixtures/website-research";
import type { WebsiteResearchStage } from "../src/lib/website-research";

const env = { OPENAI_API_KEY: "synthetic-website-research-key", OPENAI_ALLOWED_USER_IDS: "alice,bob", OPENAI_PARALLEL_USER_IDS: "alice", CODEGRAFF_API_KEY: "synthetic-other-provider-key" };
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"), workers: [{ config: {
      name: "folio-website-research-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000023" } },
    } }] });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const owner of ["alice", "bob"]) {
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind(`site_${owner}`, owner, researchTarget, "Synthetic target", Date.now()).run();
  }
}
function provider(unknown = false) {
  let posts = 0;
  const inputs: Record<string, unknown>[] = [];
  const sessions = new Map<string, { stage: WebsiteResearchStage; query: string }>();
  const fetcher: typeof fetch = async (url, init) => {
    assert.ok(String(url).startsWith("https://api.openai.com/v1/agents/sessions"), "Never use the configured alternate provider.");
    if (init?.method === "POST") {
      posts++;
      const body = JSON.parse(String(init.body)), input = JSON.parse(body.input);
      inputs.push(input);
      assert.equal(Object.hasOwn(input, "discoveryRunId"), false);
      assert.equal(Object.hasOwn(input, "ownerId"), false);
      if (unknown) throw new Error("Synthetic transport interruption");
      const id = `session_research_${posts}`;
      sessions.set(id, { stage: input.websiteResearchStage, query: input.query });
      return Response.json(researchSession(id, input.websiteResearchStage));
    }
    const id = /\/sessions\/([^/?]+)/.exec(String(url))?.[1];
    const saved = id && sessions.get(id);
    assert.ok(saved && id);
    const history = researchHistory(id, researchAnswer(saved.stage, saved.query));
    if (String(url).includes("/turns?")) return Response.json({ data: [history.turn], has_more: false });
    if (String(url).includes("/items?")) return Response.json({ data: history.items, has_more: false });
    return Response.json(researchSession(id, saved.stage));
  };
  return { fetcher, inputs, count: () => posts };
}

test("actual D1 saves two separately authorized OpenAI stages, edited query provenance and read-only private agent context", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-website-research-d1-"));
  const current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const api = provider(), options = { fetcher: api.fetcher };
    assert.equal((await websiteResearchOverview(db, "alice", "site_alice", env)).runs.length, 0);
    assert.equal(api.count(), 0);
    await assert.rejects(startWebsiteResearch(db, "alice", "site_alice", { stage: "query-discovery", requestKey: "missing_authority" }, env, options));
    await assert.rejects(startWebsiteResearch(db, "bob", "site_alice", { stage: "query-discovery", requestKey: "wrong_owner", confirmSpend: true }, env, options));
    assert.equal(api.count(), 0);
    const request = { stage: "query-discovery", requestKey: "discovery_one", confirmSpend: true };
    const discovery = await startWebsiteResearch(db, "alice", "site_alice", request, env, options);
    assert.equal(discovery.status, "running"); assert.equal(api.count(), 1);
    assert.equal(discovery.harnessVersion, "website-query-discovery-v1");
    assert.equal((await startWebsiteResearch(db, "alice", "site_alice", request, env, options)).id, discovery.id);
    assert.equal(api.count(), 1);
    await assert.rejects(startWebsiteResearch(db, "alice", "site_alice", { stage: "competitor-research", discoveryRunId: discovery.id, query: researchQuery, requestKey: "before_review", confirmSpend: true }, env, options));
    const completedDiscovery = await reconcileKeywordBenchmark(db, "alice", discovery.id, env, options);
    assert.equal(completedDiscovery.status, "completed"); assert.equal(completedDiscovery.answer?.websiteResearch?.stage, "query-discovery");
    assert.equal(api.count(), 1, "Discovery completion never launches competitor work.");
    const editedQuery = `${researchQuery} Include small-team constraints.`;
    const competitorRequest = { stage: "competitor-research", discoveryRunId: discovery.id, query: editedQuery, requestKey: "approved_one", confirmSpend: true };
    const competitors = await startWebsiteResearch(db, "alice", "site_alice", competitorRequest, env, options);
    assert.equal(api.count(), 2); assert.equal(api.inputs[1].query, editedQuery);
    assert.equal(competitors.case.websiteResearch?.discoveryRunId, discovery.id);
    assert.equal(competitors.case.query, editedQuery);
    const brief = await reconcileKeywordBenchmark(db, "alice", competitors.id, env, options);
    assert.equal(brief.status, "completed"); assert.equal(brief.answer?.websiteResearch?.stage, "competitor-research");
    assert.equal(brief.usage.costUsd, null);
    assert.equal(brief.usage.cachedInputTokens, 20);
    const saved = await getAgentObservationRun(db, "alice", "keyword", brief.id);
    const savedResult = saved.run?.result;
    assert.ok(savedResult && "websiteResearch" in savedResult);
    assert.deepEqual(savedResult.websiteResearch, brief.answer?.websiteResearch);
    assert.equal(Object.hasOwn(saved.run?.result ?? {}, "collection"), false);
    assert.equal(folioOutputSchema("folio_run").safeParse({ result: saved }).success, true, "The actual saved agent response satisfies its published strict schema.");
    assert.equal(brief.suiteId, discovery.suiteId, "Both stages reuse one private suite for this website.");
    assert.deepEqual(await listKeywordBenchmarkSuites(db, "alice"), []);
    assert.deepEqual(await listKeywordBenchmarkRuns(db, "alice"), []);
    const visibility = await savedVisibility(db, "alice", visibilityFilters(new URLSearchParams({ websiteId: "site_alice" })));
    assert.equal(visibility.coverage.attemptsLoaded, 0);
    assert.equal(visibility.current.completedQuestions, 0);
    const publication = { audience: "Developer tools" as const, category: "Synthetic" };
    await assert.rejects(previewKeywordPublication(db, "alice", brief.id, publication), /publish|private|research/i);
    await assert.rejects(publishKeywordObservation(db, "alice", brief.id, publication, "not-a-reviewed-hash"), /publish|private|research/i);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM public_keyword_observations").first<{ count: number }>())?.count, 0);
    assert.equal(api.count(), 2, "Saved reads have no provider work.");
    await assert.rejects(getAgentObservationRun(db, "bob", "keyword", brief.id));
    assert.equal(await getKeywordBenchmarkRun(db, "bob", brief.id), null);
    assert.equal((await websiteResearchOverview(db, "alice", "site_alice", env)).runs.length, 2);
    assert.equal((await listWebsiteKeywordRunsPage(db, "alice", { websiteId: "site_alice", searchMode: "open-web" })).runs.length, 0);
    assert.throws(() => projectWebsitePublicObservation(brief, { id: "synthetic_public_query", query: editedQuery, audience: "Developer tools", category: "Synthetic", language: "en", locale: "en-US" }));
    assert.equal((await startWebsiteResearch(db, "alice", "site_alice", competitorRequest, {}, options)).id, brief.id, "Reopening a known key is not paid access.");
    await assert.rejects(startWebsiteResearch(db, "alice", "site_alice", { ...competitorRequest, query: "Changed input" }, env, options));
    await assert.rejects(startWebsiteResearch(db, "alice", "site_alice", { ...competitorRequest, model: "gpt-6-astra" }, env, options));
    await assert.rejects(startKeywordBenchmark(db, "alice", { caseId: brief.caseId, kind: "baseline" }, env, options));
    assert.equal(api.count(), 2);
    assert.equal((await getKeywordBenchmarkUsage(db, "alice")).attemptsLast24Hours, 2);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("same-key concurrency and unknown creation preserve one attempt across real D1 restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-website-research-unknown-d1-"));
  let current = runtime(directory);
  try {
    let db = await current.getD1Database("DB"); await setup(db);
    const api = provider(true), options = { fetcher: api.fetcher };
    const request = { stage: "query-discovery", requestKey: "same_key_race", confirmSpend: true };
    const raced = await Promise.all([startWebsiteResearch(db, "alice", "site_alice", request, env, options), startWebsiteResearch(db, "alice", "site_alice", request, env, options)]);
    assert.equal(raced[0].id, raced[1].id); assert.equal(api.count(), 1);
    const saved = await getKeywordBenchmarkRun(db, "alice", raced[0].id);
    assert.equal(saved?.status, "requires_action"); assert.equal(saved?.sessionId, null); assert.equal(saved?.usage.costUsd, null);
    await current.dispose(); current = runtime(directory); db = await current.getD1Database("DB");
    const reopened = await startWebsiteResearch(db, "alice", "site_alice", request, env, options);
    assert.equal(reopened.id, saved!.id); assert.equal(api.count(), 1);
    assert.equal((await websiteResearchOverview(db, "alice", "site_alice", env)).runs.length, 1);
    assert.equal((await getKeywordBenchmarkUsage(db, "alice")).attemptsLast24Hours, 1);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
