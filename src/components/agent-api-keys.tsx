"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { AgentApiKeySummary } from "@/lib/agent-observation-types";

export function AgentApiKeys() {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <p role="status">Checking your workspace…</p>;
  if (!session?.user.id) return <div className="api-key-signin"><h3>Connect an agent to your workspace</h3><p>Sign in to create a key for your saved websites and search questions.</p><Link className="button primary" href="/login?next=%2Fdocs%2Fapi">Sign in to manage keys</Link></div>;
  return <OwnerApiKeys key={session.user.id} />;
}

function OwnerApiKeys() {
  const [keys, setKeys] = useState<AgentApiKeySummary[]>([]);
  const [name, setName] = useState("");
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [days, setDays] = useState(30);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("loading");
  const mounted = useRef(true);
  const requests = useRef(new Set<AbortController>());

  async function request<T>(path: string, init?: RequestInit): Promise<T | undefined> {
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const response = await fetch(path, { ...init, cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!mounted.current) return;
      if (!response.ok) throw new Error(body.error?.message ?? "The key request could not complete.");
      return body as T;
    } finally { requests.current.delete(controller); }
  }
  useEffect(() => {
    mounted.current = true;
    void request<{ keys: AgentApiKeySummary[] }>("/api/agent-keys").then(body => { if (body && mounted.current) setKeys(body.keys); })
      .catch(failure => { if (mounted.current) setError(failure instanceof Error ? failure.message : "Keys could not be loaded."); })
      .finally(() => { if (mounted.current) setBusy(""); });
    const pending = requests.current;
    return () => { mounted.current = false; pending.forEach(controller => controller.abort()); };
  }, []);

  async function create() {
    setBusy("create"); setError(""); setNotice(""); setToken(null);
    try {
      const body = await request<{ key: AgentApiKeySummary; token: string }>("/api/agent-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes: canEvaluate ? ["read", "evaluate"] : ["read"], expiresInDays: days }) });
      if (!body || !mounted.current) return;
      setKeys(current => [body.key, ...current]); setToken(body.token); setName(""); setCanEvaluate(false);
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Key creation could not be confirmed. Reload the key list before trying again."); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function revoke(key: AgentApiKeySummary) {
    setBusy(key.id); setError(""); setNotice("");
    try {
      const body = await request<{ key: AgentApiKeySummary }>(`/api/agent-keys/${encodeURIComponent(key.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!body || !mounted.current) return;
      setKeys(current => current.map(item => item.id === body.key.id ? body.key : item)); setToken(null); setNotice("Key revoked. Existing evaluation records are preserved.");
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "The key could not be revoked."); }
    finally { if (mounted.current) setBusy(""); }
  }
  return <div className="api-keys">
    <form onSubmit={event => { event.preventDefault(); void create(); }}>
      <div className="api-key-fields"><label>Key name<input value={name} maxLength={100} required onChange={event => setName(event.target.value)} placeholder="My research agent" disabled={Boolean(busy)} /></label><label>Expires after<select value={days} onChange={event => setDays(Number(event.target.value))} disabled={Boolean(busy)}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label></div>
      <label className="api-key-permission"><input type="checkbox" checked={canEvaluate} disabled={Boolean(busy)} onChange={event => setCanEvaluate(event.target.checked)} /><span>Allow this key to start evaluations<small>Can incur usage charges. Your account’s website access, run limits, and active-task limits still apply.</small></span></label>
      <button className="button primary" disabled={Boolean(busy) || !name.trim()}>{busy === "create" ? <Loader2 size={15} className="eval-spin" /> : <KeyRound size={15} />}Create API key</button><p className="api-small">Read access is always included. Keys expire and can be revoked here.</p>
    </form>
    {error && <p role="alert" className="api-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {token && <div className="api-new-token"><h3>Save this key now</h3><p>It is shown only once. Store it in your agent’s secret environment.</p><label className="sr-only" htmlFor="new-folio-key">New Folio API key</label><div><input id="new-folio-key" type="password" value={token} readOnly autoComplete="off" /><button className="button secondary" onClick={() => { void navigator.clipboard.writeText(token).then(() => { if (mounted.current) setNotice("API key copied."); }).catch(() => { if (mounted.current) setError("Clipboard unavailable. Select the key field to copy it."); }); }}><Copy size={14} />Copy key</button></div><button className="api-text-button" onClick={() => setToken(null)}>I saved it · hide key</button></div>}
    <div className="api-key-list"><h3>Your keys</h3>{busy === "loading" ? <p role="status">Loading keys…</p> : !keys.length ? <p>No keys yet.</p> : keys.map(key => {
      const expired = Date.parse(key.expiresAt) <= Date.now();
      return <article key={key.id}><div><strong>{key.name}</strong><code>{key.prefix}…</code><p>{key.scopes.includes("evaluate") ? "Read and evaluate" : "Read only"} · {key.revokedAt ? "Revoked" : expired ? "Expired" : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}</p></div>{!key.revokedAt && !expired && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void revoke(key)}>Revoke <span className="sr-only">{key.name}</span></button>}</article>;
    })}</div>
  </div>;
}
