-- A minimal tombstone keeps the paid-run reservation while removing saved evidence.
-- Quota queries deliberately include these rows; private read queries exclude them.
ALTER TABLE evaluation_runs ADD COLUMN deleted_at INTEGER;
