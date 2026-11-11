-- An owner can add someone by email before that person has a Folio account. The row
-- waits until they sign in with that email, verified by Google or GitHub, and then
-- becomes a membership. Only the organization's owners see it. No email is sent.
CREATE TABLE organization_email_invites (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  invited_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE (organization_id, email)
);
CREATE INDEX organization_email_invites_email ON organization_email_invites(email);
