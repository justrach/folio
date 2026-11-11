"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppWindow, Bot, Check, CircleCheck, Cloud, Code2, Copy, Download, ExternalLink, Eye, EyeOff, Info, KeyRound, Loader2, MessageSquareText, Monitor, MousePointer2, Plug, PlugZap, ShieldCheck, SquareTerminal, Terminal, Wrench,
  type FolioIcon } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import type { AgentApiKeySummary } from "@/lib/agent-observation-types";
import { AGENT_PERMISSIONS, CONNECTION_TROUBLESHOOTING, KEY_IN_COPY, KEY_PLACEHOLDER, agentClients, connectionAbilities, connectionTestCommand, exportLine, installAction, isFormField, maskedKey, onboardingProgress,
  orderPrompts, promptReadiness, publicIndexEndpoint, reachableOrigin, starterPrompts, withKey, type AgentClientId, type InstallAction, type SetupBlock, type StarterPromptId } from "@/lib/agent-onboarding";
import { UiSelect } from "./ui/select";
import { ConnectConsent, ConsentDone, type ConsentChoice, type ConsentOrganization } from "./connect-consent";
import "./agent-onboarding.css";

/** Plain icons for each client, not their logos. */
const CLIENT_ICONS: Record<AgentClientId, FolioIcon> = { "claude-code": SquareTerminal, codex: Terminal, harness: AppWindow, cursor: MousePointer2, vscode: Code2, "claude-desktop": Monitor, manus: Cloud, other: Plug };

const WATCH_MS = 15 * 60_000, POLL_MS = 4_000;
const active = (key: AgentApiKeySummary, now: number) => !key.revokedAt && Date.parse(key.expiresAt) > now;
function used(iso: string | null, now: number) {
  if (!iso) return "not used yet";
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  return seconds < 60 ? "used just now" : seconds < 3600 ? `used ${Math.round(seconds / 60)} min ago` : seconds < 86_400 ? `used ${Math.round(seconds / 3600)} h ago` : `used ${Math.round(seconds / 86_400)} d ago`;
}

export function CopyButton({ text, label = "Copy", className = "", primary = false }: { text: string; label?: string; className?: string; primary?: boolean }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className={`button ${primary ? "primary" : "secondary"} ao-copy ${className}`} onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* The text stays selectable. */ }
  }}>{copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? "Copied" : label}</button>;
}
/** Said beside a copy control whose text holds the key: where it is safe to paste. */
export function KeyNote({ children }: { children: ReactNode }) {
  return <p className="ao-key-note"><KeyRound size={14} aria-hidden="true" /><span>{children}</span></p>;
}
/** One label per kind of thing copied, everywhere on the panel. */
const copyLabel = (block: SetupBlock) => block.file || block.language === "json" || block.language === "toml" ? "Copy file" : block.language === "shell" ? "Copy command" : "Copy value";
/** A file or command. If it needs the key and one was just created, copying fills it in; the screen keeps the placeholder. */
function Code({ block, token = null }: { block: SetupBlock; token?: string | null }) {
  const keyed = block.code.includes(KEY_PLACEHOLDER);
  return <figure className="ao-code">
    <figcaption><span>{block.label}{block.file && <code>{block.file}</code>}</span>
      <CopyButton text={keyed && token ? withKey(block.code, token) : block.code} label={copyLabel(block)} /></figcaption>
    <pre data-language={block.language}>{block.code}</pre>
    {keyed && (token ? <KeyNote>{block.language === "shell" ? KEY_IN_COPY.command : KEY_IN_COPY.file}</KeyNote> : <p className="ao-expect">Replace {KEY_PLACEHOLDER} with your key.</p>)}
  </figure>;
}
/** Values typed into a client’s form, one per row, each with its own copy button. */
function Fields({ blocks, token }: { blocks: SetupBlock[]; token: string | null }) {
  return <dl className="ao-fields">{blocks.map(block => {
    const keyOnly = block.code === KEY_PLACEHOLDER, keyed = block.code.includes(KEY_PLACEHOLDER);
    return <div key={block.label}>
      <dt>{block.label}</dt>
      <dd><code>{keyOnly && token ? maskedKey(token) : block.code}</code>
        {keyed && token ? <CopyButton text={withKey(block.code, token)} label={keyOnly ? "Copy key" : "Copy value"} />
          : keyOnly ? <span className="ao-field-hint">Paste the key from step 2</span> : <CopyButton text={block.code} label="Copy value" />}</dd>
      {keyed && token && <dd className="ao-field-note"><KeyNote>{KEY_IN_COPY.key}</KeyNote></dd>}
    </div>;
  })}</dl>;
}

