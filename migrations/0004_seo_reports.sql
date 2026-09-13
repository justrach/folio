CREATE TABLE IF NOT EXISTS seo_reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retrieved_at INTEGER,
  result_json TEXT
);

CREATE INDEX IF NOT EXISTS seo_reports_owner_created
  ON seo_reports (user_id, created_at DESC, id DESC);
