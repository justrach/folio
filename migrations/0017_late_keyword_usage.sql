-- Permit late metering only; terminal answers, identity and lifecycle stay immutable.
DROP TRIGGER keyword_benchmark_run_frozen_input;
CREATE TRIGGER keyword_benchmark_run_frozen_input
BEFORE UPDATE ON keyword_benchmark_runs
WHEN NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.suite_id <> OLD.suite_id
  OR NEW.case_id <> OLD.case_id OR NEW.kind <> OLD.kind
  OR NEW.baseline_run_id IS NOT OLD.baseline_run_id OR NEW.model <> OLD.model
  OR NEW.harness_version <> OLD.harness_version OR NEW.environment_type <> OLD.environment_type
  OR NEW.environment_fingerprint <> OLD.environment_fingerprint OR NEW.case_json <> OLD.case_json
  OR NEW.created_at <> OLD.created_at
  OR (OLD.session_id IS NOT NULL AND NEW.session_id IS NOT OLD.session_id)
  OR (OLD.create_attempt_at IS NOT NULL AND NEW.create_attempt_at IS NOT OLD.create_attempt_at)
  OR (OLD.status IN ('completed','failed','cancelled') AND (
    OLD.session_id IS NULL OR NEW.status IS NOT OLD.status OR NEW.answer_json IS NOT OLD.answer_json
    OR NEW.provider_metadata_json IS NOT OLD.provider_metadata_json OR NEW.error IS NOT OLD.error
    OR NEW.allowed_domains_json IS NOT OLD.allowed_domains_json OR NEW.deadline_at IS NOT OLD.deadline_at
    OR NEW.cancel_attempt_at IS NOT OLD.cancel_attempt_at OR NEW.cancel_acknowledged_at IS NOT OLD.cancel_acknowledged_at
    OR NEW.hold_release_at IS NOT OLD.hold_release_at OR NEW.hold_release_reason IS NOT OLD.hold_release_reason
    OR NEW.archived_at IS NOT OLD.archived_at OR NEW.revision <> OLD.revision+1 OR NEW.updated_at < OLD.updated_at
    OR NOT json_valid(NEW.usage_json)))
BEGIN SELECT RAISE(ABORT, 'Benchmark inputs and terminal observations are immutable'); END;