/** Opens an install link from a button, so a link that carries the key never shows in the browser’s status bar. */
function openLink(href: string) {
  const link = document.createElement("a");
  link.href = href; link.click();
}
/** The one-step way to add Folio: a button that opens the app, a file to open, or one command with the new key in it (masked on screen). */
function Install({ action, token }: { action: InstallAction; token: string | null }) {
  const ready = Boolean(action.kind === "command" ? action.code : action.href);
  const shown = action.code && token ? action.code.split(token).join(maskedKey(token)) : action.code;
  return <div className="ao-install">
    {action.kind === "command" ? ready
      ? <figure className="ao-code"><figcaption><span>{action.needsKey ? "One command, with your new key" : "One command, no key in it"}</span><CopyButton text={action.code!} label={action.label} primary /></figcaption>
        <pre data-language="shell">{shown}</pre></figure>
      : <button type="button" className="button primary" disabled><Copy size={15} aria-hidden="true" />{action.label}</button>
    : action.kind === "download" ? <a className="button primary" href={action.href!} download><Download size={15} aria-hidden="true" />{action.label}</a>
    : action.needsKey ? <button type="button" className="button primary" disabled={!ready} onClick={() => action.href && openLink(action.href)}><ExternalLink size={15} aria-hidden="true" />{action.label}</button>
    : <a className="button primary" href={action.href!}><ExternalLink size={15} aria-hidden="true" />{action.label}</a>}
    <p className="ao-install-hint">{action.hint}</p>
    {action.needsKey && ready && <KeyNote>{action.kind === "link" ? KEY_IN_COPY.link : KEY_IN_COPY.command}</KeyNote>}
  </div>;
}

/**
 * The signed-in person's keys, with a light poll while a new key waits for its first call. Reads only. The panel is
 * remounted for each account, and every read in flight is aborted when it unmounts, so a late reply for the previous
 * account is never shown.
 */
