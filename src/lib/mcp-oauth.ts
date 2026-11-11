import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError, agentApiHash, createAgentApiKey, organizationLimit } from "./agent-api-key-store";
import { AGENT_API_SCOPES, type AgentApiScope } from "./agent-observation-types";
import { mcpEndpoint } from "./agent-onboarding";

/**
 * OAuth 2.1 sign-in for MCP clients (the MCP authorization spec, 2025-11-25): protected resource and authorization server
 * metadata, dynamic client registration and client ID metadata documents, PKCE (S256 only), resource binding, and rotating
 * refresh tokens. Approving on /oauth/authorize makes an agent key for the connection (agent_api_keys, with the client's
 * ID); the client never sees that key. It gets one-hour access tokens and refresh tokens that point at it, so the key's
 * permissions, organization limit, rate limit and revocation apply unchanged.
 */
export const OAUTH_SCOPES: readonly AgentApiScope[] = AGENT_API_SCOPES;
export const ACCESS_TOKEN_SECONDS = 3600;
const CODE_MS = 10 * 60_000, METADATA_REFRESH_MS = 86_400_000, MAX_REDIRECT_URIS = 10, METADATA_BYTES = 64 * 1024;
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const NO_CODE_SCHEMES = /^(javascript|data|file|vbscript|blob|about|ws|wss|ftp|mailto|tel|sms):$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/, VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

export class OAuthError extends Error {
  constructor(readonly error: string, description: string, readonly status = 400) { super(description); this.name = "OAuthError"; }
}
/** A problem with the client or its return address: shown on Folio's page, never sent to an address Folio can't vouch for. */
export class OAuthPageError extends OAuthError {}

const site = (origin: string) => origin.replace(/\/$/, "");
/**
 * The origin a client used to reach Folio. Issuer, metadata and token audience must all match it. It comes from the Host
 * header because `next dev` reports its bind address (0.0.0.0) in request.url; in production the two agree, and the
 * frontend Worker passes requests to the backend unchanged.
 */
export function requestOrigin(request: Request) {
  const url = new URL(request.url), host = request.headers.get("host");
  return host && /^[A-Za-z0-9.-]+(:\d+)?$|^\[[0-9a-fA-F:]+\](:\d+)?$/.test(host) ? `${url.protocol}//${host}` : url.origin;
}
const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
async function s256(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function withParams(uri: string, params: Record<string, string | null>) {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

export const resourceMetadataUrl = (origin: string) => `${site(origin)}/.well-known/oauth-protected-resource/api/mcp`;
export function protectedResourceMetadata(origin: string) {
  return { resource: mcpEndpoint(origin), authorization_servers: [site(origin)], scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ["header"],
    resource_name: "Folio", resource_documentation: `${site(origin)}/docs/api` };
}
export function authorizationServerMetadata(origin: string) {
  const base = site(origin), methods = ["none", "client_secret_post", "client_secret_basic"];
  return { issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/api/oauth/token`, registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`, response_types_supported: ["code"], response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: methods, revocation_endpoint_auth_methods_supported: methods, scopes_supported: [...OAUTH_SCOPES],
    client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, service_documentation: `${base}/docs/api` };
}

/** Why a redirect URI can't receive a code, or null. https anywhere; http only on this computer; an app's own scheme (cursor:, vscode:). */
export function redirectUriProblem(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 2000) return "must be a URL of up to 2,000 characters";
  let url: URL;
  try { url = new URL(value); } catch { return "must be an absolute URL"; }
  if (value.includes("#")) return "can't have a fragment";
  if (url.username || url.password) return "can't contain a user name or password";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:") return LOOPBACK.test(url.hostname) ? null : "must use https unless it is on the same computer (localhost)";
  if (NO_CODE_SCHEMES.test(url.protocol)) return "uses a scheme that can't receive a sign-in";
  return null;
}
/** Exact match. On http://localhost the port may differ (RFC 8252 §7.3): installed apps listen on whatever port is free. */
export function redirectMatches(registered: string, requested: string) {
  if (registered === requested) return true;
  try {
    const a = new URL(registered), b = new URL(requested);
    return a.protocol === "http:" && b.protocol === "http:" && LOOPBACK.test(a.hostname) && a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
  } catch { return false; }
}
/** How the consent page names a return address: its host, or its scheme for an app. */
export function redirectLabel(uri: string) {
  const url = new URL(uri);
  return url.protocol === "http:" || url.protocol === "https:" ? url.host : `${url.protocol}//${url.host}`;
}

type ClientRow = { id: string; name: string; redirect_uris_json: string; client_uri: string | null; kind: "registered" | "metadata"; secret_hash: string | null; fetched_at: number | null };
export type OAuthClient = { id: string; name: string; redirectUris: string[]; clientUri: string | null; kind: "registered" | "metadata" };
const toClient = (row: ClientRow): OAuthClient => ({ id: row.id, name: row.name, redirectUris: JSON.parse(row.redirect_uris_json), clientUri: row.client_uri, kind: row.kind });
function clientName(value: unknown, fallback: string) {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ") : "";
  return (name || fallback).slice(0, 100);
}
function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2000) return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
function redirectUris(value: unknown, error: string) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_REDIRECT_URIS) throw new OAuthError(error, `Send 1–${MAX_REDIRECT_URIS} redirect_uris.`);
  for (const uri of value) {
    const problem = redirectUriProblem(uri);
    if (problem) throw new OAuthError(error, `The redirect URI ${String(uri).slice(0, 200)} ${problem}.`);
  }
  return value as string[];
}

