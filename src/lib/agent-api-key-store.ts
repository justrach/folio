import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import type { AgentApiKeySummary, AgentApiPrincipal, AgentApiScope } from "./agent-observation-types";
export type { AgentApiKeySummary, AgentApiPrincipal, AgentApiScope } from "./agent-observation-types";

export class AgentApiError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "invalid_request") {
    super(message); this.name = "AgentApiError";
  }
}
export async function agentApiHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
type KeyRow = { id: string; user_id: string; name: string; prefix: string; scopes_json: string;
  created_at: number; expires_at: number; revoked_at: number | null; last_used_at: number | null };
const columns = "id,user_id,name,prefix,scopes_json,created_at,expires_at,revoked_at,last_used_at";
function summary(row: KeyRow): AgentApiKeySummary {
  return { id: row.id, name: row.name, prefix: row.prefix, scopes: JSON.parse(row.scopes_json),
    createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at).toISOString(),
    lastUsedAt: row.last_used_at === null ? null : new Date(row.last_used_at).toISOString() };
}
function owner(value: string) { if (!value) throw new AgentApiError("Sign in to manage private API keys.", 401, "unauthorized"); }
function timestamp(now?: Date) { const value = (now ?? new Date()).getTime(); if (!Number.isFinite(value)) throw new AgentApiError("Invalid request time."); return value; }
export async function createAgentApiKey(db: D1Database, ownerId: string,
  input: { name: string; scopes: AgentApiScope[]; expiresInDays?: number }, options: { now?: Date } = {}) {
  owner(ownerId);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 100 || /[\u0000-\u001f]/.test(input.name)) throw new AgentApiError("Use a key name of 1–100 characters.");
  if (!Array.isArray(input.scopes) || !input.scopes.includes("read") || input.scopes.length > 3 || new Set(input.scopes).size !== input.scopes.length || input.scopes.some(scope => !["read", "evaluate", "seo"].includes(scope)))
    throw new AgentApiError("Choose read access, optionally with evaluation or paid SEO permission.");
  const days = input.expiresInDays ?? 30;
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new AgentApiError("Keys must expire in 1–90 days.");
  const now = timestamp(options.now), id = crypto.randomUUID();
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const token = `folio_v1_${secret}`, prefix = token.slice(0, 17);
  const row = await db.prepare(`INSERT INTO agent_api_keys(id,user_id,name,prefix,token_hash,scopes_json,created_at,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=?)
      AND (SELECT COUNT(*) FROM agent_api_keys WHERE user_id=? AND revoked_at IS NULL AND expires_at>?) < 10
    RETURNING ${columns}`).bind(id, ownerId, input.name.trim(), prefix, await agentApiHash(token), JSON.stringify([...input.scopes].sort()), now, now + days * 86_400_000, ownerId, ownerId, now).first<KeyRow>();
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
export async function authenticateAgentApiKey(db: D1Database, token: string, requiredScope: AgentApiScope, options: { now?: Date } = {}): Promise<AgentApiPrincipal> {
  if (typeof token !== "string" || !/^folio_v1_[a-f0-9]{64}$/.test(token)) throw new AgentApiError("A valid Folio API key is required.", 401, "unauthorized");
  const now = timestamp(options.now), hash = await agentApiHash(token);
  const row = await db.prepare(`UPDATE agent_api_keys SET last_used_at=?,
    rate_count=CASE WHEN rate_window<=? THEN 1 ELSE rate_count+1 END,
    rate_window=CASE WHEN rate_window<=? THEN ? ELSE rate_window END
    WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?
      AND EXISTS(SELECT 1 FROM json_each(scopes_json) WHERE value=?)
      AND (rate_window<=? OR rate_count<60) RETURNING ${columns}`)
    .bind(now, now - 60_000, now - 60_000, now, hash, now, requiredScope, now - 60_000).first<KeyRow>();
  if (row) return { ownerId: row.user_id, keyId: row.id, scopes: JSON.parse(row.scopes_json) };
  const existing = await db.prepare(`SELECT ${columns} FROM agent_api_keys WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?`).bind(hash, now).first<KeyRow>();
  if (!existing) throw new AgentApiError("A valid Folio API key is required.", 401, "unauthorized");
  if (!(JSON.parse(existing.scopes_json) as string[]).includes(requiredScope)) throw new AgentApiError("This API key does not permit this action.", 403, "insufficient_scope");
  throw new AgentApiError("This API key has reached its request limit. Try again in one minute.", 429, "rate_limited");
}
export function requireAgentApiScope(principal: AgentApiPrincipal, scope: AgentApiScope) {
  if (!principal.ownerId || !principal.keyId || !principal.scopes.includes(scope)) throw new AgentApiError("This API key does not permit this action.", 403, "insufficient_scope");
}
