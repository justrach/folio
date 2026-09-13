-- Private query benchmarks are separate from website evidence evaluations.
CREATE TABLE keyword_benchmark_suites (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(id, user_id)
);
CREATE INDEX keyword_benchmark_suites_owner ON keyword_benchmark_suites(user_id, created_at DESC);

CREATE TABLE keyword_benchmark_cases (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  case_json TEXT NOT NULL CHECK(length(CAST(case_json AS BLOB)) <= 50000),
  UNIQUE(id, user_id),
  FOREIGN KEY(suite_id, user_id) REFERENCES keyword_benchmark_suites(id, user_id) ON DELETE CASCADE
);
CREATE INDEX keyword_benchmark_cases_owner_suite ON keyword_benchmark_cases(user_id, suite_id, created_at, id);

CREATE TABLE keyword_benchmark_runs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('baseline', 'fresh')),
  baseline_run_id TEXT,
  model TEXT NOT NULL,
  harness_version TEXT NOT NULL,
  environment_type TEXT NOT NULL,
  environment_fingerprint TEXT NOT NULL,
  case_json TEXT NOT NULL CHECK(length(CAST(case_json AS BLOB)) <= 50000),
  status TEXT NOT NULL CHECK(status IN ('queued','running','requires_action','completed','failed','cancelled')),
  session_id TEXT,
  create_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  answer_json TEXT CHECK(answer_json IS NULL OR length(CAST(answer_json AS BLOB)) <= 1000000),
  usage_json TEXT NOT NULL,
  provider_metadata_json TEXT NOT NULL,
  error TEXT,
  answer_characters INTEGER NOT NULL DEFAULT 0,
  mention_count INTEGER NOT NULL DEFAULT 0,
  citation_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(id, user_id),
  FOREIGN KEY(suite_id, user_id) REFERENCES keyword_benchmark_suites(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY(case_id, user_id) REFERENCES keyword_benchmark_cases(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY(baseline_run_id, user_id) REFERENCES keyword_benchmark_runs(id, user_id),
  CHECK((kind = 'baseline' AND baseline_run_id IS NULL) OR (kind = 'fresh' AND baseline_run_id IS NOT NULL)),
  CHECK(session_id IS NULL OR create_attempt_at IS NOT NULL),
  CHECK(status <> 'completed' OR (answer_json IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX keyword_benchmark_runs_owner_created ON keyword_benchmark_runs(user_id, created_at DESC, id);
CREATE INDEX keyword_benchmark_runs_owner_case ON keyword_benchmark_runs(user_id, case_id, created_at DESC);
CREATE INDEX keyword_benchmark_runs_owner_status ON keyword_benchmark_runs(user_id, status);

-- Frozen inputs and execution settings cannot drift during provider retrieval.
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
  OR OLD.status IN ('completed','failed','cancelled')
BEGIN SELECT RAISE(ABORT, 'Benchmark inputs and terminal observations are immutable'); END;
