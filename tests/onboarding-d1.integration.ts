import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { saveOnboardingProfile, getOnboardingProfile } from "../src/lib/onboarding-store";
import { getKeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-store";
/** Real isolated D1 with synthetic owners and sites; no application state or environment files. */
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-onboarding-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000099" } },
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


const draft = { requestKey: "a76efa18-44e5-43bc-a38e-a928c66ab62c", websiteUrl: "https://business.example.com/", businessName: "Synthetic business", description: "Owner supplied description", audience: "Small teams", capabilities: "Website reviews", competitors: ["Another business"], questions: ["Which tool should a small team use?"] };
test("real D1 onboarding saves atomically, replays once, isolates owners and survives restart without inference", { timeout: 90000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-onboarding-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    await setup(db);
    const [first, second] = await Promise.all([saveOnboardingProfile(db, "alice", draft), saveOnboardingProfile(db, "alice", draft)]);
    assert.deepEqual(first, second);
    assert.equal(first.description, draft.description);
    assert.deepEqual(first.questions, draft.questions);
    const suite = await getKeywordBenchmarkSuite(db, "alice", first.suiteId);
    assert.deepEqual(suite?.cases.map(value => value.query), draft.questions);
    assert.equal(suite?.cases[0].targetUrl, draft.websiteUrl);
    assert.equal(await getOnboardingProfile(db, "bob", first.id), null);
    assert.equal(await getKeywordBenchmarkSuite(db, "bob", first.suiteId), null);
    await assert.rejects(saveOnboardingProfile(db, "alice", {...draft, description: "Changed"}), /different reviewed inputs/);
    const bob = await saveOnboardingProfile(db, "bob", draft);
    assert.notEqual(bob.websiteId, first.websiteId);
    assert.notEqual(bob.suiteId, first.suiteId);
    assert.deepEqual(await getOnboardingProfile(db, "alice", undefined, first.websiteId), first);
    assert.equal(await getOnboardingProfile(db, "bob", undefined, first.websiteId), null);
    assert.equal(await getOnboardingProfile(db, "alice", undefined, "missing-site"), null);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM onboarding_profiles").first<{count:number}>())?.count, 2);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM keyword_benchmark_suites").first<{count:number}>())?.count, 2);
    assert.equal((await db.prepare("SELECT is_public FROM sites WHERE id=?").bind(first.websiteId).first<{is_public:number}>())?.is_public, 0);
    for (const table of ["keyword_benchmark_runs", "evaluation_runs", "scans", "agent_tool_calls", "agent_api_requests"])
      assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{count:number}>())?.count, 0);
    await current.dispose(); current = undefined;
    current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getOnboardingProfile(restored, "alice"), first);
    assert.deepEqual(await saveOnboardingProfile(restored, "alice", draft), first);
    assert.deepEqual(await getOnboardingProfile(restored, "bob"), bob);
    // Fill quota, then prove a failed new save creates neither a website nor profile.
    for (let index = 1; index < 20; index++) await restored.prepare("INSERT INTO keyword_benchmark_suites(id,user_id,name,description,created_at) VALUES(?,?,?,?,?)").bind(`limit-${index}`, "alice", "Fixture", "Fixture", Date.now()).run();
    const before = (await restored.prepare("SELECT COUNT(*) AS count FROM sites").first<{count:number}>())?.count;
    await assert.rejects(saveOnboardingProfile(restored, "alice", {...draft, requestKey: "b76efa18-44e5-43bc-a38e-a928c66ab62c", websiteUrl: "https://other.example.com/"}), /limit/);
    assert.equal((await restored.prepare("SELECT COUNT(*) AS count FROM sites").first<{count:number}>())?.count, before);
    assert.equal((await restored.prepare("SELECT COUNT(*) AS count FROM onboarding_profiles").first<{count:number}>())?.count, 2);
  } finally { try { await current?.dispose(); } finally { await rm(directory, {recursive:true,force:true}); } }
});
