"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronsUpDown, CircleDashed, Layers, LogIn, LogOut, Plus, Settings2, SunMoon, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { setThemePreference, useFolioAppearance } from "./folio-appearance";
import { setGettingStartedVisibility, useGettingStartedVisibility } from "./getting-started";
import { aboveTrigger, useSidebarPopover } from "./sidebar-popover";
import "./account-menu.css";

type Organization = { id: string; name: string; role: "owner" | "member"; members: number };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
const APPEARANCE = [["light", "Light"], ["dark", "Dark"], ["system", "Auto"]] as const;

/**
 * The account menu at the bottom of the sidebar: who is signed in, settings, inviting people, connecting agents, the
 * colour theme and signing out, then the person's organizations with their role in each. Organizations load when the
 * menu first opens. In the workspace it replaces the floating theme picker.
 */
export function AccountMenu({ userId, label, detail, initial, onNavigate }: {
  /** null when signed out. */
  userId: string | null; label: string; detail: string; initial: string; onNavigate?: () => void;
}) {
  const [organizations, setOrganizations] = useState<Organization[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const { preference, ready } = useFolioAppearance();
  const checklist = useGettingStartedVisibility(userId);
  const popover = useSidebarPopover(aboveTrigger(332), () => {
    // The organization page that's open, if any, gets the check.
    const url = new URL(window.location.href);
    setCurrent(url.pathname === "/orgs" ? url.searchParams.get("org") : null);
    if (!userId || organizations) return;
    fetch("/api/organizations", { cache: "no-store" }).then(async response => {
      const body = response.ok ? await response.json() as { organizations?: Organization[] } : {};
      setOrganizations(body.organizations ?? []);
    }).catch(() => setOrganizations([]));
  });
  const go = () => { popover.close(); onNavigate?.(); };
  const owned = organizations?.find(org => org.role === "owner");
  async function signOut() {
    popover.close();
    await authClient.signOut().catch(() => undefined);
    window.location.assign("/login");
  }

  return <div className="account-menu" onKeyDown={popover.onKeyDown}>
    <button ref={popover.trigger} type="button" className="profile account-menu-trigger" popoverTarget={popover.id} aria-expanded={popover.open} aria-label={`Account: ${label}`}>
      <span className="avatar">{initial}</span>
      <span>{label}<small>{detail}</small></span>
      <ChevronsUpDown size={15} aria-hidden="true" />
    </button>
    <div ref={popover.panel} id={popover.id} popover="auto" className="am-panel">
      <div className="am-head">
        <span className="am-tile" aria-hidden="true">{userId ? initial : "F"}</span>
        <span className="am-who"><strong>{userId ? label : "Not signed in"}</strong><small>{detail}</small></span>
      </div>
      <nav className="am-items" aria-label="Account">
        {userId ? <>
          <Link href="/settings" className="am-item" onClick={go}><Settings2 size={18} aria-hidden="true" />Settings & connections</Link>
          <Link href={owned ? `/orgs?org=${encodeURIComponent(owned.id)}` : "/orgs"} className="am-item" onClick={go}><UserPlus size={18} aria-hidden="true" />Invite members</Link>
          <Link href="/agents#connect" className="am-item" onClick={go}><Layers size={18} aria-hidden="true" />Connect your agent</Link>
          {checklist === "hidden" && <button type="button" className="am-item" onClick={() => { popover.close(); setGettingStartedVisibility(userId, "shown"); }}>
            <CircleDashed size={18} aria-hidden="true" />Show getting started</button>}
        </> : <Link href="/login" className="am-item" onClick={go}><LogIn size={18} aria-hidden="true" />Sign in</Link>}
        <div className="am-item am-appearance">
          <SunMoon size={18} aria-hidden="true" /><span id={`${popover.id}-appearance`}>Appearance</span>
          <div className="am-segmented" role="radiogroup" aria-labelledby={`${popover.id}-appearance`}>
            {APPEARANCE.map(([value, name]) => <button key={value} type="button" role="radio" aria-checked={ready && preference === value}
              title={value === "system" ? "Follow this device" : undefined} onClick={() => setThemePreference(value)}>{name}</button>)}
          </div>
        </div>
        {userId && <button type="button" className="am-item" onClick={() => void signOut()}><LogOut size={18} aria-hidden="true" />Sign out</button>}
      </nav>
      {userId && <section className="am-orgs" aria-label="Your organizations">
        <p className="am-caption">Organizations</p>
        {organizations === null ? <p className="am-note" role="status">Loading…</p>
          : organizations.length ? organizations.map(org => <Link key={org.id} href={`/orgs?org=${encodeURIComponent(org.id)}`} className="am-item am-org" onClick={go}
            aria-current={current === org.id ? "page" : undefined}>
            <span className="am-org-mark" aria-hidden="true">{initials(org.name)}</span>
            <span className="am-org-name">{org.name}</span>
            {current === org.id ? <span className="am-current" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
              : <span className="am-role">{org.role === "owner" ? "Owner" : "Member"}</span>}
          </Link>)
          : <Link href="/orgs" className="am-item" onClick={go}><Plus size={18} aria-hidden="true" />Create an organization</Link>}
      </section>}
    </div>
  </div>;
}
