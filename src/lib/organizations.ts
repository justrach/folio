import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError, agentApiHash } from "./agent-api-key-store";
import { sequentially } from "./sequential";

/**
 * Organizations: anyone can create one or join one with an invite link. Websites stay
 * owned by the person who saved them; sharing one lets every member (and their agents)
 * read its saved reports. Owners invite (by link or by email), remove and promote
 * members. Nothing here contacts a provider, sends email or spends credits.
 */
export const ORGANIZATION_LIMITS = { ownedPerUser: 10, membershipsPerUser: 20, membersPerOrganization: 100, websitesPerOrganization: 50,
  activeInvites: 20, inviteDays: 14, inviteUses: 25, pendingEmails: 50, emailInviteDays: 30 } as const;
export type OrganizationRole = "owner" | "member";
export type OrganizationSummary = { id: string; name: string; role: OrganizationRole; members: number; websites: number; createdAt: string };
export type OrganizationMember = { userId: string; name: string; email: string; role: OrganizationRole; joinedAt: string; you: boolean;
  agents: { name: string; scopes: string[]; lastUsedAt: string | null; expiresAt: string }[] };
export type SharedWebsite = { websiteId: string; name: string; url: string; domain: string; sharedBy: { userId: string; name: string }; sharedAt: string; canUnshare: boolean };
export type OrganizationInvite = { id: string; createdAt: string; expiresAt: string; uses: number; maxUses: number; createdBy: string | null };
/** Someone an owner added by email who hasn't signed in with that email yet. */
export type PendingMember = { id: string; email: string; addedAt: string; expiresAt: string; addedBy: string | null };
export type JoinedByEmail = { id: string; name: string; addedBy: string | null };
export type OrganizationActivity = { memberName: string; agentName: string | null; tool: string; summary: string; domain: string | null; at: string };
export type OrganizationDetail = { id: string; name: string; createdAt: string; yourRole: OrganizationRole; members: OrganizationMember[]; websites: SharedWebsite[];
  /** Owners only; null for members. */
  invites: OrganizationInvite[] | null; pending: PendingMember[] | null; shareable: { websiteId: string; name: string; url: string }[]; activity: OrganizationActivity[] };
export type InvitePreview = { organization: { id: string; name: string; members: number }; invitedBy: string | null; expiresAt: string; alreadyMember: boolean };

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TOKEN = /^folio_join_[a-f0-9]{48}$/;
const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;
const iso = (value: unknown) => new Date(Number(value)).toISOString();
const hostOf = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""); } catch { return url; } };
const signedIn = (userId: string) => { if (!userId) throw new AgentApiError("Sign in to use organizations.", 401, "unauthorized"); };
function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new AgentApiError(`Use a valid ${label} ID.`, 400, "invalid_request");
  return value;
}
export function organizationName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new AgentApiError("Use an organization name of 1–80 characters.", 400, "invalid_request");
  return name;
}
export function memberEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length < 3 || email.length > 254 || !EMAIL.test(email)) throw new AgentApiError("Use a valid email address.", 400, "invalid_request");
  return email;
}
async function roleIn(db: D1Database, userId: string, organizationId: string): Promise<OrganizationRole> {
  signedIn(userId);
  const row = await db.prepare("SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?").bind(identifier(organizationId, "organization"), userId).first<{ role: OrganizationRole }>();
  // Non-members cannot tell whether an organization exists.
  if (!row) throw new AgentApiError("Organization not found.", 404, "not_found");
  return row.role;
}
async function requireOwner(db: D1Database, userId: string, organizationId: string) {
  if (await roleIn(db, userId, organizationId) !== "owner") throw new AgentApiError("Only an owner of this organization can do that.", 403, "forbidden");
}
async function counts(db: D1Database, organizationId: string) {
  const row = await db.prepare(`SELECT (SELECT COUNT(*) FROM organization_members WHERE organization_id = ?) AS members,
    (SELECT COUNT(*) FROM organization_members WHERE organization_id = ? AND role = 'owner') AS owners,
    (SELECT COUNT(*) FROM organization_websites WHERE organization_id = ?) AS websites`).bind(organizationId, organizationId, organizationId).first<{ members: number; owners: number; websites: number }>();
  return { members: Number(row?.members ?? 0), owners: Number(row?.owners ?? 0), websites: Number(row?.websites ?? 0) };
}
async function memberships(db: D1Database, userId: string) {
  const row = await db.prepare(`SELECT (SELECT COUNT(*) FROM organization_members WHERE user_id = ?) AS memberships,
    (SELECT COUNT(*) FROM organization_members WHERE user_id = ? AND role = 'owner') AS owned`).bind(userId, userId).first<{ memberships: number; owned: number }>();
  return { memberships: Number(row?.memberships ?? 0), owned: Number(row?.owned ?? 0) };
}

