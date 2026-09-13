-- Snapshot the exact research corpus and reserve a single cancellation attempt.
ALTER TABLE keyword_benchmark_runs ADD COLUMN allowed_domains_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE keyword_benchmark_runs ADD COLUMN deadline_at INTEGER;
ALTER TABLE keyword_benchmark_runs ADD COLUMN cancel_attempt_at INTEGER;
ALTER TABLE keyword_benchmark_runs ADD COLUMN cancel_acknowledged_at INTEGER;
CREATE TRIGGER keyword_benchmark_lifecycle_immutable
BEFORE UPDATE ON keyword_benchmark_runs
WHEN NEW.allowed_domains_json <> OLD.allowed_domains_json OR NEW.deadline_at IS NOT OLD.deadline_at
  OR (OLD.cancel_attempt_at IS NOT NULL AND NEW.cancel_attempt_at IS NOT OLD.cancel_attempt_at)
  OR (OLD.cancel_acknowledged_at IS NOT NULL AND NEW.cancel_acknowledged_at IS NOT OLD.cancel_acknowledged_at)
BEGIN SELECT RAISE(ABORT, 'Benchmark corpus, deadline and cancellation markers are immutable'); END;
