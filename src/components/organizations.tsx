"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Check, Copy, Globe2, KeyRound, Link2, LogOut, MessageSquareText, Plus, Share2, UserPlus, Users } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { InvitePreview, OrganizationDetail, OrganizationSummary } from "@/lib/organizations";
import { UiSelect } from "./ui/select";
import { WebsiteVisibility } from "./website-visibility";
import "./organizations.css";

const PENDING_INVITE = "folio-pending-invite";
const inviteToken = (text: string) => text.match(/folio_join_[a-f0-9]{48}/)?.[0] ?? null;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("") || "?";
function used(iso: string | null) {
  if (!iso) return "not used yet";
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  return seconds < 90 ? "used just now" : seconds < 3600 ? `used ${Math.round(seconds / 60)} min ago` : seconds < 86_400 ? `used ${Math.round(seconds / 3600)} h ago` : `used ${Math.round(seconds / 86_400)} d ago`;
}
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
async function call<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, body ? { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message ?? "That didn’t work. Please try again.");
  return payload as T;
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="button secondary org-copy" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* The text stays selectable. */ }
  }}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copied" : label}</button>;
}

/** Real organizations. Membership and sharing only: nothing on this page spends credits. */
export function Organizations() {
  const { data: session, isPending } = authClient.useSession();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    // The invite secret lives in the URL fragment, which never reaches a server log; keep it for this tab through sign-in.
    const fromHash = inviteToken(new URLSearchParams(window.location.hash.slice(1)).get("join") ?? "");
    if (fromHash) { sessionStorage.setItem(PENDING_INVITE, fromHash); history.replaceState(null, "", window.location.pathname + window.location.search); }
    setPending(fromHash ?? inviteToken(sessionStorage.getItem(PENDING_INVITE) ?? ""));
  }, []);
  if (isPending) return <p role="status">Loading organizations…</p>;
  if (!session) return <section className="panel org-signed-out" aria-label="Organizations">
    <Users size={22} aria-hidden="true" />
    <h2>{pending ? "You’ve been invited to an organization" : "Work on websites together"}</h2>
    <p>{pending ? "Sign in to see which organization invited you and join it. Nothing happens until you choose to join."
      : "Create an organization or join one with an invite link. Members share websites, see each other’s connected agents, and read the same reports."}</p>
    <div className="org-actions"><Link className="button primary" href="/login?next=/orgs">Sign in to continue<ArrowRight size={15} aria-hidden="true" /></Link>
      <Link className="button secondary" href="/orgs?view=preview">See the sample team preview</Link></div>
  </section>;
  return <SignedIn key={session.user.id} pending={pending} clearPending={() => { sessionStorage.removeItem(PENDING_INVITE); setPending(null); }}
    onInvite={token => { sessionStorage.setItem(PENDING_INVITE, token); setPending(token); }} />;
}

function SignedIn({ pending, clearPending, onInvite }: { pending: string | null; clearPending: () => void; onInvite: (token: string) => void }) {
  const [organizations, setOrganizations] = useState<OrganizationSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const load = useCallback(async (choose?: string) => {
    try {
      const { organizations: list } = await call<{ organizations: OrganizationSummary[] }>("/api/organizations");
      setOrganizations(list); setSelected(previous => choose ?? (previous && list.some(item => item.id === previous) ? previous : list[0]?.id ?? null)); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Your organizations couldn’t be loaded."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!organizations) return error ? <p role="alert">{error} <button className="text-link" onClick={() => void load()}>Try again</button></p> : <p role="status">Loading organizations…</p>;
  return <div className="org-workspace">
    {pending && <JoinCard token={pending} onDone={async organizationId => { clearPending(); await load(organizationId ?? undefined); }} />}
    {organizations.length === 0 ? <StartCard onCreated={id => load(id)} onInvite={onInvite} />
      : <>
        <div className="org-switcher">
          {organizations.length > 1 && <label>Organization<UiSelect aria-label="Organization" value={selected ?? ""} onChange={event => setSelected(event.target.value)}>
            {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</UiSelect></label>}
          <button type="button" className="button secondary" onClick={() => setCreating(value => !value)}><Plus size={14} aria-hidden="true" />New organization</button>
          <JoinByLink compact onInvite={onInvite} />
        </div>
        {creating && <CreateForm onCreated={async id => { setCreating(false); await load(id); }} />}
        {selected && <OrganizationView key={selected} id={selected} onLeft={() => load()} onChanged={() => load(selected)} />}
      </>}
  </div>;
}

function JoinCard({ token, onDone }: { token: string; onDone: (organizationId: string | null) => Promise<void> }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { call<{ invite: InvitePreview }>("/api/organizations/invites", { action: "preview", token }).then(result => setPreview(result.invite), failure => setError(failure.message)); }, [token]);
  if (error) return <section className="panel org-join" aria-label="Invitation"><p role="alert">{error}</p><button className="button secondary" onClick={() => void onDone(null)}>Dismiss</button></section>;
  if (!preview) return <p role="status">Checking your invitation…</p>;
  return <section className="panel org-join" aria-label="Invitation">
    <UserPlus size={20} aria-hidden="true" />
    <div><h2>{preview.alreadyMember ? `You’re already in ${preview.organization.name}` : `Join ${preview.organization.name}`}</h2>
      <p>{preview.invitedBy ? `${preview.invitedBy} invited you. ` : ""}{preview.organization.members} member{preview.organization.members === 1 ? "" : "s"}. Joining lets you read the websites they share and lets them see the agents you connect.</p></div>
    <div className="org-actions">
      {!preview.alreadyMember && <button className="button primary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const result = await call<{ organizationId: string }>("/api/organizations/invites", { action: "accept", token }); await onDone(result.organizationId); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Joining didn’t work."); setBusy(false); }
      }}>Join organization</button>}
      <button className="button secondary" disabled={busy} onClick={() => void onDone(preview.alreadyMember ? preview.organization.id : null)}>{preview.alreadyMember ? "Open it" : "Not now"}</button>
    </div>
  </section>;
}

