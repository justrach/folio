"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bot, ChevronDown, CircleDashed, FileCheck2,
  Globe2, Layers3, Loader2, LockKeyhole, Plus, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import type { EvaluationRun } from "@/lib/evals";
import { evaluationHref, readEvaluationIntent } from "@/lib/evaluation-navigation";
import { EvaluationActivity } from "./evaluations-panel";
import {
  activeRun, announceEvaluationUpdate, evaluationDate, evaluationRequest,
  RunStatus, useEvaluationWorkspace,
} from "./evaluation-workspace";
import "./agent-runs-panel.css";

export function AgentRunsPanel() {
  const workspace = useEvaluationWorkspace();
  const searchParams = useSearchParams();
  const requestedId = readEvaluationIntent(searchParams).runId ?? null;
  const hasRunQuery = searchParams.has("run");
  const queryKey = hasRunQuery ? requestedId ?? "invalid" : "default";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ownerId: string; queryKey: string; run: EvaluationRun } | null>(null);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState<{ ownerId: string; runId: string; message: string } | null>(null);
  const account = useRef(workspace.ownerId);
  account.current = workspace.ownerId;
  const queryMatches = !hasRunQuery || requestedId === selectedId;
  const selection = useRef<string | null>(selectedId);
  selection.current = queryMatches ? selectedId : null;
  const run = queryMatches && detail?.ownerId === workspace.ownerId && detail.queryKey === queryKey && detail.run.id === selectedId ? detail.run : null;
  const error = workspace.ownerId && hasRunQuery && !requestedId ? "This session link is invalid. Choose a saved session." :
    queryMatches && failure?.ownerId === workspace.ownerId && failure.runId === selectedId ? failure.message : "";
  const selectedSummary = workspace.runs.find((item) => item.id === selectedId);
  const active = workspace.runs.filter(activeRun);
  const finished = workspace.runs.filter((item) => item.status === "completed");
  const needsAttention = workspace.runs.filter((item) => item.status === "failed" || item.status === "requires_action");
  const ready = Boolean(workspace.connection?.configured && workspace.connection.canRun);

  useEffect(() => {
    setSelectedId(workspace.ownerId ? requestedId : null);
    setDetail(null); setFailure(null); setBusy("");
  }, [workspace.ownerId, requestedId, hasRunQuery]);
  useEffect(() => {
    if (hasRunQuery || selectedId || !workspace.ownerId || !workspace.runs.length) return;
    setSelectedId(workspace.runs.find(activeRun)?.id ?? workspace.runs[0].id);
  }, [hasRunQuery, selectedId, workspace.ownerId, workspace.runs]);
  useEffect(() => {
    setDetail(null); setFailure(null); setBusy("");
    if (!selectedId || !workspace.ownerId || !queryMatches) return;
    const controller = new AbortController();
    const ownerId = workspace.ownerId;
    evaluationRequest<{ run: EvaluationRun }>(`/api/evaluations/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(({ run: nextRun }) => {
        if (controller.signal.aborted || account.current !== ownerId || selection.current !== selectedId) return;
        if (nextRun.id !== selectedId || nextRun.publication !== "private") throw new Error("The returned session does not match this private selection.");
        setDetail({ ownerId, queryKey, run: nextRun });
      })
      .catch((failure) => {
        if (!controller.signal.aborted && account.current === ownerId && selection.current === selectedId)
          setFailure({ ownerId, runId: selectedId, message: failure instanceof Error ? failure.message : "This private session could not be loaded." });
      });
    return () => controller.abort();
  }, [selectedId, queryMatches, queryKey, workspace.ownerId, selectedSummary?.updatedAt, selectedSummary?.revision]);

  function chooseRun(id: string) {
    const safeId = readEvaluationIntent(new URLSearchParams({ run: id })).runId;
    if (!safeId) return;
    setSelectedId(safeId); setDetail(null); setFailure(null); setBusy("");
    window.history.pushState(null, "", `/agents?run=${encodeURIComponent(safeId)}`);
  }

  async function action(kind: "refresh" | "cancel") {
    if (!run || !workspace.ownerId) return;
    const ownerId = workspace.ownerId;
    const runId = run.id;
    setBusy(kind); setFailure(null);
    try {
      const { run: nextRun } = await evaluationRequest<{ run: EvaluationRun }>(
        `/api/evaluations/${encodeURIComponent(run.id)}${kind === "refresh" ? "/reconcile" : ""}`,
        { method: kind === "refresh" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kind === "refresh" ? {} : { action: "cancel" }) },
      );
      if (account.current !== ownerId || selection.current !== runId) return;
      if (nextRun.id !== runId || nextRun.publication !== "private") throw new Error("The returned session does not match this private selection.");
      setDetail({ ownerId, queryKey, run: nextRun });
      announceEvaluationUpdate();
    } catch (failure) { if (account.current === ownerId && selection.current === runId) setFailure({ ownerId, runId, message: failure instanceof Error ? failure.message : "The session could not be refreshed." }); }
    finally { if (account.current === ownerId && selection.current === runId) setBusy(""); }
  }

  return <div className="agent-runs-panel">
    <section className="panel agent-runtime" aria-labelledby="agent-runtime-title">
      <div className="agent-runtime-copy"><span className="eval-eyebrow">YOUR WORK, STILL MOVING</span><h2 id="agent-runtime-title">A session with a memory.<br /><em>A return you can inspect.</em></h2><p>OpenAI’s managed Agents API runs the research. Folio captures the sources, verifies the returned evidence, and keeps each session in your notebook.</p><div className="agent-runtime-footer"><span className={`agent-connection ${ready ? "ready" : ""}`}><i />{workspace.isPending ? "Checking connection" : !workspace.ownerId ? "Sign in to connect" : ready ? "Agents API connected" : workspace.connection?.configured ? "Workspace access required" : "API key not connected"}</span><a href="https://developers.openai.com/api/docs/guides/agents-api/overview" target="_blank" rel="noreferrer">Managed runtime <ArrowUpRight size={11} /></a></div></div>
      <div className="agent-runtime-diagram" aria-label="Agent session architecture"><span className="agent-diagram-overline">ONE SAVED SESSION</span><div className="agent-diagram-session"><span><Bot size={20} />OpenAI Agents API</span><small>Managed Codex harness</small></div><span className="agent-diagram-stem" /><div className="agent-diagram-branches"><span><Globe2 size={15} />Source captures</span><span><Layers3 size={15} />Session returns</span><span><FileCheck2 size={15} />Verified report</span></div><p><LockKeyhole size={12} />Private workspace · saved between visits</p></div>
    </section>

    <div className="agent-counters"><div><span>In progress</span><strong>{active.length.toString().padStart(2, "0")}</strong><small>Queued or running sessions</small></div><div><span>Completed</span><strong>{finished.length.toString().padStart(2, "0")}</strong><small>Returned and recorded</small></div><div><span>Needs attention</span><strong>{needsAttention.length.toString().padStart(2, "0")}</strong><small>Failed or waiting for action</small></div><div className="agent-counter-action"><FileCheck2 size={22} /><span>Start with a website.<br />Keep the evidence.</span><Link href="/evaluations">New evaluation <ArrowRight size={13} /></Link></div></div>
    {(error || workspace.error) && <div className="eval-alert" role="alert">{error || workspace.error}</div>}
    {workspace.connection && !ready && <div className="agent-setup-note"><Bot size={17} /><p>{workspace.connection.message}</p><button type="button" onClick={workspace.refresh}><RefreshCw size={12} />Check connection</button></div>}

    <section className="panel agent-workbench" aria-labelledby="agent-workbench-title"><div className="eval-section-top"><div><span className="eval-eyebrow">THE WORKING NOTEBOOK</span><h2 id="agent-workbench-title">Sessions & returns</h2><p>Open a task to see its recorded progress and returned data.</p></div><Link href="/evaluations" className="button secondary"><Plus size={13} />New evaluation</Link></div>
      {!workspace.ownerId && !workspace.isPending ? <div className="agent-empty"><LockKeyhole size={28} /><h3>Your research stays yours.</h3><p>Sign in to see private sessions. You can explore a reproducible example report without connecting an API key.</p><div><Link href="/login" className="button primary">Sign in <ArrowUpRight size={13} /></Link><Link href="/evaluations" className="button secondary">Explore evaluation demo</Link></div></div> : workspace.runs.length ? <div className="agent-workbench-grid"><div className="agent-task-list" aria-label="Saved agent sessions">{workspace.runs.map((item) => <button className={`agent-task-row ${selectedId === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => chooseRun(item.id)} aria-pressed={selectedId === item.id}><span className="agent-task-row-icon">{activeRun(item) ? <Loader2 size={15} className="eval-spin" /> : <Bot size={16} />}</span><span className="agent-task-row-text"><strong>{item.siteName || item.targetUrl}</strong><small>{item.mode === "demo" ? "Local fixture" : "Managed session"} · {evaluationDate(item.createdAt)}</small><RunStatus status={item.status} /></span><ChevronDown size={13} /></button>)}</div><div className="agent-detail">{run && run.id === selectedId ? <><div className="agent-detail-heading"><div><span className="eval-eyebrow">{run.mode === "demo" ? "LOCAL FIXTURE" : "MANAGED SESSION"}</span><h3>{run.siteName || run.targetUrl}</h3><p>{run.suiteVersion}</p></div><RunStatus status={run.status} /></div>{run.error && <p className="eval-run-error">{run.error}</p>}<EvaluationActivity run={run} /><div className="agent-detail-actions"><button className="button secondary" type="button" onClick={() => void action("refresh")} disabled={Boolean(busy)}><RefreshCw size={12} />Refresh returns</button>{(activeRun(run) || run.status === "requires_action") && <button className="button secondary" type="button" onClick={() => void action("cancel")} disabled={Boolean(busy)}>Cancel run</button>}<Link className="button primary" href={evaluationHref({ runId: run.id })}>Open evaluation <ArrowUpRight size={12} /></Link></div></> : <p className="eval-empty-section" role="status">{error ? "The selected session is unavailable. Choose another saved session." : "Loading this session’s returned events…"}</p>}</div></div> : <div className="agent-empty"><CircleDashed size={31} /><h3>A quiet notebook. A good place to start.</h3><p>{workspace.loading || workspace.isPending ? "Loading your saved sessions…" : "Start an evaluation to create a managed session. Its saved status, tool returns and verified report will appear here."}</p><Link href="/evaluations" className="button primary">Create an evaluation <ArrowRight size={13} /></Link></div>}
    </section><p className="eval-privacy"><ShieldCheck size={14} />Sessions continue in OpenAI’s managed runtime. Folio refreshes existing session status every 10 seconds while visible; it never creates a new run in the background.</p>
  </div>;
}

