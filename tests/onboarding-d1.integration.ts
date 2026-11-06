import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { listTrackedCompetitors, onboardingSummary, replaceTrackedCompetitors, updateOnboarding } from "../src/lib/onboarding-store";
import { ScanError } from "../src/lib/scanner";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-onboarding-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000026" } },
    } }],
  });
}

async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const owner of ["alice", "bob"]) {
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)")
      .bind(`${owner}-site`, owner, `https://${owner}.example.test/`, owner, Date.now()).run();
  }
}

const provenance = (db: D1Database, owner: string, site: string) => db.prepare(
  "SELECT name, source FROM tracked_competitors WHERE user_id = ? AND site_id = ? ORDER BY name",
).bind(owner, site).all<{ name: string; source: string }>();

test("real D1 preserves competitor websites and backend-only provenance across resaves and restart, isolated by owner", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-onboarding-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    await setup(db);
    // Valid DNS labels, but longer than the 80-character alias storage limit.
    const longDomain = `${"a".repeat(60)}.${"b".repeat(11)}.example.test`;
    assert.equal(longDomain.length, 85);
    const input = [
      { name: "Manual company", aliases: ["manual.example.test"], source: "manual" },
      { name: "Indexed company", aliases: [], domain: "indexed.example.test", source: "public-index" },
      { name: "Starter company", aliases: [], source: "starter-pack" },
      { name: "Long hostname company", aliases: [longDomain], source: "manual" },
    ];
    const websites = (items: Awaited<ReturnType<typeof listTrackedCompetitors>>) => items.map(({ name, aliases, domain }) => ({ name, aliases, domain }));
    const expectedWebsites = [
      { name: "Manual company", aliases: ["manual.example.test"], domain: "manual.example.test" },
      { name: "Indexed company", aliases: [], domain: "indexed.example.test" },
      { name: "Starter company", aliases: [], domain: undefined },
      { name: "Long hostname company", aliases: [], domain: longDomain },
    ];
    const saved = await replaceTrackedCompetitors(db, "alice", "alice-site", input);
    assert.ok(saved.every(item => !("source" in item)), "PUT response omits internal provenance");
    assert.deepEqual(websites(saved), expectedWebsites, "domain is derived before oversized aliases are filtered");
    assert.equal((await db.prepare("SELECT domain FROM tracked_competitors WHERE user_id = ? AND site_id = ? AND name = ?")
      .bind("alice", "alice-site", "Long hostname company").first<{ domain: string }>())?.domain, longDomain);
    const expected = input.map(({ name, source }) => ({ name, source })).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual((await provenance(db, "alice", "alice-site")).results, expected);
    await updateOnboarding(db, "alice", { siteId: "alice-site" });
    assert.deepEqual((await onboardingSummary(db, "alice")).competitors, saved, "onboarding response also omits provenance");
    assert.deepEqual(await listTrackedCompetitors(db, "bob", "alice-site"), []);
    await assert.rejects(replaceTrackedCompetitors(db, "bob", "alice-site", input), error => error instanceof ScanError && error.status === 404);
    await replaceTrackedCompetitors(db, "bob", "bob-site", [{ name: "Indexed company", aliases: [] }]);
    assert.deepEqual((await provenance(db, "bob", "bob-site")).results, [{ name: "Indexed company", source: "manual" }]);
    assert.equal((await listTrackedCompetitors(db, "bob", "bob-site"))[0].domain, undefined, "same-name records cannot inherit another owner's website");

    // An older client may send manual for every restored row; neither that nor omitted hints may overwrite stored origins.
    const legacySaved = await replaceTrackedCompetitors(db, "alice", "alice-site", saved.map(({ name, aliases }) => ({ name, aliases, source: "manual" })));
    assert.deepEqual(websites(legacySaved), expectedWebsites, "old clients omitting domain retain stored websites, including alias-free rows");
    assert.deepEqual((await provenance(db, "alice", "alice-site")).results, expected);
    const beforeRestart = await replaceTrackedCompetitors(db, "alice", "alice-site", legacySaved.map(({ name, aliases }) => ({ name, aliases })));
    assert.deepEqual(websites(beforeRestart), expectedWebsites);
    assert.deepEqual((await provenance(db, "alice", "alice-site")).results, expected);
    await current.dispose(); current = undefined;
    current = runtime(directory);
    const restored = await current.getD1Database("DB");
    const reopened = await listTrackedCompetitors(restored, "alice", "alice-site");
    assert.ok(reopened.every(item => !("source" in item)));
    assert.deepEqual(reopened, beforeRestart, "saved websites survive actual D1 runtime restart without index lookup");
    assert.deepEqual((await onboardingSummary(restored, "alice")).competitors, reopened);
    const resaved = await replaceTrackedCompetitors(restored, "alice", "alice-site", reopened);
    assert.deepEqual(websites(resaved), expectedWebsites);
    assert.deepEqual((await provenance(restored, "alice", "alice-site")).results, expected);

    const selected = reopened.filter(item => item.name !== "Starter company");
    await replaceTrackedCompetitors(restored, "alice", "alice-site", [...selected, { name: "New company", aliases: [] }]);
    assert.deepEqual((await provenance(restored, "alice", "alice-site")).results, [
      { name: "Indexed company", source: "public-index" }, { name: "Long hostname company", source: "manual" },
      { name: "Manual company", source: "manual" }, { name: "New company", source: "manual" },
    ]);
    assert.deepEqual((await provenance(restored, "bob", "bob-site")).results, [{ name: "Indexed company", source: "manual" }]);
    for (const table of ["keyword_benchmark_runs", "evaluation_runs", "scans", "agent_tool_calls"])
      assert.equal((await restored.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>())?.count, 0);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
