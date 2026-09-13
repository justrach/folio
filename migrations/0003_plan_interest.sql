CREATE TABLE IF NOT EXISTS plan_interest (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  plan_slug TEXT NOT NULL CHECK(plan_slug IN ('free','builder','team')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
