"use client";

import { useEffect, useRef, useState } from "react";
import { InkRunState, useInkLive } from "./onboarding-sketches";

type RunStatus = "queued" | "running" | "requires_action" | "completed" | "failed" | "cancelled";
type Run = { id: string; caseId: string; status: RunStatus; createdAt: string };
export type BaselineCase = { id: string; query: string };

const ACTIVE: RunStatus[] = ["queued", "running"];
const label: Record<RunStatus | "waiting", string> = { queued: "Starting", running: "Searching", requires_action: "Needs review", completed: "Saved", failed: "Failed", cancelled: "Cancelled", waiting: "Waiting" };
const dot: Record<RunStatus | "waiting", "live" | "bad" | "done" | "waiting"> = { queued: "live", running: "live", requires_action: "bad", completed: "done", failed: "bad", cancelled: "bad", waiting: "waiting" };

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: init?.body ? { "Content-Type": "application/json" } : undefined });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Folio could not update the baseline.");
  return body as T;
}

/**
 * Drives the first baseline one question at a time, inside the existing limits
 * (one active benchmark, six starts a day). The queue advances while Folio is open.
 */
export function useBaselineQueue(suiteId: string | null, cases: BaselineCase[], autoStart: boolean) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const busy = useRef(false), stopped = useRef(false);
  const caseKey = cases.map(item => item.id).join(",");
  useEffect(() => {
    if (!suiteId) return;
    let alive = true;
    async function tick() {
      if (busy.current || document.visibilityState === "hidden") return;
      busy.current = true;
      try {
        let { runs: next } = await json<{ runs: Run[] }>(`/api/benchmarks/runs?suiteId=${encodeURIComponent(suiteId!)}`);
        const active = next.find(run => ACTIVE.includes(run.status));
        if (active) {
          const { run } = await json<{ run: Run }>(`/api/benchmarks/runs/${encodeURIComponent(active.id)}/reconcile`, { method: "POST", body: "{}" });
          next = next.map(item => item.id === run.id ? run : item);
        } else if (autoStart && !stopped.current && !next.some(run => run.status === "requires_action")) {
          const started = new Set(next.map(run => run.caseId));
          const pending = cases.find(item => !started.has(item.id));
          if (pending) {
            const { run } = await json<{ run: Run }>("/api/benchmarks/runs", { method: "POST", body: JSON.stringify({ caseId: pending.id, kind: "baseline" }) });
            next = [run, ...next];
          }
        }
        if (alive) { setRuns(next); setError(""); }
      } catch (failure) {
        stopped.current = true;
        if (alive) setError(failure instanceof Error ? failure.message : "The baseline could not continue.");
      } finally { busy.current = false; }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 8_000);
    return () => { alive = false; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId, caseKey, autoStart]);
  const latest = new Map<string, Run>();
  for (const run of [...runs].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) latest.set(run.caseId, run);
  const rows = cases.map(item => ({ ...item, status: (latest.get(item.id)?.status ?? "waiting") as RunStatus | "waiting" }));
  return { rows, saved: rows.filter(row => row.status === "completed").length, active: rows.some(row => ACTIVE.includes(row.status as RunStatus)), error };
}

export function BaselineProgress({ rows, error }: { rows: ReturnType<typeof useBaselineQueue>["rows"]; error: string }) {
  const live = useInkLive<HTMLOListElement>();
  return <>
    <ol aria-label="Baseline questions" role="status" ref={live}>
      {rows.map(row => <li className={`ob-run is-${dot[row.status]}`} key={row.id}><InkRunState state={dot[row.status]} /><span className="ob-grow">{row.query}</span><span className="ob-state">{label[row.status]}</span></li>)}
    </ol>
    {error && <p className="ob-note" role="alert">{error}</p>}
  </>;
}
