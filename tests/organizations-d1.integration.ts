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
import { serveFolioMcp } from "../src/lib/folio-mcp";
import { acceptInvite, createInvite, createOrganization, getOrganization, leaveOrganization, listOrganizations, previewInvite, readableWebsite,
  removeMember, revokeInvite, setMemberRole, shareWebsite, unshareWebsite } from "../src/lib/organizations";
import { loadWebsiteGaps, type WebsiteGapsReport } from "../src/lib/website-gaps";
import { listIndexAsks } from "../src/lib/index-asks";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-organization-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000029" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["rach", "avery", "sam", "outsider"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id[0].toUpperCase() + id.slice(1), `${id}@example.test`, Date.now(), Date.now()).run();
  await db.batch([
    db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-manus','rach','https://manusfixture.com/','manusfixture.com',1,0)"),
    db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-private','rach','https://privatefixture.com/','privatefixture.com',2,0)"),
    db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-avery','avery','https://averyfixture.com/','averyfixture.com',3,0)"),
    db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at,retrieved_at,result_json) VALUES('seo-manus','rach','manusfixture.com',10,'2026-11-10T00:00:00.000Z',?)")
      .bind(JSON.stringify({ domain: "manusfixture.com", fetchedAt: "2026-11-10T00:00:00.000Z", status: "complete", organic: { status: "success", data: { organicKeywords: 900, estimatedMonthlyTraffic: 50 } }, backlinks: { status: "success", data: { backlinks: 40, referringDomains: 5, brokenBacklinks: 0 } } })),
  ]);
}
const rejects = (promise: Promise<unknown>, status: number) => assert.rejects(promise, error => error instanceof AgentApiError && error.status === status);