export async function listOrganizations(db: D1Database, userId: string): Promise<OrganizationSummary[]> {
  signedIn(userId);
  const { results } = await db.prepare(`SELECT o.id, o.name, o.created_at, m.role,
      (SELECT COUNT(*) FROM organization_members x WHERE x.organization_id = o.id) AS members,
      (SELECT COUNT(*) FROM organization_websites w WHERE w.organization_id = o.id) AS websites
    FROM organization_members m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = ? ORDER BY m.joined_at, o.id`)
    .bind(userId).all<{ id: string; name: string; created_at: number; role: OrganizationRole; members: number; websites: number }>();
  return results.map(row => ({ id: row.id, name: row.name, role: row.role, members: Number(row.members), websites: Number(row.websites), createdAt: iso(row.created_at) }));
}

export async function createOrganization(db: D1Database, userId: string, input: { name: unknown }, now = Date.now()): Promise<OrganizationSummary> {
  signedIn(userId);
  const name = organizationName(input.name), mine = await memberships(db, userId);
  if (mine.owned >= ORGANIZATION_LIMITS.ownedPerUser || mine.memberships >= ORGANIZATION_LIMITS.membershipsPerUser)
    throw new AgentApiError("This account is in the maximum number of organizations. Leave one first.", 409, "limit_reached");
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO organizations(id, name, created_by, created_at) VALUES(?, ?, ?, ?)").bind(id, name, userId, now),
    db.prepare("INSERT INTO organization_members(organization_id, user_id, role, joined_at) VALUES(?, ?, 'owner', ?)").bind(id, userId, now),
  ]);
  return { id, name, role: "owner", members: 1, websites: 0, createdAt: iso(now) };
}