export function AgentRunDock() {
  const pathname = usePathname();
  const onRunPage = pathname.startsWith("/evaluations") || pathname.startsWith("/agents");
  const workspace = useEvaluationWorkspace({ enabled: !onRunPage });
  const [dismissed, setDismissed] = useState("");
  const [observedRun, setObservedRun] = useState<string | null>(null);
  const active = workspace.runs.filter(activeRun);
  const attention = workspace.runs.find((run) => run.status === "requires_action" || run.status === "failed");
  const recentlyCompleted = workspace.runs.find((run) => run.id === observedRun && run.status === "completed");
  const run = active[0] ?? recentlyCompleted ?? attention;
  const activeId = active[0]?.id ?? null;
  useEffect(() => { if (activeId) setObservedRun(activeId); }, [activeId]);
  if (onRunPage || !workspace.ownerId || !run || dismissed === `${run.id}:${run.status}`) return null;
  return <aside className="agent-run-dock" aria-label="Background agent activity"><span className="agent-dock-icon">{activeRun(run) ? <Loader2 size={17} className="eval-spin" /> : <Bot size={18} />}</span><div><span className="agent-dock-label">{active.length > 1 ? `${active.length} sessions in progress` : "Your agent notebook"}</span><strong>{run.siteName || run.targetUrl}</strong><span className="agent-dock-state">{workspace.error ? "Status refresh unavailable" : run.status === "running" ? "Working in the background" : run.status === "queued" ? "Waiting to start" : run.status === "completed" ? "Report ready · inspect the evidence" : run.status === "requires_action" ? "Session needs attention" : "Session failed · inspect returns"}</span></div><Link href={`/agents?run=${encodeURIComponent(run.id)}`} aria-label={`Open agent session for ${run.siteName || run.targetUrl}`}><ArrowUpRight size={17} /></Link><button type="button" aria-label="Dismiss agent activity" onClick={() => setDismissed(`${run.id}:${run.status}`)}><X size={13} /></button></aside>;
}