function useAgentKeys(signedIn: boolean) {
  const [keys, setKeys] = useState<AgentApiKeySummary[] | null>(null);
  const [error, setError] = useState("");
  const inFlight = useRef(new Set<AbortController>());
  useEffect(() => { const reads = inFlight.current; return () => { for (const read of reads) read.abort(); reads.clear(); }; }, []);
  const reload = useCallback(async () => {
    const controller = new AbortController();
    inFlight.current.add(controller);
    try {
      const response = await fetch("/api/agent-keys", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error();
      const body = await response.json() as { keys: AgentApiKeySummary[] };
      if (!controller.signal.aborted) { setKeys(body.keys); setError(""); }
    } catch { if (!controller.signal.aborted) setError("Your keys couldn’t be loaded."); }
    finally { inFlight.current.delete(controller); }
  }, []);
  useEffect(() => { if (signedIn) void reload(); }, [signedIn, reload]);
  return { keys, setKeys, error, reload };
}

/**
 * A website the prompts can be about. `organization`: someone else shares it with the person through that organization,
 * so the agent finds it with folio_organizations. `label`: how the picker names it (the domain by default).
 */
export type PromptWebsite = { id: string; domain: string; organization?: string | null; label?: string };
type Props = { websites?: PromptWebsite[]; organization?: string | null; onKeysChanged?: () => void; collapseWhenConnected?: boolean };

/**
 * Step-by-step agent setup. Creating a key is the only write; nothing here spends credits. Everything in it belongs to the
 * signed-in account (keys, a new key's token, the chosen website, prompt marks), so another account, or signing out,
 * starts a fresh panel.
 */
export function AgentOnboarding(props: Props) {
  const { data: session } = authClient.useSession();
  return <OnboardingPanel key={session?.user.id ?? "signed-out"} {...props} />;
}

function OnboardingPanel({ websites = [], organization = null, onKeysChanged, collapseWhenConnected = false }: Props) {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user.id);
  const [origin, setOrigin] = useState("https://usefolio.site");
  useEffect(() => setOrigin(window.location.origin), []);
  const clients = useMemo(() => agentClients(origin), [origin]);
  const [clientId, setClientId] = useState<AgentClientId>("claude-code");
  const client = clients.find(item => item.id === clientId) ?? clients[0];
  const { keys, setKeys, error: keysError, reload } = useAgentKeys(signedIn);
  // The person's organizations, for the consent card's picker. Joining by email is claimed here too, as on /orgs.
  const [organizations, setOrganizations] = useState<ConsentOrganization[] | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/organizations", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = response.ok ? await response.json() as { organizations?: ConsentOrganization[] } : {};
      if (!controller.signal.aborted) setOrganizations((body.organizations ?? []).map(org => ({ id: org.id, name: org.name })));
    }).catch(() => { if (!controller.signal.aborted) setOrganizations([]); });
    return () => controller.abort();
  }, [signedIn]);
  const switchAccount = async () => {
    await authClient.signOut().catch(() => undefined);
    window.location.assign(`/login?next=${encodeURIComponent(organization ? "/orgs" : "/agents")}`);
  };
  const [now, setNow] = useState(() => Date.now());
  const [watch, setWatch] = useState<{ id: string; token: string; since: number } | null>(null);
  const watched = watch ? keys?.find(key => key.id === watch.id) ?? null : null;
  const waiting = Boolean(watch && watched && !watched.lastUsedAt && now - watch.since < WATCH_MS);
  const announced = useRef<string | null>(null);

  // Poll only while a new key waits for its first call and the tab is visible.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { setNow(Date.now()); if (document.visibilityState === "visible") void reload(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, reload]);
  useEffect(() => {
    if (watched?.lastUsedAt && announced.current !== watched.id) { announced.current = watched.id; onKeysChanged?.(); }
  }, [watched, onKeysChanged]);
  // Coming back to this tab (after approving an app in the browser, or setting one up in a terminal) shows its connection.
  useEffect(() => {
    if (!signedIn) return;
    const back = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void reload(); } };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [signedIn, reload]);

  const live = (keys ?? []).filter(key => active(key, now));
  const connected = live.filter(key => key.lastUsedAt).sort((a, b) => Date.parse(b.lastUsedAt!) - Date.parse(a.lastUsedAt!));
  const leadNow = collapseWhenConnected && connected.length > 0 && !watch;
  const [leadLatched, setLeadLatched] = useState(false);
  useEffect(() => { if (leadNow) setLeadLatched(true); }, [leadNow]);
  const leadWithStatus = leadNow || (leadLatched && connected.length > 0);
  const firstName = session?.user.name?.split(/\s+/)[0] ?? "My";
  // The key made on this page, for the copy buttons in step 3. It lives only in this tab’s memory.
  const fresh = watch && watched && !watched.revokedAt ? watch.token : null;
  const progress = onboardingProgress({ signedIn, activeKeys: live.length, usedKeys: connected.length, newKey: watch && watched ? { used: Boolean(watched.lastUsedAt) } : null, signsIn: client.signsIn });
  const done = (n: number) => (n === 2 && progress.keyReady) || ((n === 3 || n === 4) && progress.connected);
  const step = (n: number) => ({ className: `ao-step ${n === progress.current ? "is-current" : done(n) ? "is-done" : n > progress.current ? "is-later" : ""}`,
    "aria-current": n === progress.current ? "step" as const : undefined });
  const number = (n: number) => <span className={`ao-number ${done(n) ? "is-done" : ""}`}>{done(n) ? <Check size={14} aria-label="Done" /> : n}</span>;
  const fields = client.blocks.filter(isFormField), files = client.blocks.filter(block => !isFormField(block));
  const action = installAction(client.id, origin, fresh);
  const keyForm = <KeyForm key={client.id} client={{ label: client.label, icon: (() => { const Icon = CLIENT_ICONS[client.id]; return <Icon size={20} />; })() }}
    account={{ name: session?.user.name || session?.user.email || "you" }} onSwitchAccount={() => void switchAccount()} organizations={organizations}
    firstName={firstName} organization={organization} readsShell={client.readsShellEnvironment} connected={Boolean(watched?.lastUsedAt)}
    next={action?.next ?? null} existing={live} now={now} error={keysError}
    onCreated={(key, token) => { setKeys(previous => [key, ...(previous ?? [])]); setWatch({ id: key.id, token, since: Date.now() }); setNow(Date.now()); onKeysChanged?.(); }} />;
  const manual = <>
    {fields.length > 0 && <Fields blocks={fields} token={fresh} />}
    {files.length > 0 && <div className="ao-blocks">{files.map(block => <Code key={block.label} block={block} token={fresh} />)}</div>}
  </>;

  // Kept here, not in the prompts section, so the choice and the marks survive the layout changing around them.
  const [picked, setPicked] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Record<string, Readiness>>({});
  // Leading the connected layout, no agent is picked yet, so the prompts don't name one, and the Claude Code slash command is
  // offered only as "in Claude Code" (other clients' equivalents aren't verified, so nothing is said about them).
  const prompts = <StarterPrompts websites={websites} signedIn={signedIn} userId={session?.user.id ?? null} clientLabel={leadWithStatus ? "your agent" : client.label}
    slashCommands={leadWithStatus ? "if-claude-code" : client.id === "claude-code" ? "claude-code" : null}
    picked={picked} onPick={setPicked} readiness={readiness} onReadiness={setReadiness} />;
  const body = (promptsAbove: boolean) => <>
    <ol className="ao-steps">
      <li className="ao-step"><span className="ao-number">1</span><div className="ao-step-body">
        <h3><Bot size={16} aria-hidden="true" />Pick your agent</h3>
        <div className="ao-clients" role="radiogroup" aria-label="Your agent">{clients.map(item =>
          <button key={item.id} type="button" role="radio" aria-checked={item.id === client.id} onClick={() => setClientId(item.id)}>
            <strong>{item.label}</strong><small>{item.kind}</small></button>)}</div>
      </div></li>

      <li {...step(2)}>{number(2)}<div className="ao-step-body">
        <h3><KeyRound size={16} aria-hidden="true" />Approve access for {client.label}</h3>
        {isPending ? <p role="status">Checking your sign-in…</p> : !signedIn
          ? <p>Each person approves their own agent with their own key. <Link href={`/login?next=${encodeURIComponent(organization ? "/orgs" : "/agents")}`}>Sign in to approve one</Link>.</p>
          : client.signsIn ? <div className="ao-signs-in">
            <p><ShieldCheck size={16} aria-hidden="true" /><span>{client.label} asks for your approval itself. When you run the command in step 3, Folio opens in your browser on this same card:
              choose what it may read, then Approve. Nothing to create here, and no key to copy.</span></p>
            {/* The form stays inside the fold, so a key made here keeps its "approved" card; the fold opens to show it. */}
            <details className="ao-manual" open={watch ? true : undefined}><summary>Use a key instead</summary>{keyForm}</details>
          </div>
          : keyForm}
      </div></li>

      <li {...step(3)}>{number(3)}<div className="ao-step-body">
        <h3><PlugZap size={16} aria-hidden="true" />Add Folio to {client.label}</h3>
        <p>{client.intro}</p>
        {action ? <><Install action={action} token={fresh} /><details className="ao-manual"><summary>Or set it up by hand</summary>{manual}</details></> : manual}
        {client.notes.length > 0 && <ul className="ao-notes">{client.notes.map(note => <li key={note}>{note}</li>)}</ul>}
        <p className="ao-aside">Just looking around? <code>{publicIndexEndpoint(client.id === "manus" ? reachableOrigin(origin) : origin)}</code> needs no key and reads Folio’s published AI answers only.</p>
      </div></li>

      <li {...step(4)}>{number(4)}<div className="ao-step-body">
        <h3><Terminal size={16} aria-hidden="true" />Check it’s connected</h3>
        <div className={`ao-check-grid ${promptsAbove ? "is-single" : ""}`}>
          <div>
            {client.check && <figure className="ao-code"><figcaption><span>{client.check.label} in {client.label}</span><CopyButton text={client.check.code} label={client.id === "manus" ? "Copy prompt" : /^[a-z][\w-]* /.test(client.check.code) ? "Copy command" : "Copy"} /></figcaption>
              <pre>{client.check.code}</pre><p className="ao-expect">You should see <b>{client.check.expect}</b></p></figure>}
            <details className="ao-curl"><summary>Or test the key from any terminal</summary>
              <p>Makes one free read (<code>folio_organizations</code>) with the key in <code>FOLIO_API_KEY</code>, so the key itself is never typed into the command. A reply listing your organizations means the key works; 401 means it doesn’t.</p>
              <Code block={{ label: "Test the key", language: "shell", code: connectionTestCommand(origin) }} /></details>
          </div>
          {/* Connected on /agents, the status already leads the panel. */}
          {!promptsAbove && <ConnectionStatus signedIn={signedIn} keys={keys} live={live} connected={connected} watched={watched} waiting={waiting} now={now} organization={organization} signsIn={client.signsIn}
            onRefresh={async () => { setNow(Date.now()); await reload(); }} />}
        </div>
      </div></li>

      {!promptsAbove && <li {...step(5)}>{number(5)}<div className="ao-step-body">{prompts}</div></li>}
    </ol>

    <div className="ao-reference">
      <details><summary><ShieldCheck size={15} aria-hidden="true" />What your agent can do with each permission</summary>
        <ul className="ao-permissions">{AGENT_PERMISSIONS.map(group => <li key={group.scope}>
          <div><strong>{group.label}</strong><span className={`ao-badge ${group.charges ? "is-paid" : "is-free"}`}>{group.charges ? "Can charge" : "No charges"}</span></div>
          <p>{group.summary}</p><span className="ao-tools">{group.tools.map(tool => <code key={tool} className={group.highlights.includes(tool) ? "is-key" : ""}>{tool}</code>)}</span>
        </li>)}</ul>
        <p className="ao-aside">The agent only sees the tools its key allows. Paid tools also need your account’s approval, and the agent must confirm the spend in the call.</p>
      </details>
      <details><summary><Wrench size={15} aria-hidden="true" />If it doesn’t connect</summary>
        <dl className="ao-trouble">{CONNECTION_TROUBLESHOOTING.map(item => <div key={item.problem}><dt>{item.problem}</dt><dd>{item.fix}</dd></div>)}</dl>
      </details>
    </div>
  </>;

  const intro = <p className="ao-intro">Each {organization ? `member of ${organization}` : "person"} connects their own agent, with their own key or sign-in.
    {organization ? ` It can read your websites and everything shared with ${organization}, and its reads of shared websites show up as team activity.` : " It reads your saved websites and Folio’s published answers."} It can’t spend unless its permissions allow it.</p>;
  // Once an agent is connected, /agents leads with what's connected and what to ask it; the setup folds away for the next agent.
  // The layout stays for this account once chosen, so approving another key inside the fold keeps its approved card.
  if (leadWithStatus) return <section className="panel agent-onboarding is-connected" id="connect" aria-labelledby="ao-title">
    <h2 id="ao-title"><Bot size={20} aria-hidden="true" />Your connected agents</h2>
    <ConnectionStatus signedIn={signedIn} keys={keys} live={live} connected={connected} watched={watched} waiting={waiting} now={now} organization={organization}
      onRefresh={async () => { setNow(Date.now()); await reload(); }} />
    {prompts}
    <details className="ao-setup" open={watch ? true : undefined}><summary><Bot size={18} aria-hidden="true" /><span><strong>Connect another agent</strong><small>{connected.length} of your agents {connected.length === 1 ? "has" : "have"} connected. Last: {connected[0].name}, {used(connected[0].lastUsedAt, now)}.</small></span></summary>
      {intro}{body(true)}
    </details>
  </section>;
  return <section className="panel agent-onboarding" id="connect" aria-labelledby="ao-title">
    <h2 id="ao-title"><Bot size={20} aria-hidden="true" />Connect your agent</h2>
    {intro}{body(false)}
  </section>;
}

