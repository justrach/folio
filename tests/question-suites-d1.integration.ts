import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { saveQuestionSuite } from "../src/lib/question-suites";
import { ALL_KEYWORD_BENCHMARK_TEMPLATES, KEYWORD_BENCHMARK_ALLOWED_DOMAINS } from "../src/lib/keyword-benchmark-catalog";
import { seedKeywordBenchmark } from "../src/lib/keyword-benchmark-service";
import { getKeywordBenchmarkSuite, KeywordBenchmarkStoreError, listKeywordBenchmarkSuites } from "../src/lib/keyword-benchmark-store";
import { keywordSearchMode } from "../src/lib/keyword-benchmark-types";

/** Real isolated D1 with synthetic owners and sites; no application state or environment files. */
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-question-suite-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000012" } },
    } }],
  });
}

const sites = [
  { id: "alice-shop", owner: "alice", url: "https://shop.example.test/catalog/", name: "Synthetic shop" },
  { id: "bob-learning", owner: "bob", url: "https://learn.example.test/courses/", name: "Synthetic learning site" },
  { id: "alice-corpus", owner: "alice", url: "https://codegraff.com/", name: "Synthetic reviewed-corpus site" },
];

async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const statements = unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8"));
    const results = await db.batch(statements.map(statement => db.prepare(statement)));
    assert.ok(results.every(result => result.success), `${name} must apply in actual D1.`);
  }
  for (const owner of ["alice", "bob"])
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
  for (const site of sites)
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES(?,?,?,?,?,0)")
      .bind(site.id, site.owner, site.url, site.name, Date.now()).run();
}

const draft = { name: "Questions about delivery", websiteId: "alice-shop", questions: ["What are the delivery options?"], language: "English", locale: "Singapore" };
const status = (code: number) => (error: unknown) => error instanceof KeywordBenchmarkStoreError && error.status === code;
const siteSnapshot = (db: D1Database) => db.prepare("SELECT id,user_id,url,name,is_public FROM sites ORDER BY id").all();

async function assertNoEvaluations(db: D1Database) {
  // Saving cannot create even a queued reservation, scan, or provider continuation.
  for (const table of ["keyword_benchmark_runs", "evaluation_runs", "scans", "agent_tool_calls", "agent_api_requests"])
    assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, 0, `${table} stays empty after saving drafts.`);
}

