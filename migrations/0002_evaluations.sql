-- Private, account-scoped runs. No publication path or public evaluation index.
CREATE TABLE IF NOT EXISTS evaluation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('demo', 'live')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'requires_action', 'completed', 'failed', 'cancelled')),
  session_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS evaluation_runs_user_created_idx ON evaluation_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS evaluation_runs_user_status_idx ON evaluation_runs(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_runs_one_active_per_user_idx
  ON evaluation_runs(user_id) WHERE status IN ('queued', 'running', 'requires_action');
