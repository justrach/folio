import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AGENT_API_SCOPES, type AgentApiKeySummary, type AgentApiPrincipal, type AgentApiScope } from "./agent-observation-types";
export type { AgentApiKeySummary, AgentApiPrincipal, AgentApiScope } from "./agent-observation-types";

export class AgentApiError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "invalid_request") {
    super(message); this.name = "AgentApiError";
  }
}
export async function agentApiHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
type KeyRow = { id: string; user_id: string; name: string; prefix: string; scopes_json: string; organization_ids_json: string | null;
  created_at: number; expires_at: number; revoked_at: number | null; last_used_at: number | null };
const columns = "id,user_id,name,prefix,scopes_json,organization_ids_json,created_at,expires_at,revoked_at,last_used_at";
const limitOf = (row: KeyRow): string[] | null => row.organization_ids_json === null ? null : JSON.parse(row.organization_ids_json);
function summary(row: KeyRow): AgentApiKeySummary {
  return { id: row.id, name: row.name, prefix: row.prefix, scopes: JSON.parse(row.scopes_json), organizations: limitOf(row),
    createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at).toISOString() };
}
function owner(value: string) { if (!value) throw new AgentApiError("Sign in to manage private API keys.", 401, "unauthorized"); }
function timestamp(now?: Date) { const value = (now ?? new Date()).getTime(); if (!Number.isFinite(value)) throw new AgentApiError("Invalid request time."); return value; }
export const MAX_KEY_ORGANIZATIONS = 20;
/** A key's organization limit: null for all of them, or IDs of organizations the owner belongs to ([] = own websites only). */
export async function organizationLimit(db: D1Database, ownerId: string, value: unknown): Promise<string[] | null> {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > MAX_KEY_ORGANIZATIONS || new Set(value).size !== value.length
    || value.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)))
    throw new AgentApiError(`Choose up to ${MAX_KEY_ORGANIZATIONS} of your organizations, or none to read only your own websites.`);
  if (!value.length) return [];
  const { results } = await db.prepare(`SELECT organization_id FROM organization_members WHERE user_id = ? AND organization_id IN (${value.map(() => "?").join(", ")})`)
    .bind(ownerId, ...value).all<{ organization_id: string }>();
  if (results.length !== value.length) throw new AgentApiError("A key can only be limited to organizations you belong to.", 403, "forbidden");
  return [...value as string[]].sort();
}
export async function createAgentApiKey(db: D1Database, ownerId: string,
  input: { name: string; scopes: AgentApiScope[]; expiresInDays?: number; organizations?: string[] | null }, options: { now?: Date } = {}) {
  owner(ownerId);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 || /[\u0000-\u001f]/.test(input.name)) throw new AgentApiError("Use a key name of 1–100 characters.");
  if (!Array.isArray(input.scopes) || !input.scopes.includes("read") || input.scopes.length > AGENT_API_SCOPES.length || new Set(input.scopes).size !== input.scopes.length || input.scopes.some(scope => !AGENT_API_SCOPES.includes(scope)))
    throw new AgentApiError("Choose read access, optionally with evaluation, paid SEO or change-recording permission.");
  const days = input.expiresInDays ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new AgentApiError("Keys must expire in 1–90 days.");
  const organizations = await organizationLimit(db, ownerId, input.organizations);
  const now = timestamp(options.now), id = crypto.randomUUID();
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const token = `folio_v1_${secret}`, prefix = token.slice(0, 17);
  const row = await db.prepare(`INSERT INTO agent_api_keys(id,user_id,name,prefix,token_hash,scopes_json,organization_ids_json,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=?)
      AND (SELECT COUNT(*) FROM agent_api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>?) < 10
    RETURNING ${columns}`).bind(id, ownerId, input.name.trim(), prefix, await agentApiHash(token), JSON.stringify([...input.scopes].sort()),
      organizations === null ? null : JSON.stringify(organizations), now, now + days * 86_400_000, ownerId, ownerId, now).first<KeyRow>();
  if (!row) throw new AgentApiError("This account cannot create another active API key.", 429, "key_limit");
  return { key: summary(row), token };
}
export async function listAgentApiKeys(db: D1Database, ownerId: string): Promise<AgentApiKeySummary[]> {
  owner(ownerId);
  const rows = await db.prepare(`SELECT ${columns} FROM agent_api_keys WHERE user_id=? ORDER BY created_at DESC,id LIMIT 100`).bind(ownerId).all<KeyRow>();
  return rows.results.map(summary);
}
export async function revokeAgentApiKey(db: D1Database, ownerId: string, keyId: string, options: { now?: Date } = {}): Promise<AgentApiKeySummary> {
  owner(ownerId);
  const row = await db.prepare(`UPDATE agent_api_keys SET revoked_at=COALESCE(revoked_at,?) WHERE user_id=? AND id=? RETURNING ${columns}`)
    .bind(timestamp(options.now), ownerId, keyId).first<KeyRow>();
  if (!row) throw new AgentApiError("The private API key was not found.", 404, "not_found");
  return summary(row);
}
/**
 * A Folio key (`folio_v1_`), or an OAuth access token (`folio_at_`) for a connection the person approved. An access token
 * stands for its connection's key, so the key's permissions, organization limit, rate limit and revocation all apply.
 * Access tokens are accepted only where `options.resource` names the resource they were issued for (Folio's MCP endpoint).
 */
