import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { getOnboardingState, parseOnboardingPatch, updateOnboarding, type OnboardingPatch } from "../src/lib/onboarding-store";
import { ScanError } from "../src/lib/scanner";

/** Real temporary D1; never reads application credentials or .wrangler persistence. */
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-onboarding-customer-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000024" } },
    } }],
  });
}

async function migrate(db: D1Database, name: string) {
  const statements = unstable_splitSqlQuery(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
  const results = await db.batch(statements.map(statement => db.prepare(statement)));
  assert.ok(results.every(result => result.success), `${name} must apply in actual D1.`);
}

const badRequest = (error: unknown) => error instanceof ScanError && error.status === 400;

test("real D1 preserves legacy audience through additive migration and persists bounded owner-scoped groups across restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-onboarding-customers-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    const migrationNames = (await readdir(new URL("../migrations/", import.meta.url))).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
    for (const name of migrationNames.filter(name => name < "0024_")) await migrate(db, name);
    const legacyAudience = `  ${"Existing customers comparing products. ".repeat(10)}\r\n\t日本の購入者  `;
    for (const owner of ["alice", "bob", "blank-owner", "new-owner"])
      await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
        .bind(owner, owner, `${owner}@example.test`, 1, 1).run();
    for (const [owner, audience] of [["alice", legacyAudience], ["bob", null], ["blank-owner", " \t\n "]])
      await db.prepare("INSERT INTO onboarding_state(user_id,audience,task,created_at,updated_at) VALUES(?,?,?,?,?)")
        .bind(owner, audience, "Existing task", 1, 1).run();
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)")
      .bind("bob-site", "bob", "https://bob.example.test/", "Bob fixture", 1).run();
    for (const name of migrationNames.filter(name => name >= "0024_")) await migrate(db, name);

    const legacyRow = await db.prepare("SELECT audience,customer_groups_json FROM onboarding_state WHERE user_id = ?").bind("alice").first();
    assert.deepEqual(legacyRow, { audience: legacyAudience, customer_groups_json: null }, "Migration preserves the old column with a NULL fallback marker, not an empty-array default.");
    assert.deepEqual((await getOnboardingState(db, "alice"))?.customerGroups, [legacyAudience]);
    assert.equal((await getOnboardingState(db, "alice"))?.audience, legacyAudience);
    assert.deepEqual((await getOnboardingState(db, "bob"))?.customerGroups, []);
    assert.deepEqual((await getOnboardingState(db, "blank-owner"))?.customerGroups, [], "Whitespace-only legacy audience is not a customer group.");
    assert.equal(await getOnboardingState(db, "new-owner"), null);
    assert.equal(await getOnboardingState(db, "unknown-owner"), null);

    const untouchedBob = await getOnboardingState(db, "bob");
    const groups = [`  ${"Small teams comparing detailed product requirements. ".repeat(12)}\r\n\tSecond line with  spaces.  `, " Growing\n shops ", "日本の購入者", "x".repeat(61)];
    const saved = await updateOnboarding(db, "alice", parseOnboardingPatch({ customerGroups: groups, task: "Find a product" }));
    assert.deepEqual(saved?.customerGroups, groups);
    assert.equal(saved?.audience, groups[0], "Legacy consumers see only the first group.");
    assert.equal(saved?.task, "Find a product");
    assert.deepEqual(await getOnboardingState(db, "alice"), saved, "A separate read reopens every group in order.");
    assert.deepEqual(await db.prepare("SELECT audience,customer_groups_json FROM onboarding_state WHERE user_id = ?").bind("alice").first(), { audience: groups[0], customer_groups_json: JSON.stringify(groups) });

    for (const customerGroups of [["a", "b", "c", "d", "e"], ["a", "", "", "", ""], [], [" ", "\t\n"], ["a", null], "Customers", null]) {
      await assert.rejects(updateOnboarding(db, "alice", { customerGroups } as OnboardingPatch), badRequest);
      assert.deepEqual(await getOnboardingState(db, "alice"), saved, "Rejected direct writes cannot change persisted state.");
    }
    await assert.rejects(updateOnboarding(db, "alice", { audience: "First", customerGroups: ["Second"] }), badRequest);
    await assert.rejects(updateOnboarding(db, "new-owner", { customerGroups: [] }), badRequest);
    assert.equal(await getOnboardingState(db, "new-owner"), null, "Rejected input cannot create onboarding state.");
    await assert.rejects(updateOnboarding(db, "alice", { siteId: "bob-site", customerGroups: ["Unowned site"] }), error => error instanceof ScanError && error.status === 404);
    assert.deepEqual(await getOnboardingState(db, "alice"), saved);
    assert.deepEqual(await getOnboardingState(db, "bob"), untouchedBob, "Another owner's state is unchanged by writes and rejected references.");

    const filtered = await updateOnboarding(db, "alice", { customerGroups: ["  Small\t teams ", " ", "\n", " Growing\n shops "] });
    assert.deepEqual(filtered?.customerGroups, ["  Small\t teams ", " Growing\n shops "]);
    assert.equal(filtered?.audience, "  Small\t teams ");
    assert.equal(filtered?.task, "Find a product", "A groups-only patch preserves task.");
    const legacyWrite = await updateOnboarding(db, "alice", { audience: legacyAudience });
    assert.deepEqual(legacyWrite?.customerGroups, [legacyAudience], "Legacy writes replace all earlier groups without rewriting the description.");
    assert.equal(legacyWrite?.audience, legacyAudience);
    assert.deepEqual(await db.prepare("SELECT audience,customer_groups_json FROM onboarding_state WHERE user_id = ?").bind("alice").first(), { audience: legacyAudience, customer_groups_json: JSON.stringify([legacyAudience]) });
    const cleared = await updateOnboarding(db, "alice", { audience: " \t " });
    assert.deepEqual(cleared?.customerGroups, []);
    assert.equal(cleared?.audience, "");
    assert.equal((await db.prepare("SELECT audience FROM onboarding_state WHERE user_id = ?").bind("alice").first<{ audience: string }>())?.audience, " \t ", "Legacy storage retains raw whitespace even when it represents no groups.");
    assert.equal((await db.prepare("SELECT customer_groups_json FROM onboarding_state WHERE user_id = ?").bind("alice").first<{ customer_groups_json: string }>())?.customer_groups_json, "[]");
    const finalAlice = await updateOnboarding(db, "alice", { customerGroups: groups });
    const finalBob = await updateOnboarding(db, "bob", { customerGroups: ["Bob customers"], task: "Bob task" });
    const taskOnly = await updateOnboarding(db, "alice", { task: "Updated task only" });
    assert.deepEqual(taskOnly?.customerGroups, finalAlice?.customerGroups);
    assert.deepEqual((await getOnboardingState(db, "bob"))?.customerGroups, ["Bob customers"]);

    await current.dispose();
    current = undefined;
    current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getOnboardingState(restored, "alice"), taskOnly);
    assert.deepEqual(await getOnboardingState(restored, "bob"), finalBob);
    assert.equal(await getOnboardingState(restored, "new-owner"), null);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  }
});
