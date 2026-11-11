"use client";

import { useState } from "react";
import { Loader2, Search } from "@/components/icons";
import type { XStanding } from "@/lib/x-standing";
import "./x-standing.css";

/** Beta panel: public standing for one X account. */
export function XStandingPanel() {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<XStanding | null>(null);
  const [error, setError] = useState("");

  async function lookup() {
    if (!handle.trim() || busy) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`/api/x-standing?handle=${encodeURIComponent(handle.trim())}`, { cache: "no-store" });
      const body = await response.json() as XStanding & { error?: string };
      if (!response.ok) { setError(body.error ?? "This lookup failed."); return; }
      setResult(body);
      if (body.error) setError(body.error);
    } catch {
      setError("This lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="x-standing" aria-labelledby="x-standing-title">
      <header>
        <h2 id="x-standing-title">X standing <span className="x-beta">Beta</span></h2>
        <p>Public follower and activity counts for an X account. Read live, never stored.</p>
      </header>
      <div className="x-standing-form">
        <label htmlFor="x-handle">X handle</label>
        <div>
          <span aria-hidden>@</span>
          <input
            id="x-handle"
            value={handle}
            placeholder="handle"
            autoComplete="off"
            spellCheck={false}
            onChange={event => setHandle(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") void lookup(); }}
          />
          <button type="button" onClick={() => void lookup()} disabled={busy || !handle.trim()}>
            {busy ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
            Look up
          </button>
        </div>
      </div>

      {error && <p className="x-standing-error" role="alert">{error}</p>}

      {result?.profile && (
        <div className="x-standing-card">
          <div className="x-standing-id">
            {result.profile.image && <img src={result.profile.image} alt="" width={36} height={36} />}
            <div>
              <strong>{result.profile.name} {result.profile.verified && <span title="Verified">✓</span>}</strong>
              <a href={result.profile.url} target="_blank" rel="noreferrer">@{result.profile.username}</a>
            </div>
          </div>
          <dl>
            <div><dt>Followers</dt><dd>{result.profile.followers.toLocaleString()}</dd></div>
            <div><dt>Following</dt><dd>{result.profile.following.toLocaleString()}</dd></div>
            <div><dt>Posts</dt><dd>{result.profile.tweets.toLocaleString()}</dd></div>
            <div><dt>Joined</dt><dd>{result.profile.createdAt ? new Date(result.profile.createdAt).toLocaleDateString() : "—"}</dd></div>
          </dl>
          {result.profile.description && <p className="x-standing-bio">{result.profile.description}</p>}
          <p className="x-standing-note">Public profile fields only. Beta: no posts, sentiment, or scoring yet.</p>
        </div>
      )}

      {result && !result.configured && (
        <p className="x-standing-empty">
          Beta is dark: no <code>X_BEARER_TOKEN</code> is configured for this deployment, so no lookup is possible.
          Add the token as a Worker secret to switch it on.
        </p>
      )}
    </section>
  );
}
