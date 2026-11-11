-- OAuth sign-in for MCP clients (Claude.ai, ChatGPT, Claude Code, Cursor...). A connection is an agent key the person
-- approves on /oauth/authorize; the client never sees that key. It gets short-lived access tokens and rotating refresh
-- tokens that point at the key, so the key's permissions, organization limit, rate limit and revocation all apply.

-- Clients: registered through /api/oauth/register (random ID) or identified by their metadata document URL.
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  redirect_uris_json TEXT NOT NULL,
  client_uri TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('registered', 'metadata')),
  secret_hash TEXT,
  created_at INTEGER NOT NULL,
  fetched_at INTEGER
);

-- Authorization codes: one use, ten minutes, bound to the client, redirect URI, PKCE challenge and what was approved.
CREATE TABLE oauth_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  organization_ids_json TEXT,
  key_name TEXT NOT NULL,
  expires_in_days INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- Access and refresh tokens, stored as hashes. Revoking or deleting the key ends them.
CREATE TABLE oauth_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('access', 'refresh')),
  key_id TEXT NOT NULL REFERENCES agent_api_keys(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX oauth_tokens_key ON oauth_tokens(key_id);

-- Which client a key was approved for, so reconnecting the same client replaces its key instead of adding another.
ALTER TABLE agent_api_keys ADD COLUMN oauth_client_id TEXT;