/** Dynamic client registration (RFC 7591). Public clients by default; a client that asks for a secret gets one, shown once. */
export async function registerClient(db: D1Database, body: Record<string, unknown>, now = Date.now()) {
  const uris = redirectUris(body.redirect_uris, "invalid_redirect_uri");
  const grants = body.grant_types === undefined ? ["authorization_code", "refresh_token"] : body.grant_types;
  if (!Array.isArray(grants) || !grants.includes("authorization_code") || grants.some(grant => grant !== "authorization_code" && grant !== "refresh_token"))
    throw new OAuthError("invalid_client_metadata", "Folio supports the authorization_code and refresh_token grants.");
  if (body.response_types !== undefined && (!Array.isArray(body.response_types) || body.response_types.some(type => type !== "code")))
    throw new OAuthError("invalid_client_metadata", "Folio supports the code response type only.");
  const method = body.token_endpoint_auth_method ?? "none";
  if (method !== "none" && method !== "client_secret_post" && method !== "client_secret_basic")
    throw new OAuthError("invalid_client_metadata", "Use token_endpoint_auth_method none, client_secret_post or client_secret_basic.");
  const id = `folio_client_${hex(16)}`, secret = method === "none" ? null : `folio_cs_${hex(32)}`;
  const name = clientName(body.client_name, "An MCP client"), clientUri = httpsUrl(body.client_uri);
  await db.prepare("INSERT INTO oauth_clients(id,name,redirect_uris_json,client_uri,kind,secret_hash,created_at) VALUES(?,?,?,?,'registered',?,?)")
    .bind(id, name, JSON.stringify(uris), clientUri, secret ? await agentApiHash(secret) : null, now).run();
  return { client_id: id, client_id_issued_at: Math.floor(now / 1000), client_name: name, redirect_uris: uris, grant_types: grants, response_types: ["code"],
    token_endpoint_auth_method: method, ...(clientUri ? { client_uri: clientUri } : {}), ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}) };
}

