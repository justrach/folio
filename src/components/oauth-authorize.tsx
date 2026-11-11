"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Globe, Loader2, ShieldAlert, ShieldCheck, TriangleAlert } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { ConnectConsent, ConsentDone, FolioTile, type ConsentChoice, type ConsentOrganization } from "./connect-consent";
import { UiSelect } from "./ui/select";
import type { AgentApiScope } from "@/lib/agent-observation-types";
import "./connect-consent.css";

/**
 * /oauth/authorize: an app (Claude, ChatGPT, Cursor...) asks to connect to the person's Folio. The same consent card as
 * Connect your agent, plus where the sign-in returns to. Approving creates the connection's key on the server; the app
 * gets tokens for it, never the key.
 */
type Preview = { client: { id: string; name: string; uri: string | null; kind: "registered" | "metadata"; host: string | null };
  redirect: { uri: string; label: string; local: boolean }; requested: string[]; cancel: string };
type State = { status: "loading" } | { status: "problem"; message: string } | { status: "ready"; preview: Preview } | { status: "sent"; client: string; location: string };

export function OAuthAuthorize() {
  const query = useSearchParams().toString();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user.id);
  const [state, setState] = useState<State>({ status: "loading" });
  const [organizations, setOrganizations] = useState<ConsentOrganization[] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [name, setName] = useState(""), [days, setDays] = useState(90);

  // Signed out: sign in, then come back to this same request.
  useEffect(() => {
    if (!isPending && !signedIn) window.location.replace(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  }, [isPending, signedIn, query]);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController(), firstName = session?.user.name?.split(/\s+/)[0] || "My";
    fetch(`/api/oauth/authorize?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json().catch(() => null) as (Preview & { error?: { message?: string }; redirect?: string }) | null;
      if (response.ok && body) { setState({ status: "ready", preview: body }); setName(`${firstName}’s ${body.client.name}`.slice(0, 100)); return; }
      // The app sent a request Folio can't serve; it hears about it at its own, registered address.
      if (body?.redirect) { window.location.replace(body.redirect); return; }
      setState({ status: "problem", message: body?.error?.message ?? "Folio couldn’t read this request." });
    }).catch(() => { if (!controller.signal.aborted) setState({ status: "problem", message: "Folio couldn’t check this request. Try again." }); });
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = response.ok ? await response.json() as { organizations?: ConsentOrganization[] } : {};
      setOrganizations((body.organizations ?? []).map(org => ({ id: org.id, name: org.name })));
    }).catch(() => { if (!controller.signal.aborted) setOrganizations([]); });
    return () => controller.abort();
  }, [signedIn, query, session?.user.name]);

  async function approve(choice: ConsentChoice) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/oauth/authorize", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, scopes: choice.scopes, organizations: choice.organizations, name: name.trim(), expiresInDays: days }) });
      const body = await response.json().catch(() => null) as { location?: string; client?: string; redirect?: string; error?: { message?: string } } | null;
      if (response.ok && body?.location) { setState({ status: "sent", client: body.client ?? "the app", location: body.location }); window.location.assign(body.location); return; }
      if (body?.redirect) { window.location.assign(body.redirect); return; }
      setError(body?.error?.message ?? "Folio couldn’t approve this connection.");
    } catch { setError("Folio couldn’t approve this connection. Try again."); }
    setBusy(false);
  }
  const switchAccount = async () => {
    await authClient.signOut().catch(() => undefined);
    window.location.assign(`/login?next=${encodeURIComponent(`/oauth/authorize?${query}`)}`);
  };

  if (state.status === "problem") return <div className="cc-card" role="alert">
    <header className="cc-head"><span className="cc-tile" aria-hidden="true"><TriangleAlert size={20} /></span>
      <p className="cc-title">This app can’t connect</p><p className="cc-sub">{state.message}</p></header>
    <p className="cc-footer">Start connecting again from the app. You can also <a href="/agents#connect">connect your agent with a key</a>.</p>
  </div>;
  if (state.status === "sent") return <ConsentDone icon={<Globe size={20} />} connected title={`${state.client} is approved`}>
    <p className="cc-sub cc-center">Taking you back to {state.client} to finish connecting.</p>
    <a className="button primary cc-wide" href={state.location}>Go back to {state.client}<ArrowRight size={15} aria-hidden="true" /></a>
    <p className="cc-footer">Change the access or disconnect any time in <a href="/agents#connect">Connect your agent</a>.</p>
  </ConsentDone>;
  if (state.status === "loading" || !signedIn) return <div className="cc-card cc-waiting" role="status"><FolioTile /><p className="cc-note"><Loader2 size={14} className="spin" aria-hidden="true" />Checking the request…</p></div>;

  const { preview } = state;
  return <ConnectConsent client={{ label: preview.client.name, icon: <Globe size={20} /> }} account={{ name: session?.user.name || session?.user.email || "you" }}
    onSwitchAccount={() => void switchAccount()} organizations={organizations} busy={busy} error={error} onApprove={choice => void approve(choice)}
    onCancel={() => window.location.assign(preview.cancel)} requested={preview.requested.filter((scope): scope is AgentApiScope => (["read", "changes", "evaluate", "seo"] as string[]).includes(scope))}
    details={<>
      <section className="cc-section" aria-labelledby="cc-returns">
        <div className="cc-section-head"><h4 id="cc-returns">Returns to</h4>
          {preview.client.kind === "metadata"
            ? <span className="cc-badge is-verified"><ShieldCheck size={13} aria-hidden="true" />Identified by {preview.client.host}</span>
            : <span className="cc-badge"><ShieldAlert size={13} aria-hidden="true" />Registered itself</span>}</div>
        <p className="cc-redirect"><b>{preview.redirect.label}</b><code>{preview.redirect.uri}</code></p>
        <p className="cc-note">{preview.client.kind === "metadata" ? `Folio checked that ${preview.client.host} lists this return address.`
          : "The app named itself; Folio can’t confirm who made it. Approve only if you just started connecting it."}
          {preview.redirect.local ? " It returns to a program on this computer." : ""}</p>
      </section>
      <div className="cc-details">
        <label><span className="cc-label">Connection name</span><input value={name} maxLength={100} required onChange={event => setName(event.target.value)} /></label>
        <label><span className="cc-label">Lasts</span><UiSelect aria-label="Lasts" value={days} onChange={event => setDays(Number(event.target.value))}>
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></UiSelect></label>
      </div>
    </>}
    footer={<>Change the access or disconnect any time in <a href="/agents#connect">Connect your agent</a>.</>} />;
}
