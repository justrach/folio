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
import { AgentApiError, authenticateAgentApiKey, createAgentApiKey, listAgentApiKeys } from "../src/lib/agent-api-key-store";
import { workspaceSearchIndex } from "../src/lib/workspace-search";
import { serveFolioMcp } from "../src/lib/folio-mcp";
import { acceptInvite, addMemberByEmail, agentOrganizations, cancelEmailInvite, claimEmailInvites, createInvite, createOrganization, getOrganization, leaveOrganization,
  listOrganizations, previewInvite, readableWebsite, removeMember, revokeInvite, setMemberRole, shareWebsite, unshareWebsite } from "../src/lib/organizations";
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

test("D1: an owner adds someone by email before they have an account; they join on their first verified sign-in", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-organizations-email-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  const signUp = (id: string, email: string, verified: boolean) => db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .bind(id, id[0].toUpperCase() + id.slice(1), email, verified ? 1 : 0, Date.now(), Date.now()).run();
  let db: D1Database;
  try {
    db = await current.getD1Database("DB"); await setup(db);
    const org = await createOrganization(db, "rach", { name: "Manus" });
    await acceptInvite(db, "avery", (await createInvite(db, "rach", org.id)).token);

    // Only owners add by email; the address is checked and stored lowercased; members already in are refused.
    const added = await addMemberByEmail(db, "rach", org.id, "  Natalie@Manus.Test ");
    assert.equal(added.pending.email, "natalie@manus.test");
    await rejects(addMemberByEmail(db, "avery", org.id, "someone@manus.test"), 403);
    await rejects(addMemberByEmail(db, "outsider", org.id, "someone@manus.test"), 404);
    await rejects(addMemberByEmail(db, "rach", org.id, "not an email"), 400);
    await rejects(addMemberByEmail(db, "rach", org.id, "AVERY@example.test"), 409);
    // Adding the same email again extends the wait instead of adding a second row.
    const again = await addMemberByEmail(db, "rach", org.id, "natalie@manus.test", Date.now() + 1000);
    assert.equal(again.pending.id, added.pending.id);
    const owner = await getOrganization(db, "rach", org.id);
    assert.deepEqual(owner.pending!.map(item => [item.email, item.addedBy]), [["natalie@manus.test", "Rach"]]);
    assert.equal((await getOrganization(db, "avery", org.id)).pending, null, "members don't see waiting emails");
    assert.equal(owner.members.length, 2, "a waiting email is not a member yet");

    // Someone who registers that address without verifying it claims nothing.
    await addMemberByEmail(db, "rach", org.id, "unverified@manus.test");
    await signUp("impostor", "unverified@manus.test", false);
    assert.deepEqual(await claimEmailInvites(db, "impostor"), []);
    assert.equal((await listOrganizations(db, "impostor")).length, 0);

    // The real person signs in with Google (verified, any letter case) and joins on their first read.
    await signUp("natalie", "Natalie@manus.test", true);
    assert.deepEqual(await claimEmailInvites(db, "natalie"), [{ id: org.id, name: "Manus", addedBy: "Rach" }]);
    assert.deepEqual(await claimEmailInvites(db, "natalie"), [], "claiming twice is harmless");
    assert.deepEqual((await listOrganizations(db, "natalie")).map(item => [item.name, item.role]), [["Manus", "member"]]);
    const after = await getOrganization(db, "rach", org.id);
    assert.deepEqual(after.members.map(member => [member.name, member.role]), [["Rach", "owner"], ["Avery", "member"], ["Natalie", "member"]]);
    assert.deepEqual(after.pending!.map(item => item.email), ["unverified@manus.test"]);

    // An agent's first folio_organizations read claims too; an expired wait does not.
    await addMemberByEmail(db, "rach", org.id, "sam@example.test");
    await db.prepare("UPDATE user SET email_verified = 1 WHERE id = 'sam'").run();
    assert.deepEqual((await agentOrganizations(db, "sam")).items.map(item => item.name), ["Manus"]);
    await addMemberByEmail(db, "rach", org.id, "late@manus.test", Date.now() - 31 * 86_400_000);
    await signUp("late", "late@manus.test", true);
    assert.deepEqual(await claimEmailInvites(db, "late"), []);

    // Cancelling stops the join; only owners cancel.
    const cancelled = await addMemberByEmail(db, "rach", org.id, "changed-mind@manus.test");
    await rejects(cancelEmailInvite(db, "avery", org.id, cancelled.pending.id), 403);
    await cancelEmailInvite(db, "rach", org.id, cancelled.pending.id);
    await rejects(cancelEmailInvite(db, "rach", org.id, cancelled.pending.id), 404);
    await signUp("changed", "changed-mind@manus.test", true);
    assert.deepEqual(await claimEmailInvites(db, "changed"), []);

    // Deleting the organization removes every waiting email.
    for (const id of ["avery", "natalie", "sam"]) await leaveOrganization(db, id, org.id);
    assert.deepEqual(await leaveOrganization(db, "rach", org.id), { deleted: true });
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM organization_email_invites").first<{ n: number }>())!.n, 0);
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("D1: a key approved for some organizations reads only what they share, plus the person's own websites", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-organizations-limit-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const manus = await createOrganization(db, "rach", { name: "Manus" }), other = await createOrganization(db, "rach", { name: "Other client" });
    const elsewhere = await createOrganization(db, "sam", { name: "Sam's team" });
    for (const org of [manus, other]) await acceptInvite(db, "avery", (await createInvite(db, "rach", org.id)).token);
    await shareWebsite(db, "rach", manus.id, "site-manus");
    await shareWebsite(db, "rach", other.id, "site-private");

    // The limit is checked when the key is approved: only organizations the person belongs to, no repeats.
    await rejects(createAgentApiKey(db, "avery", { name: "x", scopes: ["read"], organizations: [elsewhere.id] }), 403);
    await rejects(createAgentApiKey(db, "avery", { name: "x", scopes: ["read"], organizations: [manus.id, manus.id] }), 400);
    await rejects(createAgentApiKey(db, "avery", { name: "x", scopes: ["read"], organizations: "all" as never }), 400);
    const limited = await createAgentApiKey(db, "avery", { name: "Avery's Cursor", scopes: ["read"], organizations: [manus.id] });
    const own = await createAgentApiKey(db, "avery", { name: "Avery's Codex", scopes: ["read"], organizations: [] });
    const all = await createAgentApiKey(db, "avery", { name: "Avery's Claude Code", scopes: ["read"] });
    assert.deepEqual((await listAgentApiKeys(db, "avery")).map(key => [key.name, key.organizations]).sort(),
      [["Avery's Claude Code", null], ["Avery's Codex", []], ["Avery's Cursor", [manus.id]]]);
    assert.deepEqual((await authenticateAgentApiKey(db, limited.token, "read")).organizations, [manus.id]);

    const connect = async (token: string) => {
      const client = new Client({ name: "limited-agent", version: "1" });
      await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), { db, principal: await authenticateAgentApiKey(db, token, "read"), env: {} }) }));
      return client;
    };
    type Listed = { result: { items: { name: string }[]; note: string } };
    const reads = async (token: string) => {
      const client = await connect(token);
      try {
        const listed = (await client.callTool({ name: "folio_organizations", arguments: {} })).structuredContent as Listed;
        const gap = async (websiteId: string) => { const result = (await client.callTool({ name: "folio_website_gaps", arguments: { websiteId } })).structuredContent as { result?: WebsiteGapsReport; error?: { code: string } };
          return result.result ? result.result.website.organizations.map(org => org.name).join("+") || result.result.website.access : result.error!.code; };
        return { organizations: listed.result.items.map(item => item.name), note: listed.result.note,
          manus: await gap("site-manus"), other: await gap("site-private"), mine: await gap("site-avery") };
      } finally { await client.close(); }
    };
    // Limited to Manus: Manus's shared website and Avery's own; the other organization's is not found, as if it didn't exist.
    const manusOnly = await reads(limited.token);
    assert.deepEqual([manusOnly.organizations, manusOnly.manus, manusOnly.other, manusOnly.mine], [["Manus"], "Manus", "not_found", "owner"]);
    assert.match(manusOnly.note, /approved for some of the person's organizations/);
    // No organizations: own websites only.
    const ownOnly = await reads(own.token);
    assert.deepEqual([ownOnly.organizations, ownOnly.manus, ownOnly.other, ownOnly.mine], [[], "not_found", "not_found", "owner"]);
    assert.match(ownOnly.note, /their own websites only/);
    // Unlimited (every key made before this): everything the person can read.
    const everything = await reads(all.token);
    assert.deepEqual([everything.organizations, everything.manus, everything.other, everything.mine], [["Manus", "Other client"], "Manus", "Other client", "owner"]);
    assert.doesNotMatch(everything.note, /approved for/);
    // Search follows the same limit.
    assert.deepEqual((await workspaceSearchIndex(db, "avery", [manus.id])).organizations.map(org => [org.name, org.domains]), [["Manus", ["manusfixture.com"]]]);
    assert.deepEqual((await workspaceSearchIndex(db, "avery")).organizations.map(org => org.name), ["Manus", "Other client"]);
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
