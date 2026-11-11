"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Check, ChevronRight, Globe2, MessageSquareText, SearchCheck, Users, type LucideIcon } from "lucide-react";
import { gettingStartedSummary, type GettingStartedProgress, type GettingStartedStepId } from "@/lib/getting-started";
import { besideSidebar, useSidebarPopover } from "./sidebar-popover";
import "./getting-started.css";

const ICONS: Record<GettingStartedStepId, LucideIcon> = { website: Globe2, "search-console": SearchCheck, agent: Bot, ask: MessageSquareText, team: Users };

/** Whether the person hid the checklist ("hidden", can be shown again from the account menu) or finished it ("finished"). */
export type GettingStartedVisibility = "shown" | "hidden" | "finished";
const storageKey = (userId: string) => `folio-getting-started-${userId}`;
const EVENT = "folio-getting-started-change";
export function readGettingStartedVisibility(userId: string): GettingStartedVisibility {
  try { const value = localStorage.getItem(storageKey(userId)); return value === "hidden" || value === "finished" ? value : "shown"; } catch { return "shown"; }
}
export function setGettingStartedVisibility(userId: string, value: GettingStartedVisibility) {
  try { if (value === "shown") localStorage.removeItem(storageKey(userId)); else localStorage.setItem(storageKey(userId), value); } catch { /* This tab still follows the choice. */ }
  window.dispatchEvent(new Event(EVENT));
}
export function useGettingStartedVisibility(userId: string | null) {
  const [visibility, setVisibility] = useState<GettingStartedVisibility | null>(null);
  useEffect(() => {
    if (!userId) return;
    const sync = () => setVisibility(readGettingStartedVisibility(userId));
    const storage = (event: StorageEvent) => { if (event.key === storageKey(userId) || event.key === null) sync(); };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener("storage", storage); };
  }, [userId]);
  return userId ? visibility : null;
}

/** A progress ring: the share of steps done, drawn as an arc from twelve o'clock. */
export function ProgressRing({ done, total, size }: { done: number; total: number; size: number }) {
  const stroke = size >= 28 ? 3 : 2.5, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius, center = size / 2;
  return <svg className="gs-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle className="gs-ring-track" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} />
    <circle className="gs-ring-value" cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={circumference} strokeDashoffset={circumference * (1 - (total ? done / total : 0))} transform={`rotate(-90 ${center} ${center})`} />
  </svg>;
}

/**
 * The sidebar's Getting started pill and its checklist. Steps come from /api/getting-started (what Folio has recorded for
 * the person), and are read again on each page change and whenever the checklist opens.
 */
export function GettingStarted({ userId, page, onNavigate }: { userId: string | null; page: string; onNavigate?: () => void }) {
  const visibility = useGettingStartedVisibility(userId);
  const [progress, setProgress] = useState<GettingStartedProgress | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/getting-started", { cache: "no-store", signal });
      if (!response.ok) return;
      const body = await response.json() as { progress?: GettingStartedProgress };
      if (body.progress && !signal?.aborted) setProgress(body.progress);
    } catch { /* The pill waits for the next page. */ }
  }, []);
  useEffect(() => {
    if (!userId || visibility !== "shown") return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [userId, visibility, page, load]);
  const popover = useSidebarPopover(besideSidebar(340), () => void load());
  if (!userId || visibility !== "shown" || !progress) return null;
  const summary = gettingStartedSummary(progress);
  const go = () => { popover.close(); onNavigate?.(); };
  return <div className="gs" onKeyDown={popover.onKeyDown}>
    <button ref={popover.trigger} type="button" className="gs-pill" popoverTarget={popover.id} aria-expanded={popover.open}
      aria-label={`Getting started, ${summary.completed} of ${summary.total} steps done`} title="Getting started">
      <ProgressRing done={summary.completed} total={summary.total} size={20} />
      <span className="gs-pill-label">Getting started</span>
      <span className="gs-pill-count">{summary.completed}/{summary.total}</span>
      <ChevronRight size={16} className="gs-pill-chevron" aria-hidden="true" />
    </button>
    <div ref={popover.panel} id={popover.id} popover="auto" className="gs-card" role="dialog" aria-label="Getting started">
      <ProgressRing done={summary.completed} total={summary.total} size={34} />
      <p className="gs-title">{summary.finished ? "You’re all set" : "Getting started"}</p>
      <p className="gs-sub">{summary.completed}/{summary.total} steps complete</p>
      <ol className="gs-steps">{summary.steps.map(step => {
        const Icon = ICONS[step.id], next = summary.next?.id === step.id;
        return <li key={step.id}>
          <Link href={step.href} onClick={go} className={`gs-step${step.done ? " is-done" : ""}${next ? " is-next" : ""}`} aria-current={next ? "step" : undefined}>
            {step.done ? <span className="gs-check" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span> : <Icon size={19} strokeWidth={1.6} aria-hidden="true" />}
            <span className="gs-step-text">{step.label}{step.done && <span className="sr-only"> (done)</span>}{next && <small>{step.detail}</small>}</span>
          </Link>
        </li>;
      })}</ol>
      {summary.finished
        ? <button type="button" className="gs-finish" onClick={() => { popover.close(); setGettingStartedVisibility(userId, "finished"); }}>Finish</button>
        : <Link href={summary.next!.href} onClick={go} className="gs-finish">Next: {summary.next!.label}<ArrowRight size={16} aria-hidden="true" /></Link>}
      {!summary.finished && <button type="button" className="gs-hide" onClick={() => { popover.close(); setGettingStartedVisibility(userId, "hidden"); }}>
        Hide this list <span>(it stays in your account menu)</span></button>}
    </div>
  </div>;
}
