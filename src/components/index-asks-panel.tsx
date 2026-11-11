"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import type { IndexAsk } from "@/lib/index-asks";
import "./index-asks-panel.css";

type Snapshot = { ownerId: string | null; asks: IndexAsk[]; more: boolean; loading: boolean; error: boolean };
const KINDS: Record<IndexAsk["tool"], string> = { search: "Searched the index", answer: "Read an answer", website: "Looked up a website" };
const when = (value: string) => Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unknown time";

function readAsks(value: unknown): { asks: IndexAsk[]; more: boolean } {
  const payload = value !== null && typeof value === "object" ? value as { items?: unknown; truncated?: unknown } : null;
  if (!Array.isArray(payload?.items) || payload.items.length > 50 || payload.items.some(item => !item || typeof item !== "object"
    || typeof (item as IndexAsk).id !== "string" || typeof (item as IndexAsk).summary !== "string" || !Object.hasOwn(KINDS, (item as IndexAsk).tool)))
    throw new Error("Invalid index activity");
  return { asks: payload.items as IndexAsk[], more: payload.truncated === true };
}

/** Owner-scoped saved activity. Reading it asks the index nothing and starts no work. */
export function IndexAsksPanel() {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const currentOwner = useRef(ownerId); currentOwner.current = ownerId;
  const [snapshot, setSnapshot] = useState<Snapshot>({ ownerId: null, asks: [], more: false, loading: true, error: false });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setSnapshot({ ownerId, asks: [], more: false, loading: true, error: false });
    if (isPending || !ownerId) return;
    const controller = new AbortController();
    let disposed = false;
    const live = () => !disposed && !controller.signal.aborted && currentOwner.current === ownerId;
    queueMicrotask(async () => {
      if (!live()) return;
      try {
        const response = await fetch("/api/index-asks", { method: "GET", cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Index activity unavailable");
        const loaded = readAsks(await response.json());
        if (live()) setSnapshot({ ownerId, ...loaded, loading: false, error: false });
      } catch {
        if (live()) setSnapshot({ ownerId, asks: [], more: false, loading: false, error: true });
      }
    });
    return () => { disposed = true; controller.abort(); };
  }, [ownerId, isPending, refresh]);

  if (isPending || !ownerId) return null;
  const owned = snapshot.ownerId === ownerId;
  const asks = owned ? snapshot.asks : [];
  const loading = !owned || snapshot.loading;
  const error = owned && snapshot.error;
  return <section className="panel index-asks" aria-label="What your agents asked the index" aria-busy={loading}>
    <header><div><h2>What your agents asked</h2><p>Questions your connected agents put to the published Folio Index, and what came back.</p></div>
      <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh index activity"><RefreshCw size={13} /> Refresh</button>
    </header>
    {loading && <p role="status" className="index-asks-message">Loading index activity…</p>}
    {error && <p role="alert" className="index-asks-message">Index activity could not be loaded. Try again.</p>}
    {!loading && !error && !asks.length && <div className="index-asks-empty">
      <p>Nothing yet. When an agent connected with one of your keys searches the index or looks up a website, it appears here. Agents using the no-key endpoint are not recorded.</p>
      <Link className="button secondary" href="/docs/api#api-mcp">Connect your agent <ArrowUpRight size={13} /></Link>
    </div>}
    {asks.length > 0 && <ol className="index-asks-list" aria-label="Recent index questions">{asks.map(ask => <li key={ask.id}>
      <p className="index-ask-summary">{ask.summary}</p>
      <div className="index-ask-meta"><span>{KINDS[ask.tool]}</span>{ask.keyName ? <span>Key “{ask.keyName}”</span> : null}<time dateTime={ask.createdAt}>{when(ask.createdAt)}</time>
        {ask.queryId ? <Link href={`/overview?query=${encodeURIComponent(ask.queryId)}`}>Open this answer <ArrowUpRight size={12} aria-hidden="true" /></Link> : null}</div>
    </li>)}</ol>}
    <footer><span>{snapshot.more && owned ? "Showing the 20 most recent. " : ""}Counts describe published answers at the time of the ask. They are saved observations, not search rankings.</span><Link href="/leaderboard">Open the Folio Index <ArrowUpRight size={13} /></Link></footer>
  </section>;
}