/** Step 2: the consent card. Approving creates the key with the chosen permissions and organizations; then the card says what's next. */
function KeyForm({ client, account, onSwitchAccount, organizations, firstName, organization, readsShell, connected, next, existing, now, error, onCreated }: {
  client: { label: string; icon: ReactNode }; account: { name: string }; onSwitchAccount: () => void; organizations: ConsentOrganization[] | null;
  firstName: string; organization: string | null; readsShell: boolean; connected: boolean;
  next: string | null; existing: AgentApiKeySummary[]; now: number; error: string; onCreated: (key: AgentApiKeySummary, token: string) => void }) {
  const clientLabel = client.label;
  const [name, setName] = useState(`${firstName}’s ${clientLabel}`.slice(0, 100));
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null), [revealed, setRevealed] = useState(false);
  async function create(choice: ConsentChoice) {
    if (!name.trim()) { setFailure("Give the key a name, so you can tell your agents apart."); return; }
    setBusy(true); setFailure("");
    try {
      const response = await fetch("/api/agent-keys", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes: choice.scopes, expiresInDays: days, ...(choice.organizations ? { organizations: choice.organizations } : {}) }) });
      const payload = await response.json().catch(() => null) as { key?: AgentApiKeySummary; token?: string; error?: { message?: string } } | null;
      if (!response.ok || !payload?.key || !payload.token) throw new Error(payload?.error?.message ?? "The key couldn’t be created.");
      setCreated({ name: payload.key.name, token: payload.token }); setRevealed(false); onCreated(payload.key, payload.token);
    } catch (problem) { setFailure(problem instanceof Error ? problem.message : "The key couldn’t be created."); } finally { setBusy(false); }
  }
  if (created) {
    const line = exportLine(created.token);
    return <ConsentDone icon={client.icon} connected={connected} title={connected ? `${clientLabel} is connected` : `${created.name} is approved`}>
      {connected && <p className="ao-done-sub">It can now read your websites through Folio. Try one of the prompts.</p>}
      {/* Said for as long as the key is on screen, connected or not. */}
      <p className="ao-done-sub">The key is shown only now; copy it before you leave this page.</p>
      {next && !connected && <p className="ao-next">{next}</p>}
      <div className="ao-secret"><code aria-label="Your new key">{revealed ? line : `export FOLIO_API_KEY="${maskedKey(created.token)}"`}</code>
        <button type="button" className="button secondary ao-copy" onClick={() => setRevealed(value => !value)}>{revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}{revealed ? "Hide" : "Show"}</button>
        <CopyButton text={readsShell ? line : created.token} label={readsShell ? "Copy command" : "Copy key"} /></div>
      <KeyNote>{readsShell ? KEY_IN_COPY.command : KEY_IN_COPY.key}</KeyNote>
      <p className="ao-aside">{readsShell ? `${next ? "To set it up by hand instead, paste the export command" : "Paste it"} into the terminal you start ${clientLabel} from. To keep it for new terminals, add the same line to ~/.zshrc (or your shell’s profile).`
        : `${clientLabel} doesn’t read your terminal’s variables.${next ? "" : " In step 3, copies marked as containing your key put it in for you."}`}{organization ? ` Teammates in ${organization} see this agent’s name and when it was last used, never the key.` : ""}</p>
      <button type="button" className="text-link" onClick={() => setCreated(null)}>Approve another key</button>
    </ConsentDone>;
  }
  return <div className="ao-consent">
    {existing.length > 0 && <p className="ao-existing">You have {existing.length} active key{existing.length === 1 ? "" : "s"}: {existing.slice(0, 3).map(key => `${key.name} (${used(key.lastUsedAt, now)})`).join(", ")}{existing.length > 3 ? ", …" : ""}. If {existing.length === 1 ? "it’s" : "one is"} already set up in {clientLabel}, skip to step 4.</p>}
    <ConnectConsent client={client} account={account} onSwitchAccount={onSwitchAccount} organizations={organizations} busy={busy} error={failure || error} onApprove={choice => void create(choice)}
      details={<div className="cc-details">
        <label><span className="cc-label">Key name</span><input value={name} maxLength={100} required onChange={event => setName(event.target.value)} /></label>
        <label><span className="cc-label">Expires after</span><UiSelect aria-label="Expires after" value={days} onChange={event => setDays(Number(event.target.value))}>
          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></UiSelect></label>
      </div>}
      footer={<>Change the access or disconnect any time: <Link href="/docs/api#api-keys">manage or revoke keys</Link>.</>} />
  </div>;
}

