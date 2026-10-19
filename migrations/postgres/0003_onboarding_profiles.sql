-- Owner-reviewed setup only; private and separate from measured observations.
CREATE TABLE onboarding_profiles (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  suite_id TEXT NOT NULL,
  profile_json TEXT NOT NULL CHECK(octet_length(profile_json) <= 20000),
  created_at BIGINT NOT NULL,
  PRIMARY KEY(user_id,id),
  FOREIGN KEY(suite_id,user_id) REFERENCES keyword_benchmark_suites(id,user_id) ON DELETE CASCADE
);
CREATE INDEX onboarding_profiles_owner_created ON onboarding_profiles(user_id,created_at DESC,id);
