import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentApiError, authenticateAgentApiKey, listAgentApiKeys } from "../src/lib/agent-api-key-store";
import { serveFolioMcp } from "../src/lib/folio-mcp";
import { acceptInvite, createInvite, createOrganization, shareWebsite } from "../src/lib/organizations";
import { OAuthError, OAuthPageError, OAuthRedirectError, approveAuthorization, exchangeToken, previewAuthorization, registerClient, revokeToken } from "../src/lib/mcp-oauth";

const origin = "https://folio.example", resource = `${origin}/api/mcp`;
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-oauth-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000031" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["rach", "avery"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id[0].toUpperCase() + id.slice(1), `${id}@example.test`, Date.now(), Date.now()).run();
  await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at,is_public) VALUES('site-manus','rach','https://manusfixture.com/','manusfixture.com',1,0)").run();
}
const pkce = () => { const verifier = randomBytes(32).toString("base64url"); return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") }; };
const authorize = (clientId: string, redirectUri: string, challenge: string, extra: Record<string, string> = {}) =>
  new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: "S256", state: "s-1", resource, ...extra });
const form = (values: Record<string, string>) => new URLSearchParams(values);
const codeOf = (location: string) => new URL(location).searchParams.get("code")!;
const oauthError = (promise: Promise<unknown>, code: string, kind: typeof OAuthError = OAuthError) =>
  assert.rejects(promise, error => error instanceof kind && (error as OAuthError).error === code);

/** An MCP client on an OAuth access token, the way /api/mcp authenticates it. */
async function mcp(db: D1Database, token: string, forResource = resource) {
  const client = new Client({ name: "oauth-client", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(resource), { fetch: async (url, init) =>
    serveFolioMcp(new Request(url, init), { db, principal: await authenticateAgentApiKey(db, token, "read", { resource: forResource }), env: {} }) }));
  return client;
}