export async function getOrganization(db: D1Database, userId: string, organizationId: string, now = Date.now()): Promise<OrganizationDetail> {
  const yourRole = await roleIn(db, userId, organizationId);
  const organization = await db.prepare("SELECT id, name, created_at FROM organizations WHERE id = ?").bind(organizationId).first<{ id: string; name: string; created_at: number }>();
  if (!organization) throw new AgentApiError("Organization not found.", 404, "not_found");
  const [members, keys, websites, invites, pending, shareable] = await sequentially([
    () => db.prepare(`SELECT m.user_id, m.role, m.joined_at, u.name, u.email FROM organization_members m JOIN user u ON u.id = m.user_id
      WHERE m.organization_id = ? ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, m.joined_at, m.user_id`).bind(organizationId)
      .all<{ user_id: string; role: OrganizationRole; joined_at: number; name: string; email: string }>(),
    // Members see which agents their teammates have connected: key names and last use, never the key.
    () => db.prepare(`SELECT k.user_id, k.name, k.scopes_json, k.last_used_at, k.expires_at FROM agent_api_keys k
      JOIN organization_members m ON m.user_id = k.user_id AND m.organization_id = ? WHERE k.revoked_at IS NULL AND k.expires_at > ? ORDER BY k.created_at DESC`)
      .bind(organizationId, now).all<{ user_id: string; name: string; scopes_json: string; last_used_at: number | null; expires_at: number }>(),
    () => db.prepare(`SELECT w.site_id, w.shared_by, w.shared_at, s.name, s.url, s.user_id, u.name AS shared_by_name FROM organization_websites w
      JOIN sites s ON s.id = w.site_id JOIN user u ON u.id = w.shared_by WHERE w.organization_id = ? ORDER BY w.shared_at, w.site_id`).bind(organizationId)
      .all<{ site_id: string; shared_by: string; shared_at: number; name: string; url: string; user_id: string; shared_by_name: string }>(),
    () => yourRole === "owner" ? db.prepare(`SELECT i.id, i.created_at, i.expires_at, i.uses, i.max_uses, u.name AS created_by_name FROM organization_invites i
      LEFT JOIN user u ON u.id = i.created_by WHERE i.organization_id = ? AND i.revoked_at IS NULL AND i.expires_at > ? AND i.uses < i.max_uses ORDER BY i.created_at DESC`)
      .bind(organizationId, now).all<{ id: string; created_at: number; expires_at: number; uses: number; max_uses: number; created_by_name: string | null }>() : Promise.resolve(null),
    () => yourRole === "owner" ? db.prepare(`SELECT i.id, i.email, i.created_at, i.expires_at, u.name AS invited_by_name FROM organization_email_invites i
      LEFT JOIN user u ON u.id = i.invited_by WHERE i.organization_id = ? AND i.expires_at > ? ORDER BY i.created_at DESC, i.id`)
      .bind(organizationId, now).all<{ id: string; email: string; created_at: number; expires_at: number; invited_by_name: string | null }>() : Promise.resolve(null),
    () => db.prepare(`SELECT id, name, url FROM sites WHERE user_id = ? AND id NOT IN (SELECT site_id FROM organization_websites WHERE organization_id = ?)
      ORDER BY created_at DESC LIMIT 100`).bind(userId, organizationId).all<{ id: string; name: string; url: string }>(),
  ] as const);
  const shared = websites.results.map(row => ({ websiteId: row.site_id, name: row.name, url: row.url, domain: hostOf(row.url),
    sharedBy: { userId: row.shared_by, name: row.shared_by_name }, sharedAt: iso(row.shared_at), canUnshare: row.user_id === userId || yourRole === "owner" }));
  // Agent activity is shown only for the organization's shared websites; other asks stay private.
  const domains = [...new Set(shared.map(item => item.domain))];
  const activity = domains.length ? (await db.prepare(`SELECT a.tool, a.summary, a.domain, a.created_at, u.name AS member_name, k.name AS key_name FROM agent_index_asks a
      JOIN organization_members m ON m.user_id = a.user_id AND m.organization_id = ? JOIN user u ON u.id = a.user_id LEFT JOIN agent_api_keys k ON k.id = a.key_id
      WHERE a.domain IN (${domains.map(() => "?").join(", ")}) ORDER BY a.created_at DESC LIMIT 20`).bind(organizationId, ...domains)
      .all<{ tool: string; summary: string; domain: string | null; created_at: number; member_name: string; key_name: string | null }>()).results : [];
  return { id: organization.id, name: organization.name, createdAt: iso(organization.created_at), yourRole,
    members: members.results.map(row => ({ userId: row.user_id, name: row.name, email: row.email, role: row.role, joinedAt: iso(row.joined_at), you: row.user_id === userId,
      agents: keys.results.filter(key => key.user_id === row.user_id).map(key => ({ name: key.name, scopes: JSON.parse(key.scopes_json) as string[],
        lastUsedAt: key.last_used_at === null ? null : iso(key.last_used_at), expiresAt: iso(key.expires_at) })) })),
    websites: shared,
    invites: invites ? invites.results.map(row => ({ id: row.id, createdAt: iso(row.created_at), expiresAt: iso(row.expires_at), uses: Number(row.uses), maxUses: Number(row.max_uses), createdBy: row.created_by_name })) : null,
    pending: pending ? pending.results.map(row => ({ id: row.id, email: row.email, addedAt: iso(row.created_at), expiresAt: iso(row.expires_at), addedBy: row.invited_by_name })) : null,
    shareable: shareable.results.map(row => ({ websiteId: row.id, name: row.name, url: row.url })),
    activity: activity.map(row => ({ memberName: row.member_name, agentName: row.key_name, tool: row.tool, summary: row.summary, domain: row.domain, at: iso(row.created_at) })) };
}

