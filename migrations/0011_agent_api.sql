-- Credentials are shown once; only their SHA-256 digest is retained.
CREATE TABLE agent_api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  scopes_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER,
  rate_window INTEGER NOT NULL DEFAULT 0,
  rate_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(id,user_id)
);
CREATE INDEX agent_api_keys_owner ON agent_api_keys(user_id,created_at DESC);

-- Durable retry identity survives key revocation and terminal run failures.
-- The referenced run is reserved in the same D1 transaction as this row.
CREATE TABLE agent_api_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  key_id TEXT NOT NULL,
  idempotency_hash TEXT NOT NULL CHECK(length(idempotency_hash)=64),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  resource_kind TEXT NOT NULL CHECK(resource_kind IN ('website','keyword')),
  resource_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK(disposition IN ('fresh_saved','existing_active','started','busy','denied')),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,idempotency_hash),
  FOREIGN KEY(key_id,user_id) REFERENCES agent_api_keys(id,user_id)
);
CREATE INDEX agent_api_requests_owner_run ON agent_api_requests(user_id,resource_kind,run_id);
CREATE TRIGGER agent_api_request_immutable BEFORE UPDATE ON agent_api_requests
WHEN NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.key_id<>OLD.key_id
  OR NEW.idempotency_hash<>OLD.idempotency_hash OR NEW.request_hash<>OLD.request_hash
  OR NEW.resource_kind<>OLD.resource_kind OR NEW.resource_id<>OLD.resource_id
  OR NEW.run_id<>OLD.run_id OR NEW.created_at<>OLD.created_at
  OR NOT (OLD.disposition='started' AND NEW.disposition='denied')
BEGIN SELECT RAISE(ABORT,'API request identities and saved outcomes are immutable'); END;
