"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, Check, Coins, Eye, Loader2, PencilLine } from "lucide-react";
import { AGENT_PERMISSIONS } from "@/lib/agent-onboarding";
import type { AgentApiScope } from "@/lib/agent-observation-types";
import "./connect-consent.css";

/**
 * The consent card an agent's connection goes through: who is asking, which account, what it may do, and which
 * organizations' shared websites it may read. Approving is the caller's write (a key now, OAuth later); this
 * component only collects the choice.
 */
export type ConsentOrganization = { id: string; name: string };
/** `organizations` null means every organization, now and later; [] means the person's own websites only. */
export type ConsentChoice = { scopes: AgentApiScope[]; organizations: string[] | null };
type Access = "read" | "changes";
type Paid = Extract<AgentApiScope, "evaluate" | "seo">;

export function FolioTile() {
  return <span className="cc-tile is-folio" aria-hidden="true"><span className="folio-mark"><i /><i /><i /><i /></span></span>;
}
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
const permission = (scope: AgentApiScope) => AGENT_PERMISSIONS.find(group => group.scope === scope)!;

/** The two tiles at the top: the agent, then Folio, joined by arrows (or a check once connected). */
export function ConsentTiles({ icon, done = false }: { icon: ReactNode; done?: boolean }) {
  return <div className="cc-tiles"><span className="cc-tile" aria-hidden="true">{icon}</span>
    {done ? <span className="cc-joined" aria-hidden="true"><Check size={13} strokeWidth={3} /></span> : <ArrowLeftRight size={15} className="cc-arrows" aria-hidden="true" />}
    <FolioTile /></div>;
}

type Props = {
  client: { label: string; icon: ReactNode };
  account: { name: string };
  onSwitchAccount?: () => void;
  /** null while loading. */
  organizations: ConsentOrganization[] | null;
  /** Extra rows inside the card, such as the key's name and expiry. */
  details?: ReactNode;
  busy: boolean;
  error?: string;
  onApprove: (choice: ConsentChoice) => void;
  onCancel?: () => void;
  footer?: ReactNode;
};

export function ConnectConsent({ client, account, onSwitchAccount, organizations, details, busy, error, onApprove, onCancel, footer }: Props) {
  const [access, setAccess] = useState<Access>("read");
  const [paid, setPaid] = useState<Paid[]>([]);
  const [mode, setMode] = useState<"all" | "select">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const togglePaid = (scope: Paid) => setPaid(previous => previous.includes(scope) ? previous.filter(item => item !== scope) : [...previous, scope]);
  const togglePick = (id: string) => setPicked(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id]);
  const scopes: AgentApiScope[] = ["read", ...(access === "changes" ? ["changes" as const] : []), ...paid];
  const choice: ConsentChoice = { scopes, organizations: mode === "all" ? null : (organizations ?? []).filter(org => picked.includes(org.id)).map(org => org.id) };
  const hasOrganizations = Boolean(organizations?.length);

  return <form className="cc-card" aria-label={`Connect ${client.label} to Folio`} onSubmit={event => { event.preventDefault(); if (!busy) onApprove(choice); }}>
    <header className="cc-head">
      <ConsentTiles icon={client.icon} />
      <p className="cc-title">Connect {client.label} to Folio</p>
      <p className="cc-sub">It’s asking to read your websites and reports through Folio.</p>
      <p className="cc-account"><span className="cc-avatar" aria-hidden="true">{initials(account.name)}</span>
        <span>Signed in as <b>{account.name}</b></span>
        {onSwitchAccount && <button type="button" className="cc-link" onClick={onSwitchAccount}>Switch account</button>}</p>
    </header>

    <div className="cc-panel">
      <section className="cc-section" aria-labelledby="cc-permissions">
        <div className="cc-section-head"><h4 id="cc-permissions">Permissions</h4>
          <div className="cc-segmented" role="radiogroup" aria-label="Permissions">
            {([["read", "Read only"], ["changes", "Read & record changes"]] as const).map(([value, label]) =>
              <button key={value} type="button" role="radio" aria-checked={access === value} onClick={() => setAccess(value)}>{label}</button>)}
          </div></div>
        <ul className="cc-lines">
          <li><Eye size={15} aria-hidden="true" />Find your websites and read what they’re missing, plus Folio’s published AI answers</li>
          {access === "read" ? <li className="is-check"><Check size={15} aria-hidden="true" />Nothing in Folio or on your websites is changed</li>
            : <li><PencilLine size={15} aria-hidden="true" />Save what it changed on your websites and when it went live. It can’t edit or publish them</li>}
          {paid.length > 0 && <li className="is-paid"><Coins size={15} aria-hidden="true" />Can spend: {paid.map(scope => permission(scope).label.toLowerCase()).join(" and ")}. Each one is charged, and it must confirm the spend</li>}
        </ul>
        <details className="cc-paid" open={paid.length > 0 || undefined}>
          <summary>Paid actions</summary>
          {(["evaluate", "seo"] as const).map(scope => <label key={scope}>
            <input type="checkbox" checked={paid.includes(scope)} onChange={() => togglePaid(scope)} />
            <span><strong>{permission(scope).label} · can charge</strong><small>{permission(scope).summary}</small></span></label>)}
        </details>
      </section>

      <section className="cc-section" aria-labelledby="cc-organizations">
        <div className="cc-section-head"><h4 id="cc-organizations">Organizations</h4>
          {hasOrganizations && <div className="cc-segmented" role="radiogroup" aria-label="Organizations">
            {([["all", "All"], ["select", "Select"]] as const).map(([value, label]) =>
              <button key={value} type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}>{label}</button>)}
          </div>}</div>
        {organizations === null ? <p className="cc-note" role="status"><Loader2 size={13} className="spin" aria-hidden="true" />Loading your organizations…</p>
          : hasOrganizations ? <>
            <div className="cc-chips">{organizations.map(org => mode === "all"
              ? <span key={org.id} className="cc-chip"><span className="cc-chip-mark" aria-hidden="true">{initials(org.name)}</span>{org.name}</span>
              : <button key={org.id} type="button" className="cc-chip" aria-pressed={picked.includes(org.id)} onClick={() => togglePick(org.id)}>
                <span className="cc-chip-mark" aria-hidden="true">{initials(org.name)}</span>{org.name}{picked.includes(org.id) && <Check size={13} aria-hidden="true" />}</button>)}</div>
            <p className="cc-note">{mode === "all" ? "Websites shared in every organization you’re in, now and later, plus your own."
              : choice.organizations!.length ? "Websites shared in the ones you picked, plus your own." : "Only your own websites. Pick organizations to add what they share."}</p>
          </> : <p className="cc-note">Your own websites. You’re not in an organization yet; ones you join later are included.</p>}
      </section>

      {details}
    </div>

    {error && <p className="cc-error" role="alert">{error}</p>}
    <div className="cc-actions">
      {onCancel && <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>Cancel</button>}
      <button type="submit" className="button primary" disabled={busy || organizations === null}>{busy && <Loader2 size={15} className="spin" aria-hidden="true" />}Approve</button>
    </div>
    {footer && <p className="cc-footer">{footer}</p>}
  </form>;
}

/** After approval: the same card, now saying what happened and what to do next. */
export function ConsentDone({ icon, title, children, connected }: { icon: ReactNode; title: string; children: ReactNode; connected: boolean }) {
  return <div className={`cc-card is-done ${connected ? "is-connected" : ""}`} role="status">
    <header className="cc-head"><ConsentTiles icon={icon} done /><p className="cc-title">{title}</p></header>
    {children}
  </div>;
}
