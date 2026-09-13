import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { github, google } from "better-auth/social-providers";
import { githubAccountConnected, githubAuthOptions, githubSignInConfigured, identityAuthOptions,
  GITHUB_IDENTITY_SCOPES, PRIVATE_GITHUB_HEADERS } from "../src/lib/github-auth";
import { SEARCH_CONSOLE_SCOPE } from "../src/lib/google-auth";

const credentials = { GITHUB_CLIENT_ID: "fixture-github-client", GITHUB_CLIENT_SECRET: "fixture-github-secret",
  GOOGLE_CLIENT_ID: "fixture-google-client", GOOGLE_CLIENT_SECRET: "fixture-google-secret" };

test("optional GitHub identity composes with Google without weakening verified-email or explicit-link policy", () => {
  assert.equal(githubSignInConfigured({}), false);
  assert.equal(githubSignInConfigured({ GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: " " }), false);
  assert.deepEqual(Object.keys(identityAuthOptions({}).socialProviders), []);
  assert.deepEqual(Object.keys(identityAuthOptions({ GITHUB_CLIENT_ID: "fixture", GITHUB_CLIENT_SECRET: "fixture" }).socialProviders), ["github"]);
  const options = identityAuthOptions(credentials);
  assert.deepEqual(Object.keys(options.socialProviders).sort(), ["github", "google"]);
  assert.equal(options.account.encryptOAuthTokens, true);
  assert.deepEqual(options.account.accountLinking, { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false });
  for (const providerId of ["github", "google"]) for (const action of ["create-user", "link-account", "sign-in"] as const) {
    const source = { method: "oauth" as const, action, oauth: { providerId } };
    assert.deepEqual(options.user.validateUserInfo({ user: { emailVerified: false }, source }), { error: `${providerId}_email_not_verified` });
    assert.equal(options.user.validateUserInfo({ user: { emailVerified: true }, source }), undefined);
  }
  assert.equal(options.user.validateUserInfo({ user: { emailVerified: false }, source: { method: "email-password", action: "create-user" } }), undefined);
});

test("GitHub authorization requests only identity scopes and preserves callback/state while Google consent remains separate", async () => {
  const config = identityAuthOptions(credentials);
  const input = { state: "fixture-state", codeVerifier: "fixture-code-verifier-long-enough", redirectURI: "http://localhost:3001/api/auth/callback/github" };
  const url = new URL(await github(config.socialProviders.github!).createAuthorizationURL(input));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("redirect_uri"), input.redirectURI);
  assert.equal(url.searchParams.get("state"), input.state);
  assert.deepEqual(url.searchParams.get("scope")?.split(" ").sort(), [...GITHUB_IDENTITY_SCOPES].sort());
  const googleUrl = new URL(await google(config.socialProviders.google!).createAuthorizationURL({ ...input, redirectURI: "http://localhost:3001/api/auth/callback/google", scopes: [SEARCH_CONSOLE_SCOPE] }));
  assert.ok(googleUrl.searchParams.get("scope")?.includes(SEARCH_CONSOLE_SCOPE));
});

test("installed GitHub provider verifies the selected private email and does not trust an unrelated verified address", async t => {
  let publicEmail: string | null = null;
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url === "https://api.github.com/user") return Response.json({ id: 123, login: "synthetic-user", name: "Synthetic User", email: publicEmail, avatar_url: "https://example.test/avatar.png" });
    if (url === "https://api.github.com/user/emails") return Response.json([
      { email: "primary@example.test", primary: true, verified: true },
      { email: "unverified@example.test", primary: false, verified: false },
    ]);
    throw new Error("Unexpected fixture network request");
  });
  const provider = github(githubAuthOptions(credentials).socialProviders.github!);
  const verified = await provider.getUserInfo({ accessToken: "synthetic-token" });
  assert.equal(verified?.user.email, "primary@example.test"); assert.equal(verified?.user.emailVerified, true);
  publicEmail = "unverified@example.test";
  const unverified = await provider.getUserInfo({ accessToken: "synthetic-token" });
  assert.equal(unverified?.user.emailVerified, false);
  assert.ok(calls.every(url => ["https://api.github.com/user", "https://api.github.com/user/emails"].includes(url)));
  assert.equal(calls.length, 4);
});

test("GitHub HTTP flows reject repository scope escalation and token-returning routes remain disabled", async () => {
  const auth = betterAuth({ appName: "Folio GitHub fixture", baseURL: "http://folio.test", secret: "offline-github-auth-fixture-secret-long-enough", ...identityAuthOptions(credentials), telemetry: { enabled: false } });
  for (const path of ["sign-in/social", "link-social"]) {
    const response = await auth.handler(new Request(`http://folio.test/api/auth/${path}`, { method: "POST",
      headers: { origin: "http://folio.test", "content-type": "application/json" }, body: JSON.stringify({ provider: "github", scopes: ["repo"] }) }));
    assert.equal(response.status, 400);
    assert.match(await response.text(), /identity permissions only/);
  }
  for (const path of ["get-access-token", "get-access-token/", "refresh-token", "refresh-token/"]) {
    const response = await auth.handler(new Request(`http://folio.test/api/auth/${path}`, { method: "POST",
      headers: { origin: "http://folio.test", "content-type": "application/json" }, body: JSON.stringify({ providerId: "github" }) }));
    assert.equal(response.status, 404); assert.equal(await response.text(), "Not Found");
  }
});

test("saved GitHub connection is an exact-owner boolean and never selects tokens or another provider", async t => {
  const sqlite = new DatabaseSync(":memory:"); t.after(() => sqlite.close());
  sqlite.exec(readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
  for (const id of ["alice", "bob"]) sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(id, id, `${id}@example.test`, Date.now(), Date.now());
  for (const [id, owner, provider] of [["bob-github", "bob", "github"], ["alice-google", "alice", "google"]])
    sqlite.prepare("INSERT INTO account(id,account_id,user_id,provider_id,access_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(id, `${id}-subject`, owner, provider, "synthetic-private-token", Date.now(), Date.now());
  const queries: string[] = [];
  const db = { prepare(sql: string) { queries.push(sql); return { bind(...values: SQLInputValue[]) { return {
    async first() { return sqlite.prepare(sql).get(...values) ?? null; },
  }; } }; } } as unknown as D1Database;
  assert.equal(await githubAccountConnected(db, "alice"), false);
  assert.equal(await githubAccountConnected(db, "bob"), true);
  assert.equal(await githubAccountConnected(db, "missing-owner"), false);
  const previous = queries.length;
  assert.equal(await githubAccountConnected(db, ""), false); assert.equal(queries.length, previous);
  assert.ok(queries.every(sql => sql.startsWith("SELECT 1 AS connected") && !sql.includes("token")));
  assert.deepEqual(PRIVATE_GITHUB_HEADERS, { "Cache-Control": "private, no-store", Vary: "Cookie" });
});
