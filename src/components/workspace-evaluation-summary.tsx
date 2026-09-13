"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileCheck2, Loader2, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import type { EvaluationRun } from "@/lib/evals";
import { evaluationHref } from "@/lib/evaluation-navigation";
import "./workspace-evaluation-summary.css";

type RecentEvaluation = Pick<EvaluationRun, "id" | "siteName" | "targetUrl" | "status" | "mode" | "createdAt" | "result">;
type Snapshot = { ownerId: string | null; status: "loading" | "ready" | "error"; runs: RecentEvaluation[]; error: string };
const statusLabels: Record<EvaluationRun["status"], string> = {
  queued: "Queued", running: "Running", requires_action: "Needs attention",
  completed: "Completed", failed: "Failed", cancelled: "Cancelled",
};

function readRecentRuns(value: unknown): RecentEvaluation[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { runs?: unknown }).runs))
    throw new Error("Your saved evaluations could not be read.");
  const runs = (value as { runs: unknown[] }).runs;
  if (!runs.every((item) => {
    if (!item || typeof item !== "object") return false;
    const run = item as Partial<RecentEvaluation>;
    if (typeof run.id !== "string" || evaluationHref({ runId: run.id }) === "/evaluations" ||
      typeof run.siteName !== "string" || typeof run.targetUrl !== "string" ||
      typeof run.createdAt !== "string" || !Number.isFinite(Date.parse(run.createdAt)) ||
      (run.mode !== "live" && run.mode !== "demo") || !run.status || !Object.hasOwn(statusLabels, run.status)) return false;
    if (run.status === "completed" && run.result != null) {
      const result = run.result;
      return [result.passed, result.failed, result.unmeasured, result.measured].every(count => Number.isSafeInteger(count) && count >= 0) &&
        result.measured === result.passed + result.failed;
    }
    return true;
  })) throw new Error("Your saved evaluations could not be read.");
  return (runs as RecentEvaluation[]).slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 3);
}

/** A saved-state preview only. The separate agent dock reconciles provider sessions. */
export function WorkspaceEvaluationSummary({ initialTargetUrl }: { initialTargetUrl?: string }) {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const currentOwner = useRef(ownerId);
  currentOwner.current = ownerId;
  const [snapshot, setSnapshot] = useState<Snapshot>({ ownerId: null, status: "loading", runs: [], error: "" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (isPending || !ownerId) return;
    let request: AbortController | null = null;
    let disposed = false;
    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      setSnapshot(previous => ({ ownerId, status: "loading", error: "", runs: previous.ownerId === ownerId ? previous.runs : [] }));
      try {
        const response = await fetch("/api/evaluations", { method: "GET", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Your saved evaluations are unavailable. Try refreshing the notebook.");
        const runs = readRecentRuns(await response.json());
        if (!disposed && !controller.signal.aborted && currentOwner.current === ownerId)
          setSnapshot({ ownerId, status: "ready", runs, error: "" });
      } catch (error) {
        if (!disposed && !controller.signal.aborted && currentOwner.current === ownerId)
          setSnapshot({ ownerId, status: "error", runs: [], error: error instanceof Error ? error.message : "Your saved evaluations are unavailable." });
      }
    }
    const refresh = () => { void load(); };
    refresh();
    window.addEventListener("folio-evaluations-changed", refresh);
    return () => {
      disposed = true;
      request?.abort();
      window.removeEventListener("folio-evaluations-changed", refresh);
    };
  }, [ownerId, isPending, retry]);

  // The account guard hides old private rows during the owner-changing render,
  // before the effect cleanup or a replacement request has a chance to run.
  if (isPending || !ownerId) return null;
  const owned = snapshot.ownerId === ownerId;
  const runs = owned ? snapshot.runs : [];
  const loading = !owned || snapshot.status === "loading";
  const error = owned && snapshot.status === "error" ? snapshot.error : "";

  return <section className="workspace-evaluation-summary panel" aria-label="Workspace evaluations" aria-busy={loading}>
    <header className="wes-heading">
      <div><span className="wes-eyebrow">YOUR PRIVATE NOTEBOOK</span><h2>Evaluations, at a glance.</h2><p>Recent agent returns and the evidence checks behind them.</p></div>
      <Link href={evaluationHref({ targetUrl: initialTargetUrl ?? runs[0]?.targetUrl })} className="button primary"><Plus size={13} aria-hidden="true" />Prepare evaluation</Link>
    </header>
    {loading && <p className="wes-loading" role="status"><Loader2 size={14} aria-hidden="true" />{runs.length ? "Refreshing saved evaluations…" : "Loading your saved evaluations…"}</p>}
    {error ? <div className="wes-error" role="alert"><p>{error}</p><button className="button secondary" type="button" onClick={() => setRetry(value => value + 1)}><RefreshCw size={13} aria-hidden="true" />Retry evaluations</button></div> : runs.length ?
      <ol className="wes-runs" aria-label="Recent evaluations">{runs.map((run) => {
        const name = run.siteName || run.targetUrl;
        const reportHref = evaluationHref({ runId: run.id });
        const agentHref = `/agents${reportHref.slice("/evaluations".length)}`;
        return <li key={run.id} className="wes-run">
          <span className="wes-run-icon"><FileCheck2 size={18} aria-hidden="true" /></span>
          <div className="wes-run-copy"><h3>{name}</h3><p className="wes-target">{run.targetUrl}</p><span className="wes-meta">{run.mode === "demo" ? "Local fixture" : "Agents API"} · {new Date(run.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
          <div className="wes-result"><span className={`wes-status wes-status-${run.status}`}>{statusLabels[run.status]}</span>{run.status === "completed" && run.result ? <><p className="wes-counts"><span>{run.result.passed} passed</span><span>{run.result.failed} failed</span><span>{run.result.unmeasured} unmeasured</span></p><small>{run.result.measured} measured checks</small></> : <p className="wes-pending">{run.status === "queued" || run.status === "running" ? "Waiting for a verified return" : run.status === "requires_action" ? "Review the session’s next step" : "No verified result saved"}</p>}</div>
          <div className="wes-run-links"><Link href={reportHref} aria-label={`Open report for ${name}`}>Report <ArrowUpRight size={12} aria-hidden="true" /></Link><Link href={agentHref} aria-label={`Open returns for ${name}`}>Agent returns <ArrowUpRight size={12} aria-hidden="true" /></Link></div>
        </li>;
      })}</ol> : !loading && <div className="wes-empty"><span><FileCheck2 size={23} aria-hidden="true" /></span><div><h3>Your first evaluation starts here.</h3><p>Prepare a website review, then return here to inspect its saved findings and source evidence.</p></div></div>}
    <footer className="wes-footer"><span><ShieldCheck size={13} aria-hidden="true" />Private to your account. These checks do not measure search rank.</span><Link href={evaluationHref()}>Open notebook <ArrowUpRight size={12} aria-hidden="true" /></Link></footer>
  </section>;
}
