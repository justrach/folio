-- First-party, event-only product analytics. Contains no names, emails, URLs or content.
CREATE TABLE IF NOT EXISTS product_usage_events (
  id TEXT PRIMARY KEY NOT NULL,
  browser_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  area TEXT NOT NULL,
  surface TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS product_usage_created_idx ON product_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS product_usage_browser_idx ON product_usage_events(browser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_usage_session_idx ON product_usage_events(session_id, created_at);
