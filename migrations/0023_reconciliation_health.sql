-- Operational timestamps and aggregate counts only; no provider errors or evidence.
ALTER TABLE evaluation_runs ADD COLUMN background_reconciled_at INTEGER;

CREATE TABLE IF NOT EXISTS background_job_health (
  name TEXT PRIMARY KEY NOT NULL,
  last_started_at INTEGER NOT NULL,
  last_finished_at INTEGER,
  last_success_at INTEGER,
  attempted INTEGER NOT NULL DEFAULT 0,
  reconciled INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  stale INTEGER NOT NULL DEFAULT 0
);
