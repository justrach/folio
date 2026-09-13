"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Code2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

/** Mount with an owner key so account status and errors cannot cross a session change. */
export function GithubConnection({ ownerId }: { ownerId: string | null }) {
  const [status, setStatus] = useState<{ configured: boolean; signedIn: boolean; connected: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    fetch("/api/github", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Status unavailable");
        const data = await response.json();
        if (![data?.configured, data?.signedIn, data?.connected].every(value => typeof value === "boolean")) throw new Error("Invalid status");
        if (!controller.signal.aborted) setStatus(data);
      })
      .catch(() => { if (!controller.signal.aborted) setError("GitHub connection status could not be loaded. Refresh to try again."); });
    return () => { active.current = false; controller.abort(); };
  }, [ownerId]);

  async function connect() {
    setBusy(true); setError("");
    try {
      const result = await authClient.linkSocial({ provider: "github", callbackURL: "/settings", errorCallbackURL: "/settings?connection=github-error" });
      if (active.current && result.error) setError("GitHub could not be linked. Use a GitHub account with the same verified email as your Folio account.");
    } catch { if (active.current) setError("GitHub could not be reached. Please try again."); }
    finally { if (active.current) setBusy(false); }
  }

  return <div className="connection-row" aria-label="GitHub account">
    <Code2 size={23} />
    <div>
      <h3>GitHub account</h3>
      <p>Use your GitHub account to sign in to Folio.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && !status && <p role="status">Checking connection…</p>}
      {status && !status.configured && <p>GitHub sign-in is not configured yet.</p>}
      {status?.connected && ownerId && <p role="status">Connected for sign-in</p>}
    </div>
    {status?.configured && !status.connected && (ownerId && status.signedIn
      ? <button className="button secondary" disabled={busy} onClick={connect}>{busy ? "Connecting…" : "Connect GitHub"}</button>
      : <Link href="/login" className="button secondary">Sign in</Link>)}
  </div>;
}
