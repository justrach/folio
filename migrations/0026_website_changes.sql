-- A reviewable website change recorded by the owner's agent, with the answers saved
-- before it. Folio does not edit, publish or verify the website itself.
CREATE TABLE website_changes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  -- Retry identity for the recording request; the request key itself is not stored.
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  summary TEXT NOT NULL CHECK(length(summary) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK(status IN ('proposed','published','withdrawn')),
  key_id TEXT,
  -- Files, reference URL, payload identity and the per-question baseline snapshot.
  detail_json TEXT NOT NULL,
  -- Caller-reported time the change went live; never independently verified.
  published_at INTEGER,
  published_by TEXT CHECK(published_by IS NULL OR published_by IN ('agent','owner')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, request_hash)
);
CREATE INDEX website_changes_owner_site ON website_changes(user_id, site_id, created_at DESC);
