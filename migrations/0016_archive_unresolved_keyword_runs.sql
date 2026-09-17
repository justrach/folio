-- Archiving releases local capacity only; provider outcome and costs remain unknown.
ALTER TABLE keyword_benchmark_runs ADD COLUMN archived_at INTEGER;
CREATE TRIGGER keyword_archive_insert BEFORE INSERT ON keyword_benchmark_runs
WHEN NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Archive an existing unresolved attempt only'); END;
CREATE TRIGGER keyword_archive_guard BEFORE UPDATE ON keyword_benchmark_runs
WHEN NEW.archived_at IS NOT OLD.archived_at AND (
 OLD.archived_at IS NOT NULL OR NEW.archived_at IS NULL
 OR OLD.status <> 'requires_action' OR OLD.create_attempt_at IS NULL OR OLD.answer_json IS NOT NULL
 OR NEW.archived_at < OLD.created_at + 86400000
 OR (OLD.session_id IS NOT NULL AND OLD.cancel_attempt_at IS NULL)
 OR NEW.status IS NOT OLD.status OR NEW.session_id IS NOT OLD.session_id
 OR NEW.answer_json IS NOT OLD.answer_json OR NEW.usage_json IS NOT OLD.usage_json
 OR NEW.provider_metadata_json IS NOT OLD.provider_metadata_json OR NEW.error IS NOT OLD.error
 OR NEW.revision <> OLD.revision + 1 OR NEW.updated_at IS NOT NEW.archived_at)
BEGIN SELECT RAISE(ABORT, 'Archive requires an old unresolved attempt and retains accounting'); END;