function CreateForm({ onCreated }: { onCreated: (id: string) => Promise<void> | void }) {
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="org-create" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { const { organization } = await call<{ organization: OrganizationSummary }>("/api/organizations", { name }); await onCreated(organization.id); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The organization couldn’t be created."); } finally { setBusy(false); }
  }}>
    <label>Organization name<input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="For example, Manus" required /></label>
    <button className="button primary" disabled={busy || !name.trim()}>Create organization</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

function JoinByLink({ compact = false, onInvite }: { compact?: boolean; onInvite: (token: string) => void }) {
  const [value, setValue] = useState(""), [error, setError] = useState("");
  const submit = () => {
    const token = inviteToken(value);
    if (!token) { setError("Paste the whole invite link you were sent."); return; }
    setValue(""); onInvite(token);
  };
  const form = <form className="org-join-link" onSubmit={event => { event.preventDefault(); submit(); }}>
    <label>{compact ? "Invite link" : "Paste an invite link"}<input value={value} onChange={event => { setValue(event.target.value); setError(""); }} placeholder="https://…/orgs#join=…" /></label>
    <button className="button secondary" disabled={!value.trim()}>Continue</button>
    {error && <p role="alert">{error}</p>}
  </form>;
  return compact ? <details className="org-join-details"><summary><Link2 size={14} aria-hidden="true" />Join with a link</summary>{form}</details> : form;
}

function StartCard({ onCreated, onInvite }: { onCreated: (id: string) => Promise<void> | void; onInvite: (token: string) => void }) {
  return <section className="panel org-start" aria-label="Start an organization">
    <header><Users size={22} aria-hidden="true" /><div><h2>Work on websites together</h2>
      <p>An organization is a team in Folio. Members share websites, read the same “where it shows up” reports, and connect their own agents, which can read everything the team shares.</p></div></header>
    <div className="org-start-grid">
      <div><h3>Create one</h3><p>You become its owner and can invite people with a link.</p><CreateForm onCreated={onCreated} /></div>
      <div><h3>Join one</h3><p>Someone in the organization sends you an invite link.</p><JoinByLink onInvite={onInvite} /></div>
    </div>
  </section>;
}