export async function authenticateAgentApiKey(db: D1Database, token: string, requiredScope: AgentApiScope, options: { now?: Date; resource?: string } = {}): Promise<AgentApiPrincipal> {
  const oauth = typeof token === "string" && /^folio_at_[a-f0-9]{64}$/.test(token);
  if (typeof token !== "string" || (!oauth && !/^folio_v1_[a-f0-9]{64}$/.test(token))) throw new AgentApiError("A valid Folio API key is required.", 401, "unauthorized");
  const now = timestamp(options.now), hash = await agentApiHash(token);
  let match = "token_hash=?", value = hash;
  if (oauth) {
    const access = options.resource ? await db.prepare("SELECT key_id FROM oauth_tokens WHERE token_hash=? AND kind='access' AND expires_at>? AND resource=?")
      .bind(hash, now, options.resource).first<{ key_id: string }>() : null;
    if (!access) throw new AgentApiError("The access token is invalid or has expired.", 401, "invalid_token");
    match = "id=?"; value = access.key_id;
  }
  const row = await db.prepare(`UPDATE agent_api_keys SET last_used_at=?,
    rate_count=CASE WHEN rate_window<=? THEN 1 ELSE rate_count+1 END,
    rate_window=CASE WHEN rate_window<=? THEN ? ELSE rate_window END
    WHERE ${match} AND revoked_at IS NULL AND expires_at>?
      AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE value=?)
      AND (rate_window<=? OR rate_count<60) RETURNING ${columns}`)
    .bind(now, now - 60_000, now - 60_000, now, value, now, requiredScope, now - 60_000).first<KeyRow>();
  if (row) return { ownerId: row.user_id, keyId: row.id, scopes: JSON.parse(row.scopes_json), organizations: limitOf(row) };
  const existing = await db.prepare(`SELECT ${columns} FROM agent_api_keys WHERE ${match} AND revoked_at IS NULL AND expires_at>?`).bind(value, now).first<KeyRow>();
  if (!existing && oauth) throw new AgentApiError("This connection was revoked or has expired. Connect again.", 401, "invalid_token");
  if (!existing) throw new AgentApiError("A valid Folio API key is required.", 401, "unauthorized");
  if (!(JSON.parse(existing.scopes_json) as string[]).includes(requiredScope)) throw new AgentApiError("This API key does not permit this action.", 403, "insufficient_scope");
  throw new AgentApiError("This API key has reached its request limit. Try again in one minute.", 429, "rate_limited");
}
export function requireAgentApiScope(principal: AgentApiPrincipal, scope: AgentApiScope) {
  if (!principal.ownerId || !principal.keyId || !principal.scopes.includes(scope)) throw new AgentApiError("This API key does not permit this action.", 403, "insufficient_scope");
}
