-- Guided onboarding (/start): anonymous page checks, onboarding progress, and pinned competitors.

-- A page check made before sign-up. Only a hash of the claim secret is stored;
-- the secret lives in an httpOnly cookie on the browser that ran the check.
CREATE TABLE IF NOT EXISTS pending_scans (
  id TEXT PRIMARY KEY NOT NULL,
  claim_hash TEXT NOT NULL,
  requester_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  seo_score REAL NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  claimed_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS pending_scans_requester_idx ON pending_scans(requester_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS pending_scans_created_idx ON pending_scans(created_at);

CREATE TABLE IF NOT EXISTS onboarding_state (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  site_id TEXT REFERENCES sites(id) ON DELETE SET NULL,
  audience TEXT,
  task TEXT,
  suite_id TEXT,
  competitors_saved_at INTEGER,
  baseline_requested_at INTEGER,
  search_console_skipped_at INTEGER,
  completed_at INTEGER,
  dismissed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tracked_competitors (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'public-index', 'starter-pack')),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, site_id, name)
);
CREATE INDEX IF NOT EXISTS tracked_competitors_site_idx ON tracked_competitors(user_id, site_id);
