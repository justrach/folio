"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { isKeywordBenchmarkId, KEYWORD_BENCHMARK_QUERY_MAX_LENGTH, type KeywordBenchmarkStatus } from "@/lib/keyword-benchmark-types";
import "./keyword-activity-summary.css";

type Activity = { id: string; suiteId: string; query: string; createdAt: string; updatedAt: string; status: KeywordBenchmarkStatus; kind: "baseline" | "fresh" };
type Snapshot = { ownerId: string | null; runs: Activity[]; loading: boolean; error: boolean };
const labels: Record<KeywordBenchmarkStatus, string> = {
  queued: "Queued", running: "Running", requires_action: "Needs attention", completed: "Completed", failed: "Failed", cancelled: "Cancelled",
};
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function readRuns(value: unknown): Activity[] {
  const payload = record(value);
  if (!Array.isArray(payload?.runs) || payload.runs.length > 100) throw new Error("Invalid saved activity");
  return payload.runs.map(value => {
    const run = record(value), input = record(run?.case);
    if (!run || !isKeywordBenchmarkId(run.id) || !isKeywordBenchmarkId(run.suiteId) || run.publication !== "private" ||
      typeof run.status !== "string" || !Object.hasOwn(labels, run.status) || !["baseline", "fresh"].includes(String(run.kind)) ||
      typeof input?.query !== "string" || !input.query.trim() || input.query.length > KEYWORD_BENCHMARK_QUERY_MAX_LENGTH ||
      typeof run.createdAt !== "string" || !Number.isFinite(Date.parse(run.createdAt)) ||
      typeof run.updatedAt !== "string" || !Number.isFinite(Date.parse(run.updatedAt))) throw new Error("Invalid saved activity");
    return { id: run.id, suiteId: run.suiteId, query: input.query, createdAt: run.createdAt, updatedAt: run.updatedAt,
      status: run.status as KeywordBenchmarkStatus, kind: run.kind as Activity["kind"] };
  }).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

/** Owner-scoped saved state only. This component never reconciles or starts remote work. */
export function KeywordActivitySummary() {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const currentOwner = useRef(ownerId); currentOwner.current = ownerId;
  const [snapshot, setSnapshot] = useState<Snapshot>({ ownerId: null, runs: [], loading: true, error: false });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    setSnapshot({ ownerId, runs: [], loading: true, error: false });
    if (isPending || !ownerId) return;
    const controller = new AbortController();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const live = () => !disposed && !controller.signal.aborted && currentOwner.current === ownerId;
    async function load() {
      try {
        const response = await fetch("/api/benchmarks/runs", { method: "GET", cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Saved activity unavailable");
        const runs = readRuns(await response.json());
        if (!live()) return;
        setSnapshot({ ownerId, runs: runs.slice(0, 3), loading: false, error: false });
        if (runs.some(run => run.status === "queued" || run.status === "running")) timer = setTimeout(() => { void load(); }, 10_000);
      } catch {
        if (live()) setSnapshot(previous => ({ ownerId, runs: previous.ownerId === ownerId ? previous.runs : [], loading: false, error: true }));
      }
    }
    // Skip an effect disposed by Strict Mode replay or an immediate owner change.
    queueMicrotask(() => { if (live()) void load(); });
    return () => { disposed = true; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [ownerId, isPending, refresh]);

  if (isPending || !ownerId) return null;
  const owned = snapshot.ownerId === ownerId;
  const runs = owned ? snapshot.runs : [];
  const loading = !owned || snapshot.loading;
  const error = owned && snapshot.error;
  return <section className="panel keyword-activity-summary" aria-label="Keyword evaluation activity" aria-busy={loading}>
    <header><div><h2>Keyword evaluations</h2><p>Recent keyword research and saved answers.</p></div>
      <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)} disabled={loading} aria-label="Refresh saved keyword activity"><RefreshCw size={13} /> Refresh</button>
    </header>
    {loading && <p role="status" className="keyword-activity-message">Loading saved keyword activity…</p>}
    {error && <p role="alert" className="keyword-activity-message">Saved keyword activity could not be refreshed. Open your evaluations or try again.</p>}
    {runs.length > 0 ? <ol aria-label="Recent keyword evaluations">{runs.map(run => <li key={run.id}>
      <Link className="keyword-activity-query" href={`/benchmarks?suite=${encodeURIComponent(run.suiteId)}&run=${encodeURIComponent(run.id)}`}>
        <span>{run.query}</span><ArrowUpRight size={14} aria-hidden="true" />
      </Link>
      <div className="keyword-activity-meta"><span>{labels[run.status]}</span><span>{run.kind === "baseline" ? "Baseline answer" : "Fresh answer"}</span>
        <time dateTime={run.updatedAt}>{new Date(run.updatedAt).toLocaleString(undefined, {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"})}</time>
      </div>
    </li>)}</ol> : !loading && !error && <p className="keyword-activity-message">No keyword evaluations are saved yet. Prepare a query to start your first comparison.</p>}
    <footer><span>Private saved activity. Viewing this panel starts no new work.</span><Link href="/benchmarks">Open keyword evaluations <ArrowUpRight size={13} /></Link></footer>
  </section>;
}