test("D1: an app registers, the person approves on the consent page, and the app reads Folio with rotating tokens", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-oauth-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const manus = await createOrganization(db, "rach", { name: "Manus" }), other = await createOrganization(db, "rach", { name: "Other client" });
    await shareWebsite(db, "rach", manus.id, "site-manus");
    await acceptInvite(db, "avery", (await createInvite(db, "rach", manus.id)).token);

    // Registration: public by default; return addresses must be https, localhost, or an app's own scheme.
    await oauthError(registerClient(db, { redirect_uris: ["http://evil.example/cb"] }), "invalid_redirect_uri");
    await oauthError(registerClient(db, { redirect_uris: ["javascript:alert(1)"] }), "invalid_redirect_uri");
    await oauthError(registerClient(db, { redirect_uris: ["https://claude.ai/api/mcp/auth_callback#x"] }), "invalid_redirect_uri");
    await oauthError(registerClient(db, { redirect_uris: ["https://claude.ai/cb"], grant_types: ["client_credentials"] }), "invalid_client_metadata");
    const claude = await registerClient(db, { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" });
    assert.match(claude.client_id, /^folio_client_[a-f0-9]{32}$/);
    assert.equal("client_secret" in claude, false);
    const cursor = await registerClient(db, { client_name: "Cursor", redirect_uris: ["cursor://anysphere.cursor-retrieval/oauth/callback", "http://127.0.0.1/callback"] });

    // The consent page: client and return-address problems stay on Folio's page; others go back to the app.
    const { verifier, challenge } = pkce();
    await oauthError(previewAuthorization(db, "rach", authorize("folio_client_nope", "https://claude.ai/api/mcp/auth_callback", challenge), origin), "invalid_client", OAuthPageError);
    await oauthError(previewAuthorization(db, "rach", authorize(claude.client_id, "https://attacker.example/cb", challenge), origin), "invalid_request", OAuthPageError);
    await assert.rejects(previewAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge, { code_challenge_method: "plain" }), origin),
      error => error instanceof OAuthRedirectError && new URL(error.location).searchParams.get("error") === "invalid_request" && new URL(error.location).searchParams.get("state") === "s-1");
    await assert.rejects(previewAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge, { resource: "https://other.example/mcp" }), origin),
      error => error instanceof OAuthRedirectError && new URL(error.location).searchParams.get("error") === "invalid_target");
    await assert.rejects(previewAuthorization(db, "", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge), origin), error => error instanceof AgentApiError && error.status === 401);
    const preview = await previewAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge, { scope: "read changes unknown" }), origin);
    assert.deepEqual([preview.client.name, preview.client.kind, preview.redirect.label, preview.redirect.local, preview.requested], ["Claude", "registered", "claude.ai", false, ["read", "changes"]]);
    assert.equal(new URL(preview.cancel).searchParams.get("error"), "access_denied");
    // An app on this computer may come back on any port.
    const local = await previewAuthorization(db, "rach", authorize(cursor.client_id, "http://127.0.0.1:53110/callback", challenge), origin);
    assert.deepEqual([local.redirect.label, local.redirect.local], ["127.0.0.1:53110", true]);

    // Approve read access for Manus only.
    const choice = { scopes: ["read"], organizations: [manus.id], name: "Rach’s Claude", expiresInDays: 90 };
    await assert.rejects(approveAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge), { ...choice, scopes: ["changes"] }, origin), AgentApiError);
    const approved = await approveAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challenge), choice, origin);
    const back = new URL(approved.location);
    assert.deepEqual([back.origin + back.pathname, back.searchParams.get("state"), back.searchParams.get("iss")], ["https://claude.ai/api/mcp/auth_callback", "s-1", origin]);
    const code = codeOf(approved.location);

    // The token endpoint checks the client, the return address and PKCE. A code is spent by its first use, right or wrong.
    const exchange = (values: Record<string, string>) => exchangeToken(db, form({ grant_type: "authorization_code", client_id: claude.client_id, ...values }), null, origin);
    const fresh = async (challengeFor: string) => codeOf((await approveAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", challengeFor), choice, origin)).location);
    await oauthError(exchangeToken(db, form({ grant_type: "authorization_code", client_id: cursor.client_id, code, code_verifier: verifier }), null, origin), "invalid_grant");
    await oauthError(exchange({ code, code_verifier: verifier }), "invalid_grant");
    const wrong = pkce();
    await oauthError(exchange({ code: await fresh(challenge), code_verifier: wrong.verifier }), "invalid_grant");
    await oauthError(exchange({ code: await fresh(challenge), code_verifier: verifier, redirect_uri: "https://claude.ai/elsewhere" }), "invalid_grant");
    await oauthError(exchange({ code: await fresh(challenge), code_verifier: verifier, resource: "https://other.example/mcp" }), "invalid_target");
    await oauthError(exchangeToken(db, form({ grant_type: "password", client_id: claude.client_id }), null, origin), "unsupported_grant_type");
    const good = await fresh(challenge);
    const tokens = await exchange({ code: good, code_verifier: verifier, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource });
    assert.match(tokens.access_token, /^folio_at_[a-f0-9]{64}$/);
    assert.match(tokens.refresh_token, /^folio_rt_[a-f0-9]{64}$/);
    assert.deepEqual([tokens.token_type, tokens.expires_in, tokens.scope], ["Bearer", 3600, "read"]);
    await oauthError(exchange({ code: good, code_verifier: verifier }), "invalid_grant");

    // The connection is an ordinary key (limit included); the app never had it.
    const keys = await listAgentApiKeys(db, "rach");
    assert.deepEqual(keys.filter(key => !key.revokedAt).map(key => [key.name, key.scopes, key.organizations]), [["Rach’s Claude", ["read"], [manus.id]]]);

    // The access token reads Folio over MCP, within its organization limit, only for Folio's MCP endpoint.
    const client = await mcp(db, tokens.access_token);
    try {
      const listed = (await client.callTool({ name: "folio_organizations", arguments: {} })).structuredContent as { result: { items: { name: string }[] } };
      assert.deepEqual(listed.result.items.map(item => item.name), ["Manus"]);
    } finally { await client.close(); }
    await assert.rejects(authenticateAgentApiKey(db, tokens.access_token, "read"), error => error instanceof AgentApiError && error.status === 401);
    await assert.rejects(authenticateAgentApiKey(db, tokens.access_token, "read", { resource: "https://other.example/api/mcp" }), error => error instanceof AgentApiError && error.code === "invalid_token");
    await assert.rejects(authenticateAgentApiKey(db, tokens.access_token, "changes", { resource }), error => error instanceof AgentApiError && error.status === 403);
    // An hour later the access token has expired; the refresh token rotates and works once.
    const later = Date.now() + 3_700_000;
    await assert.rejects(authenticateAgentApiKey(db, tokens.access_token, "read", { resource, now: new Date(later) }), error => error instanceof AgentApiError && error.code === "invalid_token");
    const refreshed = await exchangeToken(db, form({ grant_type: "refresh_token", client_id: claude.client_id, refresh_token: tokens.refresh_token }), null, origin, later);
    assert.notEqual(refreshed.refresh_token, tokens.refresh_token);
    assert.equal((await authenticateAgentApiKey(db, refreshed.access_token, "read", { resource, now: new Date(later) })).organizations![0], manus.id);
    await oauthError(exchangeToken(db, form({ grant_type: "refresh_token", client_id: claude.client_id, refresh_token: tokens.refresh_token }), null, origin, later), "invalid_grant");
    await oauthError(exchangeToken(db, form({ grant_type: "refresh_token", client_id: cursor.client_id, refresh_token: refreshed.refresh_token }), null, origin, later), "invalid_grant");

    // Reconnecting the same app replaces its connection instead of adding a key.
    const again = pkce();
    const reconnected = await exchangeToken(db, form({ grant_type: "authorization_code", client_id: claude.client_id, code_verifier: again.verifier,
      code: codeOf((await approveAuthorization(db, "rach", authorize(claude.client_id, "https://claude.ai/api/mcp/auth_callback", again.challenge), { ...choice, organizations: null }, origin, later)).location) }), null, origin, later);
    assert.equal((await listAgentApiKeys(db, "rach")).filter(key => !key.revokedAt).length, 1);
    await assert.rejects(authenticateAgentApiKey(db, refreshed.access_token, "read", { resource, now: new Date(later) }), error => error instanceof AgentApiError && error.status === 401);
    assert.equal((await authenticateAgentApiKey(db, reconnected.access_token, "read", { resource, now: new Date(later) })).organizations, null);

    // Revoking the refresh token disconnects the app; revoking the key in Folio does too.
    await revokeToken(db, form({ client_id: claude.client_id, token: reconnected.refresh_token }), null, later);
    await assert.rejects(authenticateAgentApiKey(db, reconnected.access_token, "read", { resource, now: new Date(later) }), error => error instanceof AgentApiError && error.status === 401);
    await oauthError(exchangeToken(db, form({ grant_type: "refresh_token", client_id: claude.client_id, refresh_token: reconnected.refresh_token }), null, origin, later), "invalid_grant");
    assert.equal((await listAgentApiKeys(db, "rach")).filter(key => !key.revokedAt).length, 0);
    await revokeToken(db, form({ client_id: claude.client_id, token: "folio_rt_" + "0".repeat(64) }), null, later);

    // A client that asked for a secret must send it, in the form or with HTTP Basic.
    const confidential = await registerClient(db, { client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "client_secret_basic" });
    assert.match(confidential.client_secret!, /^folio_cs_[a-f0-9]{64}$/);
    const c = pkce();
    const chatCode = codeOf((await approveAuthorization(db, "avery", authorize(confidential.client_id, "https://chatgpt.com/connector_platform_oauth_redirect", c.challenge), { ...choice, organizations: [], name: "Avery’s ChatGPT" }, origin)).location);
    await oauthError(exchangeToken(db, form({ grant_type: "authorization_code", client_id: confidential.client_id, code: chatCode, code_verifier: c.verifier }), null, origin), "invalid_client");
    const basic = `Basic ${Buffer.from(`${confidential.client_id}:${confidential.client_secret}`).toString("base64")}`;
    const chat = await exchangeToken(db, form({ grant_type: "authorization_code", code: codeOf((await approveAuthorization(db, "avery",
      authorize(confidential.client_id, "https://chatgpt.com/connector_platform_oauth_redirect", c.challenge), { ...choice, organizations: [], name: "Avery’s ChatGPT" }, origin)).location), code_verifier: c.verifier }), basic, origin);
    assert.deepEqual((await authenticateAgentApiKey(db, chat.access_token, "read", { resource })).organizations, []);
    // Avery isn't in Other client, so a connection can't be limited to it.
    await assert.rejects(approveAuthorization(db, "avery", authorize(confidential.client_id, "https://chatgpt.com/connector_platform_oauth_redirect", c.challenge), { ...choice, organizations: [other.id] }, origin),
      error => error instanceof AgentApiError && error.status === 403);
    // Only hashes are stored.
    const stored = JSON.stringify([(await db.prepare("SELECT * FROM oauth_tokens").all()).results, (await db.prepare("SELECT * FROM oauth_codes").all()).results, (await db.prepare("SELECT * FROM oauth_clients").all()).results]);
    for (const secret of [chat.access_token, chat.refresh_token, confidential.client_secret!, chatCode]) assert.equal(stored.includes(secret), false);
    assert.equal(provider.mock.callCount(), 0);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("D1: an app identified by its metadata document URL is checked against that document", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-oauth-cimd-")), current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const id = "https://app.example.com/oauth/client.json";
    const document = { client_id: id, client_name: "Example MCP", redirect_uris: ["https://app.example.com/callback"], token_endpoint_auth_method: "none" };
    let fetched = 0;
    const fetcher = (async (url: URL | RequestInfo) => { fetched++; return Response.json(String(url) === id ? document : {}); }) as typeof fetch;
    const { verifier, challenge } = pkce();
    const preview = await previewAuthorization(db, "rach", authorize(id, "https://app.example.com/callback", challenge), origin, Date.now(), fetcher);
    assert.deepEqual([preview.client.name, preview.client.kind, preview.client.host], ["Example MCP", "metadata", "app.example.com"]);
    await oauthError(previewAuthorization(db, "rach", authorize(id, "https://elsewhere.example/callback", challenge), origin, Date.now(), fetcher), "invalid_request", OAuthPageError);
    // The document is cached for a day.
    const approved = await approveAuthorization(db, "rach", authorize(id, "https://app.example.com/callback", challenge), { scopes: ["read"], organizations: null, name: "Example", expiresInDays: 7 }, origin, Date.now(), fetcher);
    const tokens = await exchangeToken(db, form({ grant_type: "authorization_code", client_id: id, code: codeOf(approved.location), code_verifier: verifier }), null, origin, Date.now(), fetcher);
    assert.match(tokens.access_token, /^folio_at_/);
    assert.equal(fetched, 1);
    // A document that doesn't name itself, private hosts and plain http are refused.
    const liar = (async () => Response.json({ ...document, client_id: "https://someone-else.example/client.json" })) as typeof fetch;
    await oauthError(previewAuthorization(db, "rach", authorize("https://liar.example/client.json", "https://app.example.com/callback", challenge), origin, Date.now(), liar), "invalid_client", OAuthPageError);
    for (const bad of ["https://127.0.0.1/client.json", "https://localhost/client.json", "https://app.example.com/", "http://app.example.com/client.json"])
      await oauthError(previewAuthorization(db, "rach", authorize(bad, "https://app.example.com/callback", challenge), origin, Date.now(), fetcher), "invalid_client", OAuthPageError);
    assert.equal(fetched, 1);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
