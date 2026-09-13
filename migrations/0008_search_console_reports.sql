CREATE TABLE search_console_reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  report_json TEXT NOT NULL CHECK (length(CAST(report_json AS BLOB)) <= 1000000),
  summary_json TEXT NOT NULL CHECK (length(CAST(summary_json AS BLOB)) <= 30000)
);

CREATE INDEX search_console_reports_owner_created ON search_console_reports(user_id, created_at DESC);
