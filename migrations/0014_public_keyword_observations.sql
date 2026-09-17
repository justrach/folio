-- Explicit owner publication; withdrawal retains a revision tombstone.
CREATE TABLE public_keyword_observations (
  run_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (run_id, user_id),
  FOREIGN KEY (run_id, user_id) REFERENCES keyword_benchmark_runs(id, user_id) ON DELETE CASCADE,
  CHECK (payload_json IS NULL OR json_valid(payload_json))
);