/** The link's secret is returned once; only its hash is stored. */
export async function createInvite(db: D1Database, userId: string, organizationId: string, now = Date.now()): Promise<{ invite: OrganizationInvite; token: string }> {
  await requireOwner(db, userId, organizationId);
  const active = await db.prepare("SELECT COUNT(*) AS n FROM organization_invites WHERE organization_id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses")
    .bind(organizationId, now).first<{ n: number }>();
  if (Number(active?.n ?? 0) >= ORGANIZATION_LIMITS.activeInvites) throw new AgentApiError("Revoke an existing invite link before creating another.", 409, "limit_reached");
  const token = `folio_join_${Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, "0")).join("")}`;
  const id = crypto.randomUUID(), expires = now + ORGANIZATION_LIMITS.inviteDays * 86_400_000;
  await db.prepare("INSERT INTO organization_invites(id, organization_id, token_hash, created_by, created_at, expires_at, max_uses, uses) VALUES(?, ?, ?, ?, ?, ?, ?, 0)")
    .bind(id, organizationId, await agentApiHash(token), userId, now, expires, ORGANIZATION_LIMITS.inviteUses).run();
  return { token, invite: { id, createdAt: iso(now), expiresAt: iso(expires), uses: 0, maxUses: ORGANIZATION_LIMITS.inviteUses, createdBy: null } };
}
export async function revokeInvite(db: D1Database, userId: string, organizationId: string, inviteId: unknown, now = Date.now()) {
  await requireOwner(db, userId, organizationId);
  const result = await db.prepare("UPDATE organization_invites SET revoked_at = ? WHERE id = ? AND organization_id = ? AND revoked_at IS NULL")
    .bind(now, identifier(inviteId, "invite"), organizationId).run();
  if (!result.meta.changes) throw new AgentApiError("Invite not found.", 404, "not_found");
}
async function validInvite(db: D1Database, userId: string, token: unknown, now: number) {
  signedIn(userId);
  if (typeof token !== "string" || !TOKEN.test(token)) throw new AgentApiError("This invite link isn’t valid. Ask for a new one.", 404, "not_found");
  const row = await db.prepare(`SELECT i.id, i.organization_id, i.expires_at, o.name, u.name AS invited_by,
      (SELECT COUNT(*) FROM organization_members x WHERE x.organization_id = i.organization_id) AS members,
      CASE WHEN EXISTS(SELECT 1 FROM organization_members y WHERE y.organization_id = i.organization_id AND y.user_id = ?) THEN 1 ELSE 0 END AS already
    FROM organization_invites i JOIN organizations o ON o.id = i.organization_id LEFT JOIN user u ON u.id = i.created_by
    WHERE i.token_hash = ? AND i.revoked_at IS NULL AND i.expires_at > ? AND i.uses < i.max_uses`)
    .bind(userId, await agentApiHash(token), now).first<{ id: string; organization_id: string; expires_at: number; name: string; invited_by: string | null; members: number; already: number }>();
  if (!row) throw new AgentApiError("This invite link has expired, was revoked or has been used up. Ask for a new one.", 404, "not_found");
  return row;
}
export async function previewInvite(db: D1Database, userId: string, token: unknown, now = Date.now()): Promise<InvitePreview> {
  const row = await validInvite(db, userId, token, now);
  return { organization: { id: row.organization_id, name: row.name, members: Number(row.members) }, invitedBy: row.invited_by, expiresAt: iso(row.expires_at), alreadyMember: Number(row.already) === 1 };
}
/** Joining is always an explicit step; a link alone never adds anyone. */
export async function acceptInvite(db: D1Database, userId: string, token: unknown, now = Date.now()): Promise<{ organizationId: string; joined: boolean }> {
  const row = await validInvite(db, userId, token, now);
  if (Number(row.already) === 1) return { organizationId: row.organization_id, joined: false };
  if ((await memberships(db, userId)).memberships >= ORGANIZATION_LIMITS.membershipsPerUser)
    throw new AgentApiError("This account is in the maximum number of organizations. Leave one first.", 409, "limit_reached");
  if (Number(row.members) >= ORGANIZATION_LIMITS.membersPerOrganization) throw new AgentApiError("This organization is full.", 409, "limit_reached");
  const claimed = await db.prepare("UPDATE organization_invites SET uses = uses + 1 WHERE id = ? AND revoked_at IS NULL AND expires_at > ? AND uses < max_uses").bind(row.id, now).run();
  if (!claimed.meta.changes) throw new AgentApiError("This invite link has just been used up. Ask for a new one.", 404, "not_found");
  await db.prepare("INSERT INTO organization_members(organization_id, user_id, role, joined_at) VALUES(?, ?, 'member', ?) ON CONFLICT DO NOTHING").bind(row.organization_id, userId, now).run();
  return { organizationId: row.organization_id, joined: true };
}