/** A client ID metadata document: an https URL whose JSON names the client and its redirect URIs, and whose client_id is that URL. */
async function fetchClientMetadata(clientId: string, fetcher: typeof fetch) {
  let target: URL;
  try { target = new URL(clientId); } catch { throw new OAuthError("invalid_client", "The client ID isn't a valid URL.", 401); }
  if (target.protocol !== "https:" || target.pathname === "/" || target.hash || target.username || target.password
    || /^(\d+\.){3}\d+$|^\[|^localhost$|\.(local|localhost|internal)$/i.test(target.hostname))
    throw new OAuthError("invalid_client", "A client ID URL must be an https address with a path, on a public host.", 401);
  let response: Response;
  try { response = await fetcher(target, { headers: { Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000) }); }
  catch { throw new OAuthError("invalid_client", "Folio couldn't reach the client's metadata document.", 401); }
  const text = response.ok ? await response.text() : "";
  if (!response.ok || text.length > METADATA_BYTES) throw new OAuthError("invalid_client", `Folio couldn't read the client's metadata document (HTTP ${response.status}).`, 401);
  let document: Record<string, unknown>;
  try { document = JSON.parse(text); } catch { throw new OAuthError("invalid_client", "The client's metadata document isn't JSON.", 401); }
  if (!document || typeof document !== "object" || document.client_id !== clientId) throw new OAuthError("invalid_client", "The metadata document's client_id must be its own URL.", 401);
  if (document.token_endpoint_auth_method !== undefined && document.token_endpoint_auth_method !== "none")
    throw new OAuthError("invalid_client", "Folio accepts metadata-document clients that authenticate with PKCE alone (token_endpoint_auth_method none).", 401);
  return { name: clientName(document.client_name, target.hostname), redirectUris: redirectUris(document.redirect_uris, "invalid_client"), clientUri: httpsUrl(document.client_uri) };
}

async function clientRow(db: D1Database, clientId: unknown, now: number, fetcher: typeof fetch): Promise<ClientRow> {
  if (typeof clientId !== "string" || !clientId || clientId.length > 2000) throw new OAuthError("invalid_client", "Send the client_id.", 401);
  const row = await db.prepare("SELECT id, name, redirect_uris_json, client_uri, kind, secret_hash, fetched_at FROM oauth_clients WHERE id = ?").bind(clientId).first<ClientRow>();
  if (row && (row.kind === "registered" || now - Number(row.fetched_at ?? 0) < METADATA_REFRESH_MS)) return row;
  if (!clientId.startsWith("https://")) throw new OAuthError("invalid_client", "This client isn't registered with Folio.", 401);
  const metadata = await fetchClientMetadata(clientId, fetcher);
  await db.prepare(`INSERT INTO oauth_clients(id,name,redirect_uris_json,client_uri,kind,created_at,fetched_at) VALUES(?,?,?,?,'metadata',?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, redirect_uris_json=excluded.redirect_uris_json, client_uri=excluded.client_uri, fetched_at=excluded.fetched_at`)
    .bind(clientId, metadata.name, JSON.stringify(metadata.redirectUris), metadata.clientUri, now, now).run();
  return { id: clientId, name: metadata.name, redirect_uris_json: JSON.stringify(metadata.redirectUris), client_uri: metadata.clientUri, kind: "metadata", secret_hash: null, fetched_at: now };
}

/** The resource a token is for. Folio has one: its MCP endpoint (the site's root names the same server). */
function resourceFor(value: string | null, origin: string, redirect: (error: string, description: string) => OAuthError) {
  if (value === null) return mcpEndpoint(origin);
  try {
    const url = new URL(value);
    if (!url.hash) {
      const canonical = `${url.origin}${url.pathname}`.replace(/\/$/, "");
      if (canonical === mcpEndpoint(origin) || canonical === site(origin)) return mcpEndpoint(origin);
    }
  } catch { /* falls through */ }
  throw redirect("invalid_target", `This authorization server issues tokens for ${mcpEndpoint(origin)} only.`);
}

export type AuthorizeRequest = { client: OAuthClient; redirectUri: string; state: string | null; resource: string; codeChallenge: string; requested: AgentApiScope[] };
/** Checks an authorization request. Client and return-address problems throw OAuthPageError; the rest carry a redirect back to the client. */
export async function checkAuthorizeRequest(db: D1Database, params: URLSearchParams, origin: string, now = Date.now(), fetcher: typeof fetch = fetch): Promise<AuthorizeRequest> {
  const one = (name: string) => { const values = params.getAll(name); if (values.length > 1) throw new OAuthPageError("invalid_request", `${name} was sent more than once.`); return values[0] ?? null; };
  let row: ClientRow;
  try { row = await clientRow(db, one("client_id"), now, fetcher); }
  catch (error) { throw error instanceof OAuthError ? new OAuthPageError(error.error, error.message) : error; }
  const client = toClient(row);
  let redirectUri = one("redirect_uri");
  if (!redirectUri) {
    if (client.redirectUris.length !== 1) throw new OAuthPageError("invalid_request", "The request didn't say where to return to.");
    redirectUri = client.redirectUris[0];
  }
  if (!client.redirectUris.some(registered => redirectMatches(registered, redirectUri!)))
    throw new OAuthPageError("invalid_request", "This return address isn't registered for the app, so Folio won't send a sign-in there.");
  const state = one("state");
  if (state !== null && state.length > 2048) throw new OAuthPageError("invalid_request", "The state parameter is too long.");
  const back = (error: string, description: string) => new OAuthRedirectError(error, description, withParams(redirectUri!, { error, error_description: description, state, iss: site(origin) }));
  if (one("response_type") !== "code") throw back("unsupported_response_type", "Folio supports response_type=code.");
  const challenge = one("code_challenge");
  if (one("code_challenge_method") !== "S256" || !challenge || !CHALLENGE.test(challenge)) throw back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  const resource = resourceFor(one("resource"), origin, back);
  const requested = (one("scope") ?? "").split(/\s+/).filter((scope): scope is AgentApiScope => (OAUTH_SCOPES as string[]).includes(scope));
  return { client, redirectUri, state, resource, codeChallenge: challenge, requested };
}
/** An authorization error the client should hear about, at its own (verified) return address. */
export class OAuthRedirectError extends OAuthError {
  constructor(error: string, description: string, readonly location: string) { super(error, description); }
}

/** What the consent page shows: who is asking, where the code goes, and where Cancel returns. */
export async function previewAuthorization(db: D1Database, userId: string, params: URLSearchParams, origin: string, now = Date.now(), fetcher: typeof fetch = fetch) {
  if (!userId) throw new AgentApiError("Sign in to connect an app to Folio.", 401, "unauthorized");
  const request = await checkAuthorizeRequest(db, params, origin, now, fetcher);
  return { client: { id: request.client.id, name: request.client.name, uri: request.client.clientUri, kind: request.client.kind,
      host: request.client.kind === "metadata" ? new URL(request.client.id).host : null },
    redirect: { uri: request.redirectUri, label: redirectLabel(request.redirectUri), local: /^http:/.test(request.redirectUri) },
    requested: request.requested,
    cancel: withParams(request.redirectUri, { error: "access_denied", error_description: "The person declined to connect.", state: request.state, iss: site(origin) }) };
}

/** The person approved: store a one-use code for what they chose and send the client back with it. */
export async function approveAuthorization(db: D1Database, userId: string, params: URLSearchParams,
  choice: { scopes: unknown; organizations: unknown; name: unknown; expiresInDays: unknown }, origin: string, now = Date.now(), fetcher: typeof fetch = fetch) {
  if (!userId) throw new AgentApiError("Sign in to connect an app to Folio.", 401, "unauthorized");
  const request = await checkAuthorizeRequest(db, params, origin, now, fetcher);
  const scopes = choice.scopes;
  if (!Array.isArray(scopes) || !scopes.includes("read") || new Set(scopes).size !== scopes.length || scopes.some(scope => !(OAUTH_SCOPES as unknown[]).includes(scope)))
    throw new AgentApiError("Choose read access, optionally with changes, evaluations or paid search lookups.");
  const name = typeof choice.name === "string" ? choice.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name)) throw new AgentApiError("Give the connection a name of 1–100 characters.");
  const days = choice.expiresInDays;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 90) throw new AgentApiError("Connections last 1–90 days.");
  const organizations = await organizationLimit(db, userId, choice.organizations);
  // The app's earlier connection for this person is replaced, so it doesn't count against the ten.
  const active = await db.prepare("SELECT COUNT(*) AS n FROM agent_api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>? AND (oauth_client_id IS NULL OR oauth_client_id<>?)")
    .bind(userId, now, request.client.id).first<{ n: number }>();
  if (Number(active?.n ?? 0) >= 10) throw new AgentApiError("You already have 10 active keys and connections. Revoke one in Folio, then approve again.", 429, "key_limit");
  const code = `folio_code_${hex(32)}`;
  await db.prepare("DELETE FROM oauth_codes WHERE expires_at<?").bind(now - 86_400_000).run();
  await db.prepare(`INSERT INTO oauth_codes(code_hash,client_id,user_id,redirect_uri,code_challenge,resource,scopes_json,organization_ids_json,key_name,expires_in_days,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(await agentApiHash(code), request.client.id, userId, request.redirectUri, request.codeChallenge, request.resource,
    JSON.stringify([...scopes].sort()), organizations === null ? null : JSON.stringify(organizations), name, days, now, now + CODE_MS).run();
  return { location: withParams(request.redirectUri, { code, state: request.state, iss: site(origin) }), client: request.client.name };
}

/** The token endpoint's client: from the form or HTTP Basic. A client with a secret must present it. */
async function authenticateClient(db: D1Database, form: URLSearchParams, authorization: string | null, now: number, fetcher: typeof fetch) {
  let id = form.get("client_id"), secret = form.get("client_secret");
  const basic = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(authorization ?? "");
  if (basic) {
    let decoded = "";
    try { decoded = atob(basic[1]); } catch { throw new OAuthError("invalid_client", "The Basic credentials aren't valid base64.", 401); }
    const split = decoded.indexOf(":");
    try { id = decodeURIComponent(split < 0 ? decoded : decoded.slice(0, split)); secret = split < 0 ? null : decodeURIComponent(decoded.slice(split + 1)); }
    catch { throw new OAuthError("invalid_client", "The Basic credentials aren't valid.", 401); }
  }
  const row = await clientRow(db, id, now, fetcher);
  if (row.secret_hash && (typeof secret !== "string" || await agentApiHash(secret) !== row.secret_hash)) throw new OAuthError("invalid_client", "The client secret is missing or wrong.", 401);
  return toClient(row);
}

async function issueTokens(db: D1Database, keyId: string, clientId: string, resource: string, keyExpiresAt: number, scopes: string[], now: number) {
  const access = `folio_at_${hex(32)}`, refresh = `folio_rt_${hex(32)}`, accessExpires = Math.min(now + ACCESS_TOKEN_SECONDS * 1000, keyExpiresAt);
  const insert = "INSERT INTO oauth_tokens(token_hash,kind,key_id,client_id,resource,created_at,expires_at) VALUES(?,?,?,?,?,?,?)";
  await db.prepare(insert).bind(await agentApiHash(access), "access", keyId, clientId, resource, now, accessExpires).run();
  await db.prepare(insert).bind(await agentApiHash(refresh), "refresh", keyId, clientId, resource, now, keyExpiresAt).run();
  return { access_token: access, token_type: "Bearer", expires_in: Math.max(1, Math.floor((accessExpires - now) / 1000)), refresh_token: refresh, scope: scopes.join(" ") };
}

/** The token endpoint: a code (with its PKCE verifier) or a refresh token becomes a new access token and refresh token. */
export async function exchangeToken(db: D1Database, form: URLSearchParams, authorization: string | null, origin: string, now = Date.now(), fetcher: typeof fetch = fetch) {
  const grant = form.get("grant_type");
  if (grant !== "authorization_code" && grant !== "refresh_token") throw new OAuthError("unsupported_grant_type", "Use grant_type authorization_code or refresh_token.");
  const client = await authenticateClient(db, form, authorization, now, fetcher);
  if (grant === "authorization_code") {
    const code = form.get("code"), verifier = form.get("code_verifier");
    if (!code || !/^folio_code_[a-f0-9]{64}$/.test(code)) throw new OAuthError("invalid_grant", "The authorization code is invalid.");
    if (!verifier || !VERIFIER.test(verifier)) throw new OAuthError("invalid_request", "Send the PKCE code_verifier.");
    const row = await db.prepare(`UPDATE oauth_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?
      RETURNING client_id, user_id, redirect_uri, code_challenge, resource, scopes_json, organization_ids_json, key_name, expires_in_days`).bind(now, await agentApiHash(code), now)
      .first<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; resource: string; scopes_json: string; organization_ids_json: string | null; key_name: string; expires_in_days: number }>();
    if (!row || row.client_id !== client.id) throw new OAuthError("invalid_grant", "The authorization code is invalid, expired or already used.");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== row.redirect_uri) throw new OAuthError("invalid_grant", "redirect_uri doesn't match the authorization request.");
    if (await s256(verifier) !== row.code_challenge) throw new OAuthError("invalid_grant", "The PKCE code_verifier doesn't match.");
    const resource = form.get("resource");
    if (resource !== null && resourceFor(resource, origin, (error, description) => new OAuthError(error, description)) !== row.resource)
      throw new OAuthError("invalid_target", "The resource doesn't match the authorization request.");
    // Reconnecting an app replaces its earlier connection for this person.
    await db.prepare("UPDATE agent_api_keys SET revoked_at=? WHERE user_id=? AND oauth_client_id=? AND revoked_at IS NULL").bind(now, row.user_id, client.id).run();
    let key;
    try {
      ({ key } = await createAgentApiKey(db, row.user_id, { name: row.key_name, scopes: JSON.parse(row.scopes_json), expiresInDays: Number(row.expires_in_days),
        organizations: row.organization_ids_json === null ? null : JSON.parse(row.organization_ids_json) }, { now: new Date(now) }));
    } catch (error) { throw error instanceof AgentApiError ? new OAuthError("invalid_grant", error.message) : error; }
    await db.prepare("UPDATE agent_api_keys SET oauth_client_id=? WHERE id=?").bind(client.id, key.id).run();
    return issueTokens(db, key.id, client.id, row.resource, Date.parse(key.expiresAt), key.scopes, now);
  }
  const token = form.get("refresh_token");
  if (!token || !/^folio_rt_[a-f0-9]{64}$/.test(token)) throw new OAuthError("invalid_grant", "The refresh token is invalid.");
  // Rotation: each refresh token works once.
  const row = await db.prepare("UPDATE oauth_tokens SET used_at=? WHERE token_hash=? AND kind='refresh' AND used_at IS NULL AND expires_at>? RETURNING key_id, client_id, resource")
    .bind(now, await agentApiHash(token), now).first<{ key_id: string; client_id: string; resource: string }>();
  if (!row || row.client_id !== client.id) throw new OAuthError("invalid_grant", "The refresh token is invalid, expired or already used.");
  const key = await db.prepare("SELECT scopes_json, expires_at FROM agent_api_keys WHERE id=? AND revoked_at IS NULL AND expires_at>?").bind(row.key_id, now)
    .first<{ scopes_json: string; expires_at: number }>();
  if (!key) throw new OAuthError("invalid_grant", "This connection was revoked or has expired. Connect again.");
  await db.prepare("DELETE FROM oauth_tokens WHERE key_id=? AND (expires_at<=? OR used_at IS NOT NULL)").bind(row.key_id, now).run();
  return issueTokens(db, row.key_id, client.id, row.resource, Number(key.expires_at), JSON.parse(key.scopes_json), now);
}

/** Token revocation (RFC 7009). Revoking a refresh token ends the whole connection; unknown tokens are ignored, as the RFC asks. */
export async function revokeToken(db: D1Database, form: URLSearchParams, authorization: string | null, now = Date.now(), fetcher: typeof fetch = fetch) {
  const client = await authenticateClient(db, form, authorization, now, fetcher);
  const token = form.get("token");
  if (!token || !/^folio_(at|rt)_[a-f0-9]{64}$/.test(token)) return;
  const row = await db.prepare("SELECT kind, key_id FROM oauth_tokens WHERE token_hash=? AND client_id=?").bind(await agentApiHash(token), client.id).first<{ kind: string; key_id: string }>();
  if (!row) return;
  if (row.kind === "refresh") {
    await db.prepare("UPDATE agent_api_keys SET revoked_at=COALESCE(revoked_at, ?) WHERE id=?").bind(now, row.key_id).run();
    await db.prepare("DELETE FROM oauth_tokens WHERE key_id=?").bind(row.key_id).run();
  } else await db.prepare("DELETE FROM oauth_tokens WHERE token_hash=?").bind(await agentApiHash(token)).run();
}

export const OAUTH_CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version", "Access-Control-Max-Age": "86400" };
export function oauthErrorResponse(error: unknown) {
  if (error instanceof OAuthError) return Response.json({ error: error.error, error_description: error.message },
    { status: error.status, headers: { ...OAUTH_CORS, "Cache-Control": "no-store", ...(error.status === 401 ? { "WWW-Authenticate": "Basic" } : {}) } });
  if (error instanceof AgentApiError) return Response.json({ error: error.status === 401 ? "invalid_client" : "invalid_request", error_description: error.message },
    { status: error.status === 401 ? 401 : 400, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
  return Response.json({ error: "temporarily_unavailable", error_description: "Folio couldn't complete this request. Try again." }, { status: 503, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
}
/** Reads a token or revocation request: form-encoded as the RFCs say, or JSON, up to 16 KB. */
export async function readOAuthForm(request: Request) {
  const text = await request.text();
  if (text.length > 16_384) throw new OAuthError("invalid_request", "The request is too large.");
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new OAuthError("invalid_request", "The body isn't valid JSON."); }
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body && typeof body === "object" ? body : {})) if (typeof value === "string") form.set(key, value);
    return form;
  }
  return new URLSearchParams(text);
}