function ConnectionStatus({ signedIn, keys, live, connected, watched, waiting, now, organization, onRefresh, signsIn = false }: { signedIn: boolean; keys: AgentApiKeySummary[] | null; live: AgentApiKeySummary[];
  connected: AgentApiKeySummary[]; watched: AgentApiKeySummary | null; waiting: boolean; now: number; organization: string | null; onRefresh: () => Promise<void>; signsIn?: boolean }) {
  const [busy, setBusy] = useState(false);
  let state: "signed-out" | "loading" | "waiting" | "connected" | "idle" | "none" = !signedIn ? "signed-out" : keys === null ? "loading"
    : watched?.lastUsedAt ? "connected" : waiting ? "waiting" : connected.length ? "connected" : live.length ? "idle" : "none";
  if (state === "connected" && !watched?.lastUsedAt && !connected.length) state = "idle";
  const shown = watched?.lastUsedAt ? [watched, ...connected.filter(key => key.id !== watched.id)].slice(0, 3) : connected.slice(0, 3);
  return <div className={`ao-status is-${state}`} aria-live="polite">
    <p className="ao-status-title">{state === "connected" ? <><CircleCheck size={17} aria-hidden="true" />Connected</>
      : state === "waiting" ? <><Loader2 size={17} className="spin" aria-hidden="true" />Waiting for {watched!.name}</> : "Connection status"}</p>
    {state === "signed-out" && <p>Sign in to see when your agents connect.</p>}
    {state === "loading" && <p role="status">Loading your keys…</p>}
    {state === "waiting" && <p>Run the check on the left. This updates by itself the moment {watched!.name} makes its first call.</p>}
    {state === "idle" && <p>None of your {live.length} active key{live.length === 1 ? " has" : "s have"} been used yet. Run the check on the left, then refresh.</p>}
    {state === "none" && <p>{signsIn ? "Nothing connected yet. Run the command in step 3 and approve Folio in your browser." : "No key yet. Create one in step 2."}</p>}
    {state === "connected" && <ul>{shown.map(key => <ConnectionRow key={key.id} connection={key} now={now} />)}</ul>}
    {state === "connected" && organization && <p className="ao-aside">{organization} sees these under Members and their agents.</p>}
    {signedIn && state !== "loading" && state !== "waiting" && <button type="button" className="text-link" disabled={busy} onClick={async () => { setBusy(true); await onRefresh(); setBusy(false); }}>Refresh</button>}
  </div>;
}