/**
 * Owners add someone by email before they have an account. Nobody is looked up, so this never reveals
 * who uses Folio: the person joins when they next sign in with that email, verified by Google or GitHub.
 * Adding the same email again extends the wait.
 */
export async function addMemberByEmail(db: D1Database, userId: string, organizationId: string, email: unknown, now = Date.now()): Promise<{ pending: PendingMember }> {
  await requireOwner(db, userId, organizationId);
  const address = memberEmail(email);
  const member = await db.prepare("SELECT 1 AS found FROM organization_members m JOIN user u ON u.id = m.user_id WHERE m.organization_id = ? AND lower(u.email) = ?")
    .bind(organizationId, address).first<{ found: number }>();
  if (member) throw new AgentApiError("That person is already a member.", 409, "already_member");
  const waiting = await db.prepare("SELECT COUNT(*) AS n FROM organization_email_invites WHERE organization_id = ? AND expires_at > ? AND email <> ?")
    .bind(organizationId, now, address).first<{ n: number }>();
  const others = Number(waiting?.n ?? 0);
  if (others >= ORGANIZATION_LIMITS.pendingEmails) throw new AgentApiError("Cancel someone who hasn’t joined yet before adding another email.", 409, "limit_reached");
  if ((await counts(db, organizationId)).members + others >= ORGANIZATION_LIMITS.membersPerOrganization) throw new AgentApiError("This organization is full.", 409, "limit_reached");
  const expires = now + ORGANIZATION_LIMITS.emailInviteDays * 86_400_000;
  await db.prepare(`INSERT INTO organization_email_invites(id, organization_id, email, invited_by, created_at, expires_at) VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, email) DO UPDATE SET invited_by = excluded.invited_by, created_at = excluded.created_at, expires_at = excluded.expires_at`)
    .bind(crypto.randomUUID(), organizationId, address, userId, now, expires).run();
  const row = await db.prepare("SELECT id FROM organization_email_invites WHERE organization_id = ? AND email = ?").bind(organizationId, address).first<{ id: string }>();
  return { pending: { id: row!.id, email: address, addedAt: iso(now), expiresAt: iso(expires), addedBy: null } };
}
export async function cancelEmailInvite(db: D1Database, userId: string, organizationId: string, inviteId: unknown) {
  await requireOwner(db, userId, organizationId);
  const result = await db.prepare("DELETE FROM organization_email_invites WHERE id = ? AND organization_id = ?").bind(identifier(inviteId, "invite"), organizationId).run();
  if (!result.meta.changes) throw new AgentApiError("That person isn’t waiting to join.", 404, "not_found");
}
/**
 * Turns the signed-in person's waiting email invites into memberships. Only an email their sign-in
 * provider verified counts, so creating an account with someone else's address claims nothing.
 * An invite that would break a limit keeps waiting.
 */
