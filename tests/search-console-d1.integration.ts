import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { disconnectSearchConsole, searchConsoleAccount, SEARCH_CONSOLE_SCOPE } from "../src/lib/google-auth";
import { saveSearchConsoleReport, getSavedSearchConsoleReport, listSavedSearchConsoleReports, SearchConsoleStoreError } from "../src/lib/search-console-store";
import type { SearchConsoleReportPayload } from "../src/lib/search-console-types";
import { connectSavedSearchConsoleWebsite } from "../src/lib/connected-websites";
import { ScanError } from "../src/lib/scanner";

/** Real D1 with synthetic identities and evidence; never reads .dev.vars or .wrangler/state. */
function runtime(directory: string) {
  return new Miniflare({
    host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: {
      name: "folio-search-console-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: {
        "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding only", { status: 404 }); } };' },
      } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000008" } },
    } }],
  });
}

async function setup(db: D1Database) {
  for (const name of ["0001_initial.sql", "0008_search_console_reports.sql"]) {
    const statements = unstable_splitSqlQuery(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
    await db.batch(statements.map(sql => db.prepare(sql)));
  }
  for (const owner of ["alice", "bob"]) {
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
    await db.prepare(`INSERT INTO account(id,account_id,provider_id,user_id,access_token,refresh_token,id_token,scope,created_at,updated_at)
      VALUES(?,?,'google',?,?,?,?,?,?,?)`).bind(`${owner}-google`, `${owner}-sub`, owner, "synthetic-access", "synthetic-refresh", "synthetic-identity", `openid ${SEARCH_CONSOLE_SCOPE}`, Date.now(), Date.now()).run();
    await db.prepare(`INSERT INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at)
      VALUES(?,?,'credential',?,?,?,?)`).bind(`${owner}-password`, owner, owner, "synthetic-password-hash", Date.now(), Date.now()).run();
  }
}

const fixture: SearchConsoleReportPayload = {
  property: "sc-domain:example.test", startDate: "2026-08-14", endDate: "2026-09-10", fetchedAt: "2026-09-13T00:00:00Z",
  totals: null, daily: [], queries: [{ keys: ["synthetic search"], clicks: 3, impressions: 10, ctr: 0.3, position: 4 }], pages: [],
  status: "partial", warnings: ["Synthetic fixture with unavailable totals."], rowLimit: 1000,
};

test("real D1 saves private GSC snapshots, serializes the cap, preserves history on disconnect and survives restart", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-search-console-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory);
    const db = await current.getD1Database("DB");
    await setup(db);
    const original = await saveSearchConsoleReport(db, "alice", fixture);
    const bob = await saveSearchConsoleReport(db, "bob", fixture);
    assert.equal(await getSavedSearchConsoleReport(db, "bob", original.id), null);
    assert.equal((await listSavedSearchConsoleReports(db, "alice")).length, 1);
    for (let i = 1; i < 49; i++) await saveSearchConsoleReport(db, "alice", fixture);
    const raced = await Promise.allSettled(Array.from({ length: 6 }, () => saveSearchConsoleReport(db, "alice", fixture)));
    assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
    for (const result of raced) if (result.status === "rejected") assert.ok(result.reason instanceof SearchConsoleStoreError && result.reason.status === 429);
    assert.equal((await listSavedSearchConsoleReports(db, "alice")).length, 50);
    assert.deepEqual(await getSavedSearchConsoleReport(db, "alice", original.id), original);

    assert.equal((await searchConsoleAccount(db, "alice"))?.id, "alice-google");
    await disconnectSearchConsole(db, "alice");
    assert.equal(await searchConsoleAccount(db, "alice"), null);
    assert.equal((await searchConsoleAccount(db, "bob"))?.id, "bob-google");
    const disconnected = await db.prepare("SELECT user_id,account_id,access_token,refresh_token,id_token,scope FROM account WHERE id=?").bind("alice-google").first();
    assert.deepEqual(disconnected, { user_id: "alice", account_id: "alice-sub", access_token: null, refresh_token: null, id_token: null, scope: null });
    const password = await db.prepare("SELECT password FROM account WHERE id=?").bind("alice-password").first<{ password: string }>();
    assert.equal(password?.password, "synthetic-password-hash");
    assert.deepEqual(await getSavedSearchConsoleReport(db, "alice", original.id), original);

    await current.dispose(); current = undefined;
    current = runtime(directory);
    const restored = await current.getD1Database("DB");
    assert.deepEqual(await getSavedSearchConsoleReport(restored, "alice", original.id), original);
    assert.equal((await listSavedSearchConsoleReports(restored, "alice")).length, 50);
    assert.equal(await searchConsoleAccount(restored, "alice"), null);
    await assert.rejects(saveSearchConsoleReport(restored, "alice", fixture), SearchConsoleStoreError);
    await restored.prepare("DELETE FROM user WHERE id=?").bind("alice").run();
    assert.deepEqual(await listSavedSearchConsoleReports(restored, "alice"), []);
    assert.equal((await getSavedSearchConsoleReport(restored, "bob", bob.id))?.id, bob.id);
    await assert.rejects(saveSearchConsoleReport(restored, "nonexistent-owner", fixture), /FOREIGN KEY/i);
  } finally {
    try { await current?.dispose(); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test("saved Search Console reports connect exact owned private websites with idempotency and atomic capacity", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-connected-websites-d1-"));
  let current: Miniflare | undefined;
  try {
    current = runtime(directory); const db = await current.getD1Database("DB"); await setup(db);
    const domain = await saveSearchConsoleReport(db, "alice", { ...fixture, property: "sc-domain:example.com" });
    const prefix = await saveSearchConsoleReport(db, "alice", { ...fixture, property: "https://docs.example.com/reference/" });
    await assert.rejects(connectSavedSearchConsoleWebsite(db, "bob", domain.id), error => error instanceof ScanError && error.status === 404);
    await assert.rejects(connectSavedSearchConsoleWebsite(db, "", domain.id), error => error instanceof ScanError && error.status === 401);
    await disconnectSearchConsole(db, "alice");
    const connected = await connectSavedSearchConsoleWebsite(db, "alice", domain.id);
    assert.equal(connected.url, "https://example.com/"); assert.equal(connected.name, "example.com");
    assert.equal(connected.isPublic, false); assert.equal(connected.seoScore, null); assert.equal(connected.lastScannedAt, null);
    const duplicates = await Promise.all(Array.from({length: 5}, () => connectSavedSearchConsoleWebsite(db, "alice", domain.id)));
    assert.ok(duplicates.every(site => site.id === connected.id));
    await db.prepare("UPDATE sites SET is_public=1 WHERE id=? AND user_id=?").bind(connected.id, "alice").run();
    assert.equal((await connectSavedSearchConsoleWebsite(db, "alice", domain.id)).isPublic, true);
    const prefixed = await connectSavedSearchConsoleWebsite(db, "alice", prefix.id);
    assert.equal(prefixed.url, "https://docs.example.com/reference/");
    for (const property of ["http://example.com/", "sc-domain:localhost", "sc-domain:example.com/extra", "https://127.0.0.1/", "https://user:secret@example.com/"]) {
      const invalid = await saveSearchConsoleReport(db, "bob", { ...fixture, property });
      await assert.rejects(connectSavedSearchConsoleWebsite(db, "bob", invalid.id), error => error instanceof ScanError && error.status === 400);
    }
    const candidates = await Promise.all(Array.from({length: 6}, (_, index) => saveSearchConsoleReport(db, "alice", { ...fixture, property: `sc-domain:race-${index}.example.com` })));
    await db.batch(Array.from({length: 97}, (_, index) => db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)")
      .bind(`fixture-site-${index}`, "alice", `https://fixture-${index}.example.com/`, "Fixture", Date.now())));
    const raced = await Promise.allSettled(candidates.map(report => connectSavedSearchConsoleWebsite(db, "alice", report.id)));
    assert.equal(raced.filter(result => result.status === "fulfilled").length, 1);
    for (const result of raced) if (result.status === "rejected") assert.ok(result.reason instanceof ScanError && result.reason.status === 409);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM sites WHERE user_id=?").bind("alice").first<{count:number}>())?.count, 100);
    assert.equal((await connectSavedSearchConsoleWebsite(db, "alice", domain.id)).id, connected.id);
    const bobDomain = await saveSearchConsoleReport(db, "bob", { ...fixture, property: domain.property });
    assert.notEqual((await connectSavedSearchConsoleWebsite(db, "bob", bobDomain.id)).id, connected.id);
    await current.dispose(); current = undefined; current = runtime(directory);
    const restored = await current.getD1Database("DB");
    const afterRestart = await connectSavedSearchConsoleWebsite(restored, "alice", domain.id);
    assert.equal(afterRestart.id, connected.id); assert.equal(afterRestart.isPublic, true);
    assert.deepEqual(await getSavedSearchConsoleReport(restored, "alice", domain.id), domain);
  } finally {
    try { await current?.dispose(); } finally { await rm(directory, {recursive: true, force: true}); }
  }
});