/** One connection in the status box: its name, last use, how it connected, what it may do and whether it can spend. */
function ConnectionRow({ connection, now }: { connection: AgentApiKeySummary; now: number }) {
  const abilities = connectionAbilities(connection.scopes);
  return <li>
    <span className="ao-conn-name"><span className={`ao-dot ${now - Date.parse(connection.lastUsedAt!) < 600_000 ? "is-live" : ""}`} aria-hidden="true" /><strong>{connection.name}</strong><small>{used(connection.lastUsedAt, now)}</small></span>
    <span className="ao-conn-meta">
      {connection.connection && <span>{connection.connection === "sign-in" ? "Signed in" : "Key"}</span>}
      <span>{abilities.access} · {abilities.toolCount} tools</span>
      <span className={abilities.paidActions.length ? "is-paid" : "is-free"}>{abilities.money}</span>
    </span>
  </li>;
}

type Readiness = Partial<Record<StarterPromptId, string>>;
/**
 * Step 5: the first prompts, about the website the person picks. When the prompts come into view, one free read of that
 * website's saved report (the Websites page's own, /api/sites/[id]/visibility; no provider call, nothing saved) marks
 * the prompts that would come back empty and moves the ones that will work first. If the read fails, nothing is marked.
 */
function StarterPrompts({ websites, signedIn, userId, clientLabel, slashCommands, picked, onPick, readiness, onReadiness }: { websites: PromptWebsite[]; signedIn: boolean;
  userId: string | null; clientLabel: string; slashCommands: "claude-code" | "if-claude-code" | null; picked: string | null; onPick: (id: string) => void;
  readiness: Record<string, Readiness>; onReadiness: (update: (previous: Record<string, Readiness>) => Record<string, Readiness>) => void }) {
  const website = websites.find(item => item.id === picked) ?? websites[0] ?? null;
  const websiteId = website?.id ?? null;
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  // Keyed by owner and website, so another account's marks never show.
  const readKey = userId && websiteId ? `${userId}:${websiteId}` : null;
  useEffect(() => {
    const element = ref.current;
    if (inView || !element || !signedIn) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setInView(true); observer.disconnect(); } }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, signedIn]);
  // Depends on the website's id, not the object, so a parent that rebuilds its list on every render doesn't restart the read.
  const known = readKey ? Boolean(readiness[readKey]) : false;
  useEffect(() => {
    if (!signedIn || !inView || !websiteId || !readKey || known) return;
    const controller = new AbortController();
    fetch(`/api/sites/${encodeURIComponent(websiteId)}/visibility`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = response.ok ? await response.json() as { report?: Parameters<typeof promptReadiness>[0] } : null;
      if (!controller.signal.aborted) onReadiness(previous => ({ ...previous, [readKey]: promptReadiness(body?.report) }));
    }).catch(() => { if (!controller.signal.aborted) onReadiness(previous => ({ ...previous, [readKey]: {} })); });
    return () => controller.abort();
  }, [signedIn, inView, websiteId, readKey, known, onReadiness]);
  const notes = (readKey && readiness[readKey]) || {};
  const prompts = orderPrompts(starterPrompts({ domain: website?.domain ?? null, organization: website?.organization ?? null }), notes);
  const site = website?.domain ?? "your website";
  return <div className="ao-prompts-block" ref={ref}>
    <h3><MessageSquareText size={16} aria-hidden="true" />Ask it something</h3>
    <div className="ao-prompts-lead">
      <p>Paste one of these into {clientLabel}. Each names {site}, has the agent use only Folio’s tools, and tells it to start nothing paid, so none of them spends credits.</p>
      {websites.length > 1 && <label className="ao-site-picker"><span>Website</span>
        <UiSelect aria-label="Website the prompts are about" value={website?.id ?? ""} onChange={event => onPick(event.target.value)}>
          {websites.map(item => <option key={item.id} value={item.id}>{item.label ?? item.domain}</option>)}</UiSelect></label>}
    </div>
    <div className="ao-prompts">{prompts.map(prompt => <article key={prompt.id} className={`ao-prompt ${notes[prompt.id] ? "is-empty" : ""}`}>
      <header><strong>{prompt.title}</strong>
        <span className="ao-badges">{prompt.scopes.map(scope => <span key={scope} className={`ao-badge is-${scope}`}>{AGENT_PERMISSIONS.find(item => item.scope === scope)?.label}</span>)}
          {prompt.needsRepository && <span className="ao-badge">In your site’s repository</span>}</span></header>
      {notes[prompt.id] && <p className="ao-prompt-empty"><Info size={14} aria-hidden="true" /><span>{notes[prompt.id]}</span></p>}
      <blockquote>{prompt.text}</blockquote>
      <footer><span className="ao-tools">{prompt.tools.map(tool => <code key={tool}>{tool}</code>)}</span><CopyButton text={prompt.text} label="Copy prompt" /></footer>
      {prompt.thirdParty && <p className="ao-prompt-note">{prompt.thirdParty}</p>}
      {prompt.slashCommand && slashCommands === "claude-code" && <p className="ao-slash">Or type <code>{prompt.slashCommand}</code> in Claude Code for the guided version.</p>}
      {prompt.slashCommand && slashCommands === "if-claude-code" && <p className="ao-slash">If your agent is Claude Code, you can type <code>{prompt.slashCommand}</code> instead for the guided version.</p>}
    </article>)}</div>
  </div>;
}

/** /agents: the same setup, aimed at the person's saved websites (the first one until they pick another). */
export function WorkspaceAgentOnboarding() {
  const { data: session } = authClient.useSession();
  const [websites, setWebsites] = useState<PromptWebsite[]>([]);
  useEffect(() => {
    setWebsites([]);
    if (!session?.user.id) return;
    const controller = new AbortController();
    fetch("/api/sites", { cache: "no-store", signal: controller.signal }).then(async response => {
      const sites = response.ok ? (await response.json() as { sites?: { id: string; url: string }[] }).sites ?? [] : [];
      setWebsites(sites.flatMap(site => { try { return [{ id: site.id, domain: new URL(site.url).hostname.replace(/^www\./, "") }]; } catch { return []; } }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [session?.user.id]);
  return <AgentOnboarding websites={websites} collapseWhenConnected />;
}