export async function claimEmailInvites(db: D1Database, userId: string, now = Date.now()): Promise<JoinedByEmail[]> {
  signedIn(userId);
  const user = await db.prepare("SELECT email, email_verified FROM user WHERE id = ?").bind(userId).first<{ email: string | null; email_verified: unknown }>();
  if (!user?.email || !(user.email_verified === true || Number(user.email_verified) === 1)) return [];
  const { results } = await db.prepare(`SELECT i.id, i.organization_id, o.name, u.name AS invited_by_name FROM organization_email_invites i
      JOIN organizations o ON o.id = i.organization_id LEFT JOIN user u ON u.id = i.invited_by WHERE i.email = ? AND i.expires_at > ? ORDER BY i.created_at, i.id`)
    .bind(user.email.trim().toLowerCase(), now).all<{ id: string; organization_id: string; name: string; invited_by_name: string | null }>();
  const joined: JoinedByEmail[] = [];
  for (const row of results) {
    if ((await memberships(db, userId)).memberships >= ORGANIZATION_LIMITS.membershipsPerUser || (await counts(db, row.organization_id)).members >= ORGANIZATION_LIMITS.membersPerOrganization) continue;
    const added = await db.prepare("INSERT INTO organization_members(organization_id, user_id, role, joined_at) VALUES(?, ?, 'member', ?) ON CONFLICT DO NOTHING").bind(row.organization_id, userId, now).run();
    await db.prepare("DELETE FROM organization_email_invites WHERE id = ?").bind(row.id).run();
    if (added.meta.changes) joined.push({ id: row.organization_id, name: row.name, addedBy: row.invited_by_name });
  }
  return joined;
}

/** A member who leaves or is removed takes their shared websites with them. */
export async function removeMember(db: D1Database, userId: string, organizationId: string, memberId: unknown) {
  await requireOwner(db, userId, organizationId);
  const target = identifier(memberId, "member");
  if (target === userId) throw new AgentApiError("Use “Leave organization” to remove yourself.", 400, "invalid_request");
  const [removed] = await db.batch([
    db.prepare("DELETE FROM organization_members WHERE organization_id = ? AND user_id = ? RETURNING user_id").bind(organizationId, target),
    db.prepare("DELETE FROM organization_websites WHERE organization_id = ? AND shared_by = ?").bind(organizationId, target),
  ]);
  if (!removed.results.length) throw new AgentApiError("Member not found.", 404, "not_found");
}
export async function setMemberRole(db: D1Database, userId: string, organizationId: string, memberId: unknown, role: unknown) {
  await requireOwner(db, userId, organizationId);
  if (role !== "owner" && role !== "member") throw new AgentApiError("Choose owner or member.", 400, "invalid_request");
  const target = identifier(memberId, "member");
  if (role === "member" && (await counts(db, organizationId)).owners <= 1) {
    const current = await db.prepare("SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?").bind(organizationId, target).first<{ role: string }>();
    if (current?.role === "owner") throw new AgentApiError("Every organization needs an owner. Make someone else an owner first.", 409, "last_owner");
  }
  const result = await db.prepare("UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?").bind(role, organizationId, target).run();
  if (!result.meta.changes) throw new AgentApiError("Member not found.", 404, "not_found");
}
/** The last member leaving deletes the organization; the last owner of a team must hand over first. */
export async function leaveOrganization(db: D1Database, userId: string, organizationId: string): Promise<{ deleted: boolean }> {
  const role = await roleIn(db, userId, organizationId), total = await counts(db, organizationId);
  if (total.members <= 1) {
    await db.prepare("DELETE FROM organizations WHERE id = ?").bind(organizationId).run();
    return { deleted: true };
  }
  if (role === "owner" && total.owners <= 1) throw new AgentApiError("Make another member an owner before you leave.", 409, "last_owner");
  await db.batch([
    db.prepare("DELETE FROM organization_websites WHERE organization_id = ? AND shared_by = ?").bind(organizationId, userId),
    db.prepare("DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?").bind(organizationId, userId),
  ]);
  return { deleted: false };
}
export async function renameOrganization(db: D1Database, userId: string, organizationId: string, name: unknown) {
  await requireOwner(db, userId, organizationId);
  await db.prepare("UPDATE organizations SET name = ? WHERE id = ?").bind(organizationName(name), organizationId).run();
}

