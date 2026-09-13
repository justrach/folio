-- One owner-approved saved-evidence return per evaluation, reserved before sending.
-- A lost HTTP response never causes an automatic billable continuation retry.
CREATE TABLE IF NOT EXISTS agent_tool_calls (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL CHECK(tool_name = 'read_saved_seo_report'),
  state TEXT NOT NULL CHECK(state IN ('reserved', 'submitted', 'uncertain')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(session_id, turn_id, call_id)
);
CREATE INDEX IF NOT EXISTS agent_tool_calls_owner_idx ON agent_tool_calls(user_id, created_at DESC);
CREATE TRIGGER IF NOT EXISTS erase_deleted_evaluation_tool_calls
AFTER UPDATE OF deleted_at ON evaluation_runs
WHEN NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM agent_tool_calls WHERE run_id = NEW.id;
END;
