import assert from "node:assert/strict";
import test from "node:test";
import { authorizationServerMetadata, protectedResourceMetadata, redirectLabel, redirectMatches, redirectUriProblem, requestOrigin, resourceMetadataUrl } from "../src/lib/mcp-oauth";

test("metadata describes one resource, Folio's MCP endpoint, and an authorization server that requires PKCE", () => {
  const resource = protectedResourceMetadata("https://usefolio.site/");
  assert.equal(resource.resource, "https://usefolio.site/api/mcp");
  assert.deepEqual(resource.authorization_servers, ["https://usefolio.site"]);
  assert.equal(resourceMetadataUrl("https://usefolio.site"), "https://usefolio.site/.well-known/oauth-protected-resource/api/mcp");
  const server = authorizationServerMetadata("https://usefolio.site");
  assert.equal(server.issuer, "https://usefolio.site");
  assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
  assert.equal(server.authorization_endpoint, "https://usefolio.site/oauth/authorize");
  assert.equal(server.token_endpoint, "https://usefolio.site/api/oauth/token");
  assert.equal(server.registration_endpoint, "https://usefolio.site/api/oauth/register");
  assert.equal(server.client_id_metadata_document_supported, true);
  assert.deepEqual(server.grant_types_supported, ["authorization_code", "refresh_token"]);
});

test("return addresses: https anywhere, http only on this computer, an app's own scheme, nothing that runs code", () => {
  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:8976/callback",
    "http://127.0.0.1:33418", "http://[::1]:5000/cb", "cursor://anysphere.cursor-retrieval/oauth/user-folio/callback", "vscode://vscode.github-authentication/did-authenticate"])
    assert.equal(redirectUriProblem(ok), null, ok);
  for (const bad of ["http://claude.ai/cb", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://claude.ai/cb#frag", "https://user:pass@claude.ai/cb", "/relative", "", 42])
    assert.notEqual(redirectUriProblem(bad), null, String(bad));
  // Exact match, except that an app on localhost may come back on another port (RFC 8252).
  assert.equal(redirectMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectMatches("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback/x"), false);
  assert.equal(redirectMatches("http://127.0.0.1/callback", "http://127.0.0.1:61234/callback"), true);
  assert.equal(redirectMatches("http://127.0.0.1/callback", "http://localhost:61234/callback"), false);
  assert.equal(redirectMatches("http://127.0.0.1/callback", "http://127.0.0.1:61234/other"), false);
  assert.equal(redirectMatches("https://app.example/cb", "https://app.example:8443/cb"), false);
  assert.equal(redirectLabel("https://claude.ai/api/mcp/auth_callback"), "claude.ai");
  assert.equal(redirectLabel("cursor://anysphere.cursor-retrieval/oauth/callback"), "cursor://anysphere.cursor-retrieval");
});

test("the origin comes from the Host the client used, never from a malformed header", () => {
  assert.equal(requestOrigin(new Request("http://0.0.0.0:3012/api/mcp", { headers: { host: "localhost:3012" } })), "http://localhost:3012");
  assert.equal(requestOrigin(new Request("https://usefolio.site/api/mcp", { headers: { host: "usefolio.site" } })), "https://usefolio.site");
  assert.equal(requestOrigin(new Request("https://usefolio.site/api/mcp", { headers: { host: "evil.example/path?x" } })), "https://usefolio.site");
  assert.equal(requestOrigin(new Request("https://usefolio.site/api/mcp")), "https://usefolio.site");
});