/** Any member can share a website they saved; the website stays theirs. */
export async function shareWebsite(db: D1Database, userId: string, organizationId: string, websiteId: unknown, now = Date.now()) {
  await roleIn(db, userId, organizationId);
  const site = await db.prepare("SELECT id FROM sites WHERE id = ? AND user_id = ?").bind(identifier(websiteId, "website"), userId).first<{ id: string }>();
  if (!site) throw new AgentApiError("Share a website you saved in your own account.", 404, "not_found");
  if ((await counts(db, organizationId)).websites >= ORGANIZATION_LIMITS.websitesPerOrganization) throw new AgentApiError("This organization already shares the maximum number of websites.", 409, "limit_reached");
  await db.prepare("INSERT INTO organization_websites(organization_id, site_id, shared_by, shared_at) VALUES(?, ?, ?, ?) ON CONFLICT DO NOTHING").bind(organizationId, site.id, userId, now).run();
}
export async function unshareWebsite(db: D1Database, userId: string, organizationId: string, websiteId: unknown) {
  const role = await roleIn(db, userId, organizationId), id = identifier(websiteId, "website");
  const row = await db.prepare("SELECT s.user_id FROM organization_websites w JOIN sites s ON s.id = w.site_id WHERE w.organization_id = ? AND w.site_id = ?").bind(organizationId, id).first<{ user_id: string }>();
  if (!row) throw new AgentApiError("That website isn’t shared with this organization.", 404, "not_found");
  if (row.user_id !== userId && role !== "owner") throw new AgentApiError("Only the person who shared it or an owner can stop sharing it.", 403, "forbidden");
  await db.prepare("DELETE FROM organization_websites WHERE organization_id = ? AND site_id = ?").bind(organizationId, id).run();
}

/** A website the reader owns, or one shared with an organization they belong to. Never a write. */
export async function readableWebsite(db: D1Database, userId: string, websiteId: string) {
  signedIn(userId);
  const site = await db.prepare(`SELECT s.id, s.name, s.url, s.user_id FROM sites s WHERE s.id = ? AND (s.user_id = ? OR EXISTS(
      SELECT 1 FROM organization_websites w JOIN organization_members m ON m.organization_id = w.organization_id WHERE w.site_id = s.id AND m.user_id = ?))`)
    .bind(identifier(websiteId, "website"), userId, userId).first<{ id: string; name: string; url: string; user_id: string }>();
  if (!site) return null;
  const { results } = await db.prepare(`SELECT o.id, o.name FROM organization_websites w JOIN organizations o ON o.id = w.organization_id
      JOIN organization_members m ON m.organization_id = w.organization_id AND m.user_id = ? WHERE w.site_id = ? ORDER BY o.name, o.id`)
    .bind(userId, site.id).all<{ id: string; name: string }>();
  return { site: { id: site.id, name: site.name, url: site.url }, ownerId: site.user_id, access: site.user_id === userId ? "owner" as const : "organization" as const, organizations: results };
}

/** For agents: the caller's organizations, teammates (names and roles only) and shared website IDs. */
export async function agentOrganizations(db: D1Database, userId: string, now = Date.now()) {
  await claimEmailInvites(db, userId, now);
  const items = [];
  for (const summary of await listOrganizations(db, userId)) {
    const detail = await getOrganization(db, userId, summary.id, now);
    items.push({ id: detail.id, name: detail.name, role: detail.yourRole,
      members: detail.members.map(member => ({ name: member.name, role: member.role, agents: member.agents.length, you: member.you })),
      websites: detail.websites.map(site => ({ websiteId: site.websiteId, name: site.name, domain: site.domain, sharedBy: site.sharedBy.name })) });
  }
  return { items, note: "Pass a websiteId to folio_website_gaps to read what that website is missing. Shared websites show the saved reports of the member who shared them." };
}
