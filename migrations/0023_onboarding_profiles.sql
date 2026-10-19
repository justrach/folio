-- Owner-reviewed setup only: these records are not observations or verified facts.
CREATE TABLE onboarding_profiles (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  suite_id TEXT NOT NULL,
  profile_json TEXT NOT NULL CHECK(length(CAST(profile_json AS BLOB)) <= 20000),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,id),
  FOREIGN KEY(suite_id,user_id) REFERENCES keyword_benchmark_suites(id,user_id) ON DELETE CASCADE
);
CREATE INDEX onboarding_profiles_owner_created ON onboarding_profiles(user_id,created_at DESC,id);
