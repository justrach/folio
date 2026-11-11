-- What an owner's keyed agents asked the published index, so the owner can see it.
-- Requests to the no-key endpoint are never stored here.
CREATE TABLE agent_index_asks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  key_id TEXT,
  tool TEXT NOT NULL CHECK(tool IN ('search','answer','website')),
  -- The agent's own search text, bounded; NULL when it asked by ID or domain.
  question TEXT CHECK(question IS NULL OR length(question) <= 200),
  domain TEXT,
  query_id TEXT,
  result_count INTEGER NOT NULL,
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 400),
  created_at INTEGER NOT NULL
);
CREATE INDEX agent_index_asks_owner ON agent_index_asks(user_id, created_at DESC);
