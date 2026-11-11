-- Organizations: people who work on websites together. Anyone can create one or
-- join one with an invite link. Websites stay owned by the person who saved them;
-- sharing one lets members read its saved reports. Nothing here spends credits.
CREATE TABLE organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','member')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX organization_members_user ON organization_members(user_id);

-- Only the hash of an invite link's secret is stored; the link is shown once.
CREATE TABLE organization_invites (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 100),
  uses INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER
);
CREATE INDEX organization_invites_org ON organization_invites(organization_id, created_at DESC);

CREATE TABLE organization_websites (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  shared_at INTEGER NOT NULL,
  PRIMARY KEY (organization_id, site_id)
);
CREATE INDEX organization_websites_site ON organization_websites(site_id);
