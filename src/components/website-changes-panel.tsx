"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Loader2, RefreshCw } from "@/components/icons";
import { useSession } from "@/lib/auth-client";
import { CHANGE_MOVEMENT_LABELS, CHANGE_STATE_LABELS, changeAnswerLabel, type ChangeQuestion, type WebsiteChange } from "@/lib/website-change-outcome";
import "./website-changes-panel.css";

type Snapshot = { ownerId: string | null; changes: WebsiteChange[]; more: boolean; loading: boolean; error: boolean };
const day = (value?: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "an unknown date";
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function readChanges(value: unknown): { changes: WebsiteChange[]; more: boolean } {
  const payload = value !== null && typeof value === "object" ? value as { items?: unknown; truncated?: unknown } : null;
  if (!Array.isArray(payload?.items) || payload.items.length > 25 || payload.items.some(item => !item || typeof item !== "object"
    || typeof (item as WebsiteChange).id !== "string" || !Array.isArray((item as WebsiteChange).questions) || !(item as WebsiteChange).outcome))
    throw new Error("Invalid recorded changes");
  return { changes: payload.items as WebsiteChange[], more: payload.truncated === true };
}
function statusText(change: WebsiteChange) {
  if (change.status === "withdrawn") return "Withdrawn";
  if (change.status === "proposed") return "Not live yet";
  return `Live since ${day(change.publication?.at)}`;
}
function ownerStep(change: WebsiteChange) {
  const { outcome } = change;
  if (change.status === "withdrawn") return "This change was withdrawn. No new answers are expected.";
  if (change.status === "proposed") return "Publish this change on your website, then confirm it here. Folio does not deploy or check your website.";
  if (outcome.awaitingRetest) return `${plural(outcome.awaitingRetest, "question")} still ${outcome.awaitingRetest === 1 ? "needs" : "need"} a new answer. Run ${outcome.awaitingRetest === 1 ? "it" : "them"} again to see what AI answers say now.`;
  if (outcome.retested) return `${outcome.retested} of ${plural(outcome.targeted, "question")} answered again: ${outcome.improved} improved, ${outcome.declined} declined, ${outcome.unchanged} unchanged${outcome.unknown ? `, ${outcome.unknown} could not be compared` : ""}.`;
  return "These questions cannot be compared. Each one says why.";
}
function result(question: ChangeQuestion) {
  return question.movement ? CHANGE_MOVEMENT_LABELS[question.movement] : CHANGE_STATE_LABELS[question.state];
}

/** Owner-scoped saved records. Confirming publication saves the owner's statement; nothing here starts an evaluation. */
export function WebsiteChangesPanel() {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const currentOwner = useRef(ownerId); currentOwner.current = ownerId;
  const [snapshot, setSnapshot] = useState<Snapshot>({ ownerId: null, changes: [], more: false, loading: true, error: false });
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  useEffect(() => {
    setSnapshot({ ownerId, changes: [], more: false, loading: true, error: false });
    setNotice(null); setBusy(null);
    if (isPending || !ownerId) return;
    const controller = new AbortController();
    let disposed = false;
    const live = () => !disposed && !controller.signal.aborted && currentOwner.current === ownerId;
    queueMicrotask(async () => {
      if (!live()) return;
      try {
        const response = await fetch("/api/changes", { method: "GET", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Recorded changes unavailable");
        const loaded = readChanges(await response.json());
        if (live()) setSnapshot({ ownerId, ...loaded, loading: false, error: false });
      } catch {
        if (live()) setSnapshot({ ownerId, changes: [], more: false, loading: false, error: true });
      }
    });
    return () => { disposed = true; controller.abort(); };
  }, [ownerId, isPending, refresh]);

  async function update(change: WebsiteChange, status: "published" | "withdrawn") {
    const owner = ownerId;
    setBusy(change.id); setNotice(null);
    try {
      const response = await fetch(`/api/changes/${encodeURIComponent(change.id)}`, { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const body = await response.json().catch(() => null) as { change?: WebsiteChange } | null;
      if (currentOwner.current !== owner) return;
      if (!response.ok || !body?.change) throw new Error("Update failed");
      const saved = body.change;
      setSnapshot(previous => previous.ownerId === owner ? { ...previous, changes: previous.changes.map(item => item.id === saved.id ? saved : item) } : previous);
      setNotice({ kind: "status", text: status === "published" ? "Marked as live. Run its questions again to see what AI answers say now." : "Change withdrawn." });
    } catch {
      if (currentOwner.current === owner) setNotice({ kind: "alert", text: "The change could not be updated. Refresh to see its saved state before trying again." });
    } finally { if (currentOwner.current === owner) setBusy(null); }
  }

  if (isPending || !ownerId) return null;
  const owned = snapshot.ownerId === ownerId;
  const changes = owned ? snapshot.changes : [];
  const loading = !owned || snapshot.loading;
  const error = owned && snapshot.error;
  return <section className="panel website-changes" aria-label="Website changes from your agent" aria-busy={loading}>
    <header><div><h2>Changes from your agent</h2><p>What your coding agent changed on your website, and what AI answers said before and after.</p></div>
      <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh recorded changes"><RefreshCw size={13} /> Refresh</button>
    </header>
    {loading && <p role="status" className="website-changes-message">Loading recorded changes…</p>}
    {error && <p role="alert" className="website-changes-message">Recorded changes could not be loaded. Try again.</p>}
    {notice && <p role={notice.kind} className="website-changes-message">{notice.text}</p>}
    {!loading && !error && !changes.length && <div className="website-changes-empty">
      <p>No changes recorded yet. Connect your coding agent to Folio and ask it to improve how AI answers describe your website. It reads your saved answers, proposes edits in your repository, and records what it changed here.</p>
      <Link className="button secondary" href="/docs/api#api-mcp">Connect your agent <ArrowUpRight size={13} /></Link>
    </div>}
    {changes.length > 0 && <ol className="website-changes-list" aria-label="Recorded changes">{changes.map(change => <li key={change.id}>
      <article aria-label={change.title}>
        <div className="website-change-heading"><h3>{change.title}</h3><span className="website-change-status" data-status={change.status}>{statusText(change)}</span></div>
        <p className="website-change-meta">{change.website.name} · recorded {day(change.createdAt)}{change.recordedBy.keyName ? ` with the key “${change.recordedBy.keyName}”` : ""}
          {change.publication ? ` · publication reported by ${change.publication.reportedBy === "owner" ? "you" : "your agent"}` : ""}</p>
        <p className="website-change-summary">{change.summary}</p>
        {(change.files.length > 0 || change.referenceUrl) && <details className="website-change-files"><summary>{change.files.length ? plural(change.files.length, "file") + " changed" : "Reference"}</summary>
          {change.files.length > 0 && <ul>{change.files.map(file => <li key={file}><code>{file}</code></li>)}</ul>}
          {change.referenceUrl && <p><a href={change.referenceUrl} target="_blank" rel="noreferrer noopener">{change.referenceUrl}</a></p>}
        </details>}
        <ul className="website-change-questions" aria-label="Questions this change targets">{change.questions.map(question => <li key={question.caseId}>
          <p className="website-change-query">{question.query}</p>
          <dl>
            <div><dt>Before</dt><dd>{changeAnswerLabel(question.baseline)}{question.baseline ? <small>{day(question.baseline.observedAt)}</small> : null}</dd></div>
            <div><dt>After</dt><dd>{question.retest ? changeAnswerLabel(question.retest) : "No new answer yet"}{question.retest ? <small>{day(question.retest.observedAt)}</small> : null}</dd></div>
            <div><dt>Result</dt><dd><strong>{result(question)}</strong>{question.reasons.map(reason => <small key={reason}>{reason}</small>)}</dd></div>
          </dl>
        </li>)}</ul>
        <p className="website-change-next">{ownerStep(change)}</p>
        <div className="website-change-actions">
          {change.status === "proposed" && <button type="button" className="button primary" disabled={busy !== null} onClick={() => void update(change, "published")}>
            {busy === change.id ? <Loader2 size={14} className="eval-spin" /> : <Check size={14} />}Confirm it’s live<span className="sr-only">: {change.title}</span></button>}
          {change.status === "published" && change.outcome.awaitingRetest > 0 && <Link className="button secondary" href={`/benchmarks?website=${encodeURIComponent(change.website.id)}`}>Open its questions <ArrowUpRight size={13} /></Link>}
          {change.status !== "withdrawn" && <button type="button" className="button secondary" disabled={busy !== null} onClick={() => void update(change, "withdrawn")}>Withdraw<span className="sr-only">: {change.title}</span></button>}
        </div>
      </article>
    </li>)}</ol>}
    <footer><span>{snapshot.more && owned ? "Showing the ten most recent changes. " : ""}Before and after are saved answers to the same question. They show what was recorded, not proof that a change caused a difference. Viewing this panel starts no new work.</span></footer>
  </section>;
}
