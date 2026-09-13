import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { google } from "better-auth/social-providers";
import {
  disconnectSearchConsole, googleAuthOptions, googleSignInConfigured,
  hasSearchConsoleScope, searchConsoleAccount, SEARCH_CONSOLE_SCOPE,
} from "../src/lib/google-auth";
import { requireSearchConsoleOrigin } from "../src/lib/search-console-api";

const googleCredentials = { GOOGLE_CLIENT_ID: "local-client.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "offline-fixture-secret" };

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_initial.sql", import.meta.url), "utf8"));
  for (const owner of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)")
      .run(owner, owner, `${owner}@example.test`, Date.now(), Date.now());
  const db = { prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    return { bind(...values: SQLInputValue[]) { return {
      async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
      async all() { return { success: true, results: statement.all(...values) }; },
    }; } };
  } } as unknown as D1Database;
  function account(id: string, owner: string, scope: string | null, refreshToken: string | null, provider = "google") {
    sqlite.prepare("INSERT INTO account(id,account_id,user_id,provider_id,scope,refresh_token,access_token,password,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(id, `${id}-subject`, owner, provider, scope, refreshToken, "synthetic-access-token", provider === "credential" ? "synthetic-password-hash" : null, Date.now(), Date.now());
  }
  return { db, sqlite, account };
}

test("Google identity is optional, verified, and explicitly linked without altering email/password signup", () => {
  assert.equal(googleSignInConfigured({}), false);
  assert.equal(googleSignInConfigured({ GOOGLE_CLIENT_ID: "value", GOOGLE_CLIENT_SECRET: " " }), false);
  const config = googleAuthOptions(googleCredentials);
  assert.equal(config.account.encryptOAuthTokens, true);
  assert.deepEqual(config.account.accountLinking, { enabled: true, disableImplicitLinking: true, allowDifferentEmails: false });
  assert.equal(config.user.validateUserInfo({ user: { emailVerified: false }, source: { method: "email-password", action: "create-user" } }), undefined);
  assert.deepEqual(config.user.validateUserInfo({ user: { emailVerified: false }, source: { method: "oauth", action: "link-account", oauth: { providerId: "google" } } }), { error: "google_email_not_verified" });
  assert.equal(config.user.validateUserInfo({ user: { emailVerified: true }, source: { method: "oauth", action: "sign-in", oauth: { providerId: "google" } } }), undefined);
});

test("identity sign-in scopes and explicit Search Console consent use the registered local callback", async () => {
  const config = googleAuthOptions(googleCredentials);
  const provider = google(config.socialProviders.google!);
  const input = { state: "local-state", codeVerifier: "offline-code-verifier-value", redirectURI: "http://localhost:3001/api/auth/callback/google" };
  const identity = new URL(await provider.createAuthorizationURL(input));
  assert.equal(identity.searchParams.get("scope")?.includes(SEARCH_CONSOLE_SCOPE), false);
  assert.equal(identity.searchParams.get("redirect_uri"), input.redirectURI);
  const consent = new URL(await provider.createAuthorizationURL({ ...input, scopes: [SEARCH_CONSOLE_SCOPE], additionalParams: { prompt: "consent", access_type: "offline" } }));
  assert.ok(consent.searchParams.get("scope")?.split(" ").includes(SEARCH_CONSOLE_SCOPE));
  assert.equal(consent.searchParams.get("prompt"), "consent");
  assert.equal(consent.searchParams.get("access_type"), "offline");
});

test("provider-token HTTP endpoints remain disabled for credential privacy", async () => {
  const auth = betterAuth({ appName: "Folio offline fixture", baseURL: "http://folio.test", secret: "offline-google-auth-fixture-secret-with-32-characters", ...googleAuthOptions(googleCredentials), telemetry: { enabled: false } });
  for (const path of ["get-access-token", "get-access-token/", "refresh-token", "refresh-token/"]) {
    const response = await auth.handler(new Request(`http://folio.test/api/auth/${path}`, { method: "POST", headers: { origin: "http://folio.test", "content-type": "application/json" }, body: JSON.stringify({ accountId: "fixture-account", userId: "other-owner" }) }));
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "Not Found");
  }
});

test("Search Console consent requires an exact scope and saved refresh token from this owner", async t => {
  const { db, sqlite, account } = database(); t.after(() => sqlite.close());
  assert.equal(hasSearchConsoleScope(`openid,${SEARCH_CONSOLE_SCOPE} profile`), true);
  assert.equal(hasSearchConsoleScope(`${SEARCH_CONSOLE_SCOPE}.unexpected`), false);
  account("bob-google", "bob", SEARCH_CONSOLE_SCOPE, "synthetic-refresh-token");
  account("alice-no-offline", "alice", SEARCH_CONSOLE_SCOPE, null);
  account("alice-no-scope", "alice", "openid,email,profile", "synthetic-refresh-token");
  assert.equal(await searchConsoleAccount(db, "alice"), null);
  assert.equal(await searchConsoleAccount(db, "unknown-owner"), null);
  const connected = await searchConsoleAccount(db, "bob");
  assert.deepEqual(connected && Object.keys(connected).sort(), ["has_refresh_token", "id", "scope"]);
  assert.equal(connected?.id, "bob-google");
});

test("disconnect clears this owner's Google tokens while retaining login identities and other owners", async t => {
  const { db, sqlite, account } = database(); t.after(() => sqlite.close());
  account("alice-google", "alice", SEARCH_CONSOLE_SCOPE, "alice-fixture-refresh");
  account("alice-password", "alice", null, null, "credential");
  account("bob-google", "bob", SEARCH_CONSOLE_SCOPE, "bob-fixture-refresh");
  await disconnectSearchConsole(db, "alice");
  assert.equal(await searchConsoleAccount(db, "alice"), null);
  assert.equal((await searchConsoleAccount(db, "bob"))?.id, "bob-google");
  const retained = sqlite.prepare("SELECT account_id,provider_id,access_token,refresh_token,scope FROM account WHERE id = ?").get("alice-google");
  assert.deepEqual({ ...retained }, { account_id: "alice-google-subject", provider_id: "google", access_token: null, refresh_token: null, scope: null });
  assert.equal(sqlite.prepare("SELECT password FROM account WHERE id = ?").get("alice-password")?.password, "synthetic-password-hash");
});

test("Search Console mutations require the configured origin even with a forged host", () => {
  const request = (origin?: string) => new Request("http://0.0.0.0:3001/api/search-console/reports", { method: "POST", headers: { ...(origin ? { origin } : {}), host: "evil.test" } });
  assert.doesNotThrow(() => requireSearchConsoleOrigin(request("http://localhost:3001"), "http://localhost:3001"));
  assert.throws(() => requireSearchConsoleOrigin(request("https://evil.test"), "http://localhost:3001"), /Cross-origin/);
  assert.throws(() => requireSearchConsoleOrigin(request(), "http://localhost:3001"), /Cross-origin/);
});
