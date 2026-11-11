import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { AgentApiError } from "../src/lib/agent-api-key-store";
import { addMemberByEmail, acceptInvite, createInvite, createOrganization, shareWebsite } from "../src/lib/organizations";
import { workspaceSearchIndex } from "../src/lib/workspace-search";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-search-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000030" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["rach", "avery", "outsider"]) await db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)")
    .bind(id, id[0].toUpperCase() + id.slice(1), `${id}@example.test`, Date.now(), Date.now()).run();
  await db.batch([
    db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-manus','rach','https://www.manusfixture.com/','Manus fixture',1,0)"),
    db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-private','rach','https://privatefixture.com/','privatefixture.com',2,0)"),
    db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES('seo-done','rach','manusfixture.com',1762732800000,1762732800000,'{}')"),
    db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES('seo-pending','rach','privatefixture.com',1762646400000,NULL,NULL)"),
    db.prepare("INSERT INTO search_console_reports(id,user_id,property,created_at,report_json,summary_json) VALUES('gsc-1','rach','sc-domain:manusfixture.com',1762646400000,'{}','{}')"),
  ]);
}

test("D1: search lists what each person can open, names and IDs only, and changes nothing", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-workspace-search-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const org = await createOrganization(db, "rach", { name: "Manus" });
    await shareWebsite(db, "rach", org.id, "site-manus");
    await acceptInvite(db, "avery", (await createInvite(db, "rach", org.id)).token);
    // An email invite for the outsider stays waiting: searching must not join them.
    await addMemberByEmail(db, "rach", org.id, "outsider@example.test");

    const owner = await workspaceSearchIndex(db, "rach");
    assert.deepEqual(owner.websites.map(site => site.id), ["site-private", "site-manus"]);
    assert.deepEqual(owner.seoReports, [
      { id: "seo-done", domain: "manusfixture.com", createdAt: "2025-11-10T00:00:00.000Z", complete: true },
      { id: "seo-pending", domain: "privatefixture.com", createdAt: "2025-11-09T00:00:00.000Z", complete: false },
    ]);
    assert.deepEqual(owner.searchConsole.map(report => [report.id, report.property]), [["gsc-1", "sc-domain:manusfixture.com"]]);
    assert.deepEqual(owner.organizations.map(item => [item.name, item.role, item.members, item.domains]), [["Manus", "owner", 2, ["manusfixture.com"]]]);
    assert.ok(!JSON.stringify(owner).includes("result_json") && !JSON.stringify(owner).includes("@example.test"), "no report bodies or emails");

    // A teammate finds the organization and the domain it shares, never the owner's private websites or reports.
    const teammate = await workspaceSearchIndex(db, "avery");
    assert.deepEqual([teammate.websites, teammate.seoReports, teammate.searchConsole], [[], [], []]);
    assert.deepEqual(teammate.organizations.map(item => [item.name, item.role, item.domains]), [["Manus", "member", ["manusfixture.com"]]]);

    const outsider = await workspaceSearchIndex(db, "outsider");
    assert.deepEqual(outsider, { websites: [], seoReports: [], searchConsole: [], organizations: [] });
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM organization_email_invites").first<{ n: number }>())!.n, 1, "the waiting invite is untouched");
    await assert.rejects(workspaceSearchIndex(db, ""), error => error instanceof AgentApiError && error.status === 401);
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