test("real D1 saves custom questions against owned website URLs and rereads privately across restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-question-suites-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    await setup(db);
    const beforeSites = (await siteSnapshot(db)).results;
    const questions = Array.from({ length: 10 }, (_, index) => `Customer question ${index + 1}: what should I know before buying?`);
    const alice = await saveQuestionSuite(db, "alice", { ...draft, questions });
    const bob = await saveQuestionSuite(db, "bob", { ...draft, websiteId: "bob-learning", questions: ["What prerequisites are required?", "What does the course cost?"] });
    assert.equal(alice.name, draft.name);
    assert.equal(alice.cases.length, 10);
    assert.deepEqual(alice.cases.map(value => value.query).sort(), [...questions].sort());
    for (const trial of alice.cases) {
      assert.equal(trial.targetUrl, sites[0].url, "The target comes from the actual saved owner record.");
      assert.equal(trial.searchMode, "open-web");
      assert.equal(trial.rubricVersion, "keyword-open-web-v1");
      assert.equal(trial.language, draft.language);
      assert.equal(trial.locale, draft.locale);
      assert.equal(trial.revision, 0);
      assert.equal(trial.suiteId, alice.id);
    }
    assert.ok(bob.cases.every(value => value.targetUrl === sites[1].url && value.searchMode === "open-web"));
    assert.deepEqual(await getKeywordBenchmarkSuite(db, "alice", alice.id), alice);
    assert.equal(await getKeywordBenchmarkSuite(db, "bob", alice.id), null);
    assert.equal(await getKeywordBenchmarkSuite(db, "alice", bob.id), null);
    assert.deepEqual((await listKeywordBenchmarkSuites(db, "alice")).map(value => value.id), [alice.id]);
    assert.deepEqual((await listKeywordBenchmarkSuites(db, "bob")).map(value => value.id), [bob.id]);

    await assert.rejects(saveQuestionSuite(db, "", draft), status(401));
    await assert.rejects(saveQuestionSuite(db, "bob", draft), status(404));
    await assert.rejects(saveQuestionSuite(db, "alice", { ...draft, websiteId: "missing-site" }), status(404));
    await assert.rejects(saveQuestionSuite(db, "alice", { ...draft, questions: [] }), status(400));
    await assert.rejects(saveQuestionSuite(db, "alice", { ...draft, targetUrl: sites[1].url }), status(400));
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM keyword_benchmark_suites").first<{ count: number }>())?.count, 2);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM keyword_benchmark_cases").first<{ count: number }>())?.count, 12);
    assert.deepEqual((await siteSnapshot(db)).results, beforeSites, "Saving questions neither creates nor publishes websites.");
    await assertNoEvaluations(db);

    await current.dispose();
    current = undefined;
    current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getKeywordBenchmarkSuite(restored, "alice", alice.id), alice);
    assert.deepEqual(await getKeywordBenchmarkSuite(restored, "bob", bob.id), bob);
    assert.equal(await getKeywordBenchmarkSuite(restored, "bob", alice.id), null);
    await assertNoEvaluations(restored);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("real D1 allows broad open-web templates outside the developer corpus without weakening restricted templates", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-question-templates-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    await setup(db);
    const beforeSites = (await siteSnapshot(db)).results;
    assert.ok(![...KEYWORD_BENCHMARK_ALLOWED_DOMAINS].some(host => host === new URL(sites[0].url).hostname));
    const templateIds = ["small-team-work-v1", "clothing-shopping-v1", "service-booking-v1", "learning-python-v1"];
    for (const templateId of templateIds) {
      const template = ALL_KEYWORD_BENCHMARK_TEMPLATES.find(value => value.id === templateId);
      assert.ok(template, `${templateId} must be discoverable in the combined template catalog.`);
      assert.equal(template.cases.length, 6);
      assert.ok(template.cases.every(value => value.searchMode === "open-web"));
      const suite = await seedKeywordBenchmark(db, "alice", { templateId, websiteId: "alice-shop" });
      assert.equal(suite.cases.length, template.cases.length);
      assert.deepEqual(suite.cases.map(value => value.query).sort(), template.cases.map(value => value.query).sort());
      assert.ok(suite.cases.every(value => value.targetUrl === sites[0].url && value.searchMode === "open-web" && value.rubricVersion === "keyword-open-web-v1"));
      assert.equal(await getKeywordBenchmarkSuite(db, "bob", suite.id), null);
    }
    const openWeb = await seedKeywordBenchmark(db, "alice", { templateId: "coding-harness-open-web-v1", websiteId: "alice-shop" });
    assert.ok(openWeb.cases.every(value => value.searchMode === "open-web" && value.targetUrl === sites[0].url));
    await assert.rejects(seedKeywordBenchmark(db, "alice", { templateId: "coding-harness-research-v1", websiteId: "alice-shop" }),
      error => status(400)(error) && /outside the reviewed research corpus/.test((error as Error).message));
    await assert.rejects(seedKeywordBenchmark(db, "bob", { templateId: templateIds[0], websiteId: "alice-shop" }), status(404));
    await assert.rejects(seedKeywordBenchmark(db, "alice", { templateId: templateIds[0], websiteId: "missing-site" }), status(404));
    const restricted = await seedKeywordBenchmark(db, "alice", { templateId: "coding-harness-research-v1", websiteId: "alice-corpus" });
    assert.equal(restricted.cases.length, 3);
    assert.ok(restricted.cases.every(value => keywordSearchMode(value.searchMode) !== "open-web" && value.targetUrl === sites[2].url));
    assert.equal((await listKeywordBenchmarkSuites(db, "alice")).length, templateIds.length + 2);
    assert.deepEqual(await listKeywordBenchmarkSuites(db, "bob"), []);
    assert.deepEqual((await siteSnapshot(db)).results, beforeSites);
    await assertNoEvaluations(db);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
