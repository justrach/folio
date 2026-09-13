-- No owner data or provider output is copied into this lease table.
CREATE TABLE IF NOT EXISTS background_job_leases (
  name TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

ALTER TABLE evaluation_runs ADD COLUMN background_checked_at INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS evaluation_runs_background_active_idx
  ON evaluation_runs(background_checked_at, created_at, id)
  WHERE mode = 'live' AND deleted_at IS NULL AND status IN ('queued', 'running', 'requires_action');
