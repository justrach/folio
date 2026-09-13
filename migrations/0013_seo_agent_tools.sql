-- One durable paid lookup identity across REST, MCP, and sandbox tool retries.
CREATE TABLE seo_agent_requests (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  idempotency_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id,idempotency_hash)
);
CREATE TRIGGER seo_agent_request_immutable BEFORE UPDATE ON seo_agent_requests
BEGIN SELECT RAISE(ABORT,'SEO request identity is immutable'); END;

-- Only the digest is stored. The plaintext is sent once in encrypted MCP transport configuration.
CREATE TABLE sandbox_seo_grants (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL UNIQUE REFERENCES keyword_benchmark_runs(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
