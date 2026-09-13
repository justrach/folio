"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Clock3, Loader2, OctagonAlert, X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import type { EvaluationRun } from "@/lib/evals";

export type EvaluationConnection = {
  provider?: string;
  configured: boolean;
  status?: string;
  model?: string;
  message: string;
  canRun?: boolean;
  authorized?: boolean;
  maxRunsPerDay?: number | null;
  usage?: {
    liveAttemptsLast24Hours: number;
    remainingLiveRuns: number | null;
    activeRunId: string | null;
    activeRunStatus: string | null;
    nextAvailableAt?: string | null;
  };
  allowedTargets?: string[];
};

const UPDATE_EVENT = "folio-evaluations-changed";
export function announceEvaluationUpdate() {
  window.dispatchEvent(new Event(UPDATE_EVENT));
}
export const activeRun = (run: EvaluationRun) =>
  run.status === "queued" || run.status === "running";

export async function evaluationRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error :
        response.status === 401 ? "Sign in to view your private evaluations." :
          "The request could not be confirmed. Refresh the run before trying again.",
    );
  }
  if (!body || typeof body !== "object") throw new Error("The evaluation response could not be read.");
  return body as T;
}

/** Reads only on mount. Only explicit actions create runs; polling reconciles existing sessions. */
export function useEvaluationWorkspace({ enabled = true }: { enabled?: boolean } = {}) {
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const account = useRef(ownerId);
  account.current = ownerId;
  const [state, setState] = useState<{
    ownerId: string | null;
    runs: EvaluationRun[];
    connection: EvaluationConnection | null;
    error: string;
  }>({ ownerId: null, runs: [], connection: null, error: "" });
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener(UPDATE_EVENT, refresh);
    return () => window.removeEventListener(UPDATE_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (isPending || !enabled || !ownerId) return;
    const controller = new AbortController();
    let busy = false;
    let knownRuns: EvaluationRun[] = [];
    async function load(reconcile: boolean) {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      if (!knownRuns.length) setLoading(true);
      try {
        let reconcileError = "";
        if (reconcile) {
          // No new turns or tools are submitted here. Catch up with the saved provider session.
          for (const run of knownRuns.filter(activeRun).slice(0, 3)) {
            try {
              await evaluationRequest(`/api/evaluations/${encodeURIComponent(run.id)}/reconcile`, {
                method: "POST", signal: controller.signal,
                headers: { "Content-Type": "application/json" }, body: "{}",
              });
            } catch (error) {
              if (controller.signal.aborted) throw error;
              reconcileError = error instanceof Error ? error.message : "The provider session could not be refreshed.";
            }
          }
        }
        const data = await evaluationRequest<{ runs: EvaluationRun[]; connection: EvaluationConnection }>(
          "/api/evaluations", { signal: controller.signal },
        );
        if (!Array.isArray(data.runs)) throw new Error("The saved run list could not be read.");
        if (!controller.signal.aborted && account.current === ownerId) {
          knownRuns = data.runs;
          setState({ ownerId, runs: data.runs, connection: data.connection, error: reconcileError });
        }
      } catch (error) {
        if (!controller.signal.aborted && account.current === ownerId) {
          setState((previous) => ({
            ownerId, runs: previous.ownerId === ownerId ? previous.runs : [],
            connection: previous.ownerId === ownerId ? previous.connection : null,
            error: error instanceof Error ? error.message : "Run status is unavailable.",
          }));
        }
      } finally {
        busy = false;
        if (!controller.signal.aborted && account.current === ownerId) setLoading(false);
      }
    }
    void load(false);
    const timer = setInterval(() => void load(true), 10_000);
    const visible = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ownerId, isPending, enabled, revision]);

  const owned = !isPending && state.ownerId === ownerId && Boolean(ownerId);
  return {
    ownerId, isPending, loading: enabled && Boolean(ownerId) && (loading || !owned),
    runs: owned ? state.runs : [],
    connection: owned ? state.connection : null,
    error: owned ? state.error : "", refresh,
  };
}

export function RunStatus({ status }: { status: EvaluationRun["status"] | "unmeasured" | "pass" | "fail" }) {
  const labels: Record<string, string> = {
    queued: "Queued", running: "Running", requires_action: "Needs attention", completed: "Completed",
    failed: "Failed", cancelled: "Cancelled", unmeasured: "Unobservable", pass: "Passed", fail: "Failed",
  };
  const Icon = status === "running" ? Loader2 : status === "queued" ? Clock3 :
    status === "completed" || status === "pass" ? Check :
      status === "failed" || status === "fail" || status === "requires_action" ? OctagonAlert :
        status === "cancelled" ? X : CircleDashed;
  return <span className={`eval-status eval-status-${status}`}><Icon size={12} className={status === "running" ? "eval-spin" : ""} aria-hidden="true" />{labels[status] ?? status}</span>;
}

export function evaluationDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable";
}

export function downloadEvaluation(value: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
