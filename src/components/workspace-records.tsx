"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "@/components/icons";
import "./workspace-records.css";

type EvaluationRow = {
  id: string; targetUrl: string; siteName?: string | null; status: string;
  mode?: string; createdAt: string; error?: string | null;
};
type SuiteRow = { id: string; name: string; cases?: unknown[]; createdAt?: string | null };

const DOTS: Record<string, string> = {
  completed: "dot-done", running: "dot-running", queued: "dot-running",
  requires_action: "dot-needs", failed: "dot-failed", cancelled: "dot-failed",
};

function when(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** The records an account already owns: evaluations and question suites. */
export function WorkspaceRecords({ ownerId }: { ownerId: string | null }) {
  const [evaluations, setEvaluations] = useState<EvaluationRow[] | null>(null);
  const [suites, setSuites] = useState<SuiteRow[] | null>(null);

  useEffect(() => {
    if (!ownerId) { setEvaluations([]); setSuites([]); return; }
    const controller = new AbortController();
    fetch("/api/evaluations", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : { runs: [] })
      .then((data: { runs?: EvaluationRow[] }) => setEvaluations(Array.isArray(data.runs) ? data.runs : []))
      .catch(() => { if (!controller.signal.aborted) setEvaluations([]); });
    fetch("/api/benchmarks", { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : { suites: [] })
      .then((data: { suites?: SuiteRow[] }) => setSuites(Array.isArray(data.suites) ? data.suites : []))
      .catch(() => { if (!controller.signal.aborted) setSuites([]); });
    return () => controller.abort();
  }, [ownerId]);

  if (!ownerId) return null;

  return (
    <section className="workspace-records" aria-label="Saved evaluations and suites">
      <div className="workspace-records-panel">
        <header>
          <h2>Evaluations</h2>
          <Link href="/evaluations">All evaluations <ArrowUpRight size={12} /></Link>
        </header>
        {evaluations === null ? <p className="workspace-records-empty">Loading saved evaluations…</p>
          : evaluations.length === 0 ? <p className="workspace-records-empty">No evaluations yet. <Link href="/evaluations">Run the first one</Link>.</p>
          : <ul>
              {evaluations.slice(0, 5).map(run => (
                <li key={run.id}>
                  <Link href={`/evaluations?run=${encodeURIComponent(run.id)}`}>
                    <span className={`dot ${DOTS[run.status] ?? ""}`} aria-hidden />
                    <strong>{run.siteName || run.targetUrl}</strong>
                    <small>{run.mode === "demo" ? "Local fixture" : run.status} · {when(run.createdAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>}
      </div>

      <div className="workspace-records-panel">
        <header>
          <h2>Question suites</h2>
          <Link href="/benchmarks">All benchmarks <ArrowUpRight size={12} /></Link>
        </header>
        {suites === null ? <p className="workspace-records-empty">Loading saved suites…</p>
          : suites.length === 0 ? <p className="workspace-records-empty">No saved suites yet. <Link href="/benchmarks">Start from a template</Link>.</p>
          : <ul>
              {suites.slice(0, 5).map(suite => (
                <li key={suite.id}>
                  <Link href={`/benchmarks?suite=${encodeURIComponent(suite.id)}`}>
                    <span className="dot dot-running" aria-hidden />
                    <strong>{suite.name}</strong>
                    <small>{suite.cases?.length ?? 0} questions · {when(suite.createdAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>}
      </div>
    </section>
  );
}