function OrganizationView({ id, onLeft, onChanged }: { id: string; onLeft: () => void; onChanged: () => void }) {
  const { data: session } = authClient.useSession();
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null), [share, setShare] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => { call<{ organization: OrganizationDetail }>(`/api/organizations/${encodeURIComponent(id)}`).then(result => { setDetail(result.organization); setOpen(result.organization.websites[0]?.websiteId ?? null); }, failure => setError(failure.message)); }, [id]);
  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await call<{ organization: OrganizationDetail; token?: string }>(`/api/organizations/${encodeURIComponent(id)}`, body);
      setDetail(result.organization); setConfirm(null);
      if (result.token) setLink(`${window.location.origin}/orgs#join=${result.token}`);
      if (done) setNotice(done);
      onChanged();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "That didn’t work."); } finally { setBusy(false); }
  }
  if (!detail) return error ? <p role="alert">{error}</p> : <p role="status">Loading the organization…</p>;
  const owner = detail.yourRole === "owner", me = detail.members.find(member => member.you);
  const domain = detail.websites[0]?.domain ?? "our website";
  const origin = typeof window === "undefined" ? "https://usefolio.site" : window.location.origin;
  const claude = JSON.stringify({ mcpServers: { folio: { type: "http", url: `${origin}/api/mcp`, headers: { Authorization: "Bearer ${FOLIO_API_KEY}" } } } }, null, 2);
  const codex = `[mcp_servers.folio]\nurl = "${origin}/api/mcp"\nbearer_token_env_var = "FOLIO_API_KEY"`;
  const prompt = `Use Folio (the "folio" MCP server). Call folio_organizations to find the websites ${detail.name} shares, then folio_website_gaps for ${domain}. Tell me what it's missing, which gap to fix first and why, and what hasn't been checked yet. Don't start anything paid.`;
  return <div className="org-detail">
    <header className="panel org-head">
      <div className="org-mark" aria-hidden="true">{initials(detail.name)}</div>
      <div><h2>{detail.name}</h2><p><span className="org-role">{owner ? "Owner" : "Member"}</span>{detail.members.length} member{detail.members.length === 1 ? "" : "s"} · {detail.websites.length} shared website{detail.websites.length === 1 ? "" : "s"} · since {day(detail.createdAt)}</p></div>
    </header>
    {notice && <p role="status" className="org-notice">{notice}</p>}
    {error && <p role="alert" className="org-notice is-error">{error}</p>}

    <section className="panel org-onboard" aria-labelledby="org-onboard-title">
      <h2 id="org-onboard-title"><Bot size={20} aria-hidden="true" />Connect your agent</h2>
      <p>Each member connects their own agent (Claude Code, Codex, Cursor or any MCP client) with their own key. It can read your websites and everything shared with {detail.name}, and its reads show up below as team activity. It can’t spend unless the key allows it and you approve.</p>
      <ol className="org-steps">
        <li><span className="org-step-number">1</span><div><h3><KeyRound size={15} aria-hidden="true" />Create a Folio key</h3>
          <p>{me?.agents.length ? `You have ${me.agents.length} active key${me.agents.length === 1 ? "" : "s"}: ${me.agents.map(agent => agent.name).join(", ")}.` : "You haven’t connected an agent yet."} Read access is enough to start. Store it as <code>FOLIO_API_KEY</code>; it’s shown once.</p>
          <Link className="button secondary" href="/docs/api#api-keys">Create a key<ArrowRight size={14} aria-hidden="true" /></Link></div></li>
        <li><span className="org-step-number">2</span><div><h3><Link2 size={15} aria-hidden="true" />Add Folio to your agent</h3>
          <details open><summary>Claude Code · <code>.mcp.json</code></summary><pre>{claude}</pre><CopyButton text={claude} /></details>
          <details><summary>Codex · <code>config.toml</code></summary><pre>{codex}</pre><CopyButton text={codex} /></details>
          <details><summary>Any MCP client</summary><p>Streamable HTTP at <code>{origin}/api/mcp</code> with the header <code>Authorization: Bearer &lt;your key&gt;</code>.</p></details></div></li>
        <li><span className="org-step-number">3</span><div><h3><MessageSquareText size={15} aria-hidden="true" />Ask it what {domain === "our website" ? "your website" : domain} is missing</h3>
          <blockquote>{prompt}</blockquote><CopyButton text={prompt} label="Copy prompt" /></div></li>
      </ol>
    </section>

    <section className="panel org-websites" aria-labelledby="org-websites-title">
      <header><h2 id="org-websites-title"><Globe2 size={19} aria-hidden="true" />Shared websites</h2>
        {detail.shareable.length > 0 && <form className="org-share" onSubmit={event => { event.preventDefault(); if (share) void act({ action: "share_website", websiteId: share }, "Shared. Everyone in the organization can now read its reports."); }}>
          <UiSelect aria-label="Website to share" value={share} onChange={event => setShare(event.target.value)}><option value="">Share one of your websites…</option>
            {detail.shareable.map(site => <option key={site.websiteId} value={site.websiteId}>{site.name}</option>)}</UiSelect>
          <button className="button secondary" disabled={!share || busy}><Share2 size={14} aria-hidden="true" />Share</button></form>}
      </header>
      {detail.websites.length === 0 ? <p className="org-empty">No website is shared yet. {detail.shareable.length ? "Share one of yours above; it stays yours, and members read its saved reports." : <>Save a website on the <Link href="/websites">Websites</Link> page, then share it here.</>}</p>
        : <ul className="org-site-list">{detail.websites.map(site => <li key={site.websiteId}>
          <div className="org-site-row"><div><strong>{site.domain}</strong><span>Shared by {site.sharedBy.userId === session?.user.id ? "you" : site.sharedBy.name} · {day(site.sharedAt)}</span></div>
            <div className="org-actions">
              <button type="button" className="button secondary" aria-expanded={open === site.websiteId} onClick={() => setOpen(value => value === site.websiteId ? null : site.websiteId)}>{open === site.websiteId ? "Hide report" : "What it’s missing"}</button>
              {site.canUnshare && <button type="button" className="text-link" disabled={busy} onClick={() => void act({ action: "unshare_website", websiteId: site.websiteId }, `${site.domain} is no longer shared.`)}>Stop sharing</button>}
            </div></div>
          {open === site.websiteId && <WebsiteVisibility websiteId={site.websiteId} />}
        </li>)}</ul>}
    </section>

    <section className="panel org-members" aria-labelledby="org-members-title">
      <header><h2 id="org-members-title"><Users size={19} aria-hidden="true" />Members and their agents</h2></header>
      <ul>{detail.members.map(member => <li key={member.userId}>
        <span className="org-avatar" aria-hidden="true">{initials(member.name)}</span>
        <div className="org-member"><strong>{member.name}{member.you ? " (you)" : ""}</strong><span>{member.email}</span></div>
        <span className="org-role">{member.role === "owner" ? "Owner" : "Member"}</span>
        <ul className="org-agents" aria-label={`${member.name}'s agents`}>{member.agents.length ? member.agents.map((agent, index) => <li key={`${agent.name}-${index}`}><Bot size={13} aria-hidden="true" />{agent.name}<small>{used(agent.lastUsedAt)}</small></li>)
          : <li className="is-empty">No agent connected</li>}</ul>
        {owner && !member.you && <div className="org-member-actions">
          <button type="button" className="text-link" disabled={busy} onClick={() => void act({ action: "set_role", userId: member.userId, role: member.role === "owner" ? "member" : "owner" }, `${member.name} is now ${member.role === "owner" ? "a member" : "an owner"}.`)}>{member.role === "owner" ? "Make member" : "Make owner"}</button>
          {confirm === `remove:${member.userId}` ? <button type="button" className="text-link is-danger" disabled={busy} onClick={() => void act({ action: "remove_member", userId: member.userId }, `${member.name} was removed.`)}>Confirm remove</button>
            : <button type="button" className="text-link" onClick={() => setConfirm(`remove:${member.userId}`)}>Remove</button>}
        </div>}
      </li>)}</ul>
    </section>

    {owner && <section className="panel org-invites" aria-labelledby="org-invites-title">
      <header><h2 id="org-invites-title"><UserPlus size={19} aria-hidden="true" />Invite people</h2>
        <button type="button" className="button primary" disabled={busy} onClick={() => void act({ action: "invite" })}>Create invite link</button></header>
      <p>Anyone signed in who opens the link can join as a member for 14 days, up to 25 people. They choose to join; the link never adds anyone by itself.</p>
      {link && <div className="org-new-link" role="status"><label>New invite link · shown once<input readOnly value={link} onFocus={event => event.target.select()} /></label><CopyButton text={link} label="Copy link" /></div>}
      {detail.invites && detail.invites.length > 0 && <ul className="org-invite-list">{detail.invites.map(invite => <li key={invite.id}>
        <span>Created {day(invite.createdAt)}{invite.createdBy ? ` by ${invite.createdBy}` : ""}</span><span>{invite.uses} of {invite.maxUses} used · expires {day(invite.expiresAt)}</span>
        <button type="button" className="text-link" disabled={busy} onClick={() => void act({ action: "revoke_invite", inviteId: invite.id }, "That invite link no longer works.")}>Revoke</button></li>)}</ul>}
    </section>}

    <section className="panel org-activity" aria-labelledby="org-activity-title">
      <h2 id="org-activity-title"><Bot size={19} aria-hidden="true" />What the team’s agents read</h2>
      {detail.activity.length ? <ul>{detail.activity.map((item, index) => <li key={`${item.at}-${index}`}><span className="org-avatar is-small" aria-hidden="true">{initials(item.memberName)}</span>
        <div><strong>{item.memberName}{item.agentName ? ` · ${item.agentName}` : ""}</strong><p>{item.summary}</p></div><time dateTime={item.at}>{new Date(item.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></li>)}</ul>
        : <p className="org-empty">When a member’s agent reads a shared website, it appears here. Asks about other websites stay private to that member.</p>}
    </section>

    <footer className="org-leave">{confirm === "leave" ? <><span>{detail.members.length === 1 ? "You’re the only member, so leaving deletes the organization." : "You’ll lose access to its shared websites, and websites you shared stop being shared."}</span>
      <button type="button" className="button secondary is-danger" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await call(`/api/organizations/${encodeURIComponent(id)}`, { action: "leave" }); onLeft(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Leaving didn’t work."); setConfirm(null); } finally { setBusy(false); }
      }}>Confirm leave</button><button type="button" className="text-link" onClick={() => setConfirm(null)}>Cancel</button></>
      : <button type="button" className="text-link" onClick={() => setConfirm("leave")}><LogOut size={14} aria-hidden="true" />Leave organization</button>}</footer>
  </div>;
}
