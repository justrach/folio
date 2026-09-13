-- Owner acknowledgement releases only the local cross-case capacity hold.
-- It does not cancel a provider task, resolve unknown cost, or remove quota history.
ALTER TABLE keyword_benchmark_runs ADD COLUMN hold_release_at INTEGER;
ALTER TABLE keyword_benchmark_runs ADD COLUMN hold_release_reason TEXT;

CREATE TRIGGER keyword_benchmark_hold_release_insert
BEFORE INSERT ON keyword_benchmark_runs
WHEN NEW.hold_release_at IS NOT NULL OR NEW.hold_release_reason IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'A hold release requires an existing unresolved creation'); END;

CREATE TRIGGER keyword_benchmark_hold_release_immutable
BEFORE UPDATE ON keyword_benchmark_runs
WHEN (NEW.hold_release_at IS NOT OLD.hold_release_at OR NEW.hold_release_reason IS NOT OLD.hold_release_reason)
  AND (OLD.hold_release_at IS NOT NULL OR OLD.hold_release_reason IS NOT NULL
    OR NEW.hold_release_at IS NULL OR NEW.hold_release_at < OLD.updated_at
    OR NEW.hold_release_reason IS NOT 'owner-acknowledged-unknown-creation-cost'
    OR OLD.status <> 'requires_action' OR OLD.session_id IS NOT NULL
    OR OLD.create_attempt_at IS NULL OR OLD.answer_json IS NOT NULL
    OR NEW.status IS NOT OLD.status OR NEW.session_id IS NOT OLD.session_id
    OR NEW.answer_json IS NOT OLD.answer_json OR NEW.usage_json IS NOT OLD.usage_json
    OR NEW.provider_metadata_json IS NOT OLD.provider_metadata_json OR NEW.error IS NOT OLD.error
    OR NEW.revision <> OLD.revision + 1 OR NEW.updated_at IS NOT NEW.hold_release_at
)
BEGIN
  SELECT RAISE(ABORT, 'Hold release acknowledgement is invalid or immutable');
END;