test("D1: anyone can create or join an organization; shared websites, agents and roles follow membership", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-organizations-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    // Create: the creator is the owner; names are bounded.
    const org = await createOrganization(db, "rach", { name: "  Manus   team " });
    assert.deepEqual([org.name, org.role, org.members], ["Manus team", "owner", 1]);
    await rejects(createOrganization(db, "rach", { name: "" }), 400);
    await rejects(createOrganization(db, "", { name: "x" }), 401);

    // Invite: only owners create links; the secret is returned once and only its hash is stored.
    const { token, invite } = await createInvite(db, "rach", org.id);
    assert.match(token, /^folio_join_[a-f0-9]{48}$/);
    assert.equal(JSON.stringify((await db.prepare("SELECT * FROM organization_invites").all()).results).includes(token), false);
    await rejects(createInvite(db, "avery", org.id), 404);
    // Preview then join: a link alone adds nobody; joining twice is harmless and uses the link once.
    const preview = await previewInvite(db, "avery", token);
    assert.deepEqual([preview.organization.name, preview.invitedBy, preview.alreadyMember, preview.organization.members], ["Manus team", "Rach", false, 1]);
    assert.equal((await listOrganizations(db, "avery")).length, 0);
    assert.deepEqual(await acceptInvite(db, "avery", token), { organizationId: org.id, joined: true });
    assert.deepEqual(await acceptInvite(db, "avery", token), { organizationId: org.id, joined: false });
    assert.equal((await getOrganization(db, "rach", org.id)).invites![0].uses, 1);
    await rejects(previewInvite(db, "sam", "folio_join_" + "0".repeat(48)), 404);
    await rejects(previewInvite(db, "sam", "not-a-token"), 404);

    // Sharing: only your own website; the outsider cannot read anything.
    await shareWebsite(db, "rach", org.id, "site-manus");
    await rejects(shareWebsite(db, "avery", org.id, "site-private"), 404);
    await rejects(getOrganization(db, "outsider", org.id), 404);
    assert.equal(await readableWebsite(db, "outsider", "site-manus"), null);
    assert.equal(await readableWebsite(db, "avery", "site-private"), null);
    const readable = await readableWebsite(db, "avery", "site-manus");
    assert.deepEqual([readable?.access, readable?.ownerId, readable?.organizations], ["organization", "rach", [{ id: org.id, name: "Manus team" }]]);

    // A teammate's agent connects with its own key, finds the shared website and reads its gaps over MCP.
    const key = await createAgentApiKey(db, "avery", { name: "Avery's Claude Code", scopes: ["read"] });
    const client = new Client({ name: "teammate-agent", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), { db, principal: await authenticateAgentApiKey(db, key.token, "read"), env: {} }) }));
    try {
      const listed = (await client.callTool({ name: "folio_organizations", arguments: {} })).structuredContent as { result: { items: { name: string; websites: { websiteId: string; domain: string }[]; members: { name: string; agents: number; you: boolean }[] }[] } };
      const team = listed.result.items[0];
      assert.equal(team.name, "Manus team");
      assert.deepEqual(team.websites.map(site => [site.websiteId, site.domain]), [["site-manus", "manusfixture.com"]]);
      assert.deepEqual(team.members.map(member => [member.name, member.agents, member.you]), [["Rach", 0, false], ["Avery", 1, true]]);
      assert.ok(!JSON.stringify(listed).includes("@example.test"), "agents get names and roles, not emails");
      const gaps = (await client.callTool({ name: "folio_website_gaps", arguments: { websiteId: "site-manus" } })).structuredContent as { result: WebsiteGapsReport & { recorded: boolean } };
      assert.ok(gaps.result, JSON.stringify(gaps));
      // The teammate sees the sharing member's saved report.
      assert.deepEqual([gaps.result.website.access, gaps.result.search.reportId, gaps.result.search.referringDomains.value, gaps.result.recorded], ["organization", "seo-manus", 5, true]);
      assert.equal(((await client.callTool({ name: "folio_website_gaps", arguments: { websiteId: "site-private" } })).structuredContent as { error: { code: string } }).error.code, "not_found");
    } finally { await client.close(); }
    // The read shows up as team activity for the shared website, attributed to the agent.
    const detail = await getOrganization(db, "rach", org.id);
    assert.deepEqual(detail.activity.map(item => [item.memberName, item.agentName, item.domain]), [["Avery", "Avery's Claude Code", "manusfixture.com"]]);
    assert.deepEqual(detail.members.map(member => [member.name, member.role, member.agents.map(agent => agent.name)]), [["Rach", "owner", []], ["Avery", "member", ["Avery's Claude Code"]]]);
    assert.equal((await getOrganization(db, "avery", org.id)).invites, null, "members don't see invite links");
    assert.deepEqual((await listIndexAsks(db, "avery")).items.map(item => item.domain), ["manusfixture.com"]);

    // Roles: an organization always keeps an owner.
    await rejects(setMemberRole(db, "rach", org.id, "rach", "member"), 409);
    await rejects(leaveOrganization(db, "rach", org.id), 409);
    await rejects(setMemberRole(db, "avery", org.id, "avery", "owner"), 403);
    await setMemberRole(db, "rach", org.id, "avery", "owner");
    await setMemberRole(db, "avery", org.id, "rach", "member");
    await rejects(unshareWebsite(db, "sam", org.id, "site-manus"), 404);

    // Removing a member takes away access and the websites they shared.
    await shareWebsite(db, "avery", org.id, "site-avery");
    await rejects(removeMember(db, "rach", org.id, "avery"), 403);
    await setMemberRole(db, "avery", org.id, "rach", "owner");
    await removeMember(db, "rach", org.id, "avery");
    assert.equal(await readableWebsite(db, "avery", "site-manus"), null);
    await rejects(loadWebsiteGaps(db, "avery", "site-manus"), 404);
    assert.deepEqual((await getOrganization(db, "rach", org.id)).websites.map(site => site.websiteId), ["site-manus"]);

    // Revoked links stop working; the last member leaving deletes the organization.
    const second = await createInvite(db, "rach", org.id);
    await revokeInvite(db, "rach", org.id, second.invite.id);
    await rejects(acceptInvite(db, "sam", second.token), 404);
    assert.equal(invite.maxUses, 25);
    assert.deepEqual(await leaveOrganization(db, "rach", org.id), { deleted: true });
    assert.equal((await db.prepare("SELECT (SELECT COUNT(*) FROM organizations)+(SELECT COUNT(*) FROM organization_members)+(SELECT COUNT(*) FROM organization_websites)+(SELECT COUNT(*) FROM organization_invites) AS n").first<{ n: number }>())!.n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sites").first<{ n: number }>())!.n, 3, "websites stay with their owners");
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
