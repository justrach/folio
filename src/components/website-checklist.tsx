"use client";

import { useEffect, useState } from "react";
import { ArrowDown, Check } from "lucide-react";
import type { KeywordBenchmarkRun } from "@/lib/keyword-benchmark-types";
import "./website-checklist.css";

/** Panels announce saved progress so the checklist re-reads owned records (free GETs only). */
export const WEBSITE_PROGRESS_EVENT = "folio:website-progress";
export function announceWebsiteProgress() { if (typeof window !== "undefined") window.dispatchEvent(new Event(WEBSITE_PROGRESS_EVENT)); }

type Step = { title: string; why: string; done: boolean; target?: string; action?: string; blocked?: string; cost?: string };
type State = { loading: boolean; seoDone: boolean; seoReady: boolean; researchReady: boolean; researchBlocked: string | null;
  discovered: boolean; briefed: boolean; competitorDomains: string[]; ranked: boolean };
const host = (url: string) => { try { return new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, ""); } catch { return null; } };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function go(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  element.classList.remove("website-step-highlight"); void element.offsetWidth; element.classList.add("website-step-highlight");
}

/** A guided order over existing tools. It reads saved records only and never starts paid work itself. */
export function WebsiteChecklist({ websiteId, targetUrl }: { websiteId: string; targetUrl: string }) {
  const domain = host(targetUrl);
  const [state, setState] = useState<State>({ loading: true, seoDone: false, seoReady: false, researchReady: false, researchBlocked: null, discovered: false, briefed: false, competitorDomains: [], ranked: false });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const again = () => setRefresh(value => value + 1);
    window.addEventListener(WEBSITE_PROGRESS_EVENT, again); window.addEventListener("focus", again);
    return () => { window.removeEventListener(WEBSITE_PROGRESS_EVENT, again); window.removeEventListener("focus", again); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const get = (url: string) => fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => response.ok ? record(await response.json()) : null).catch(() => null);
    void (async () => {
      const [reports, seo, research] = await Promise.all([get("/api/seo-reports"), get("/api/seo-data"), get(`/api/sites/${encodeURIComponent(websiteId)}/research`)]);
      const runs = (Array.isArray(research?.runs) ? research!.runs : []) as KeywordBenchmarkRun[];
      const access = record(research?.access);
      const completed = (stage: string) => runs.filter(run => run.status === "completed" && run.case.websiteResearch?.stage === stage);
      const brief = completed("competitor-research")[0]?.answer?.websiteResearch;
      const competitorDomains = brief?.stage === "competitor-research" ? brief.competitors.map(site => host(site.url)).filter((d): d is string => !!d && d !== domain) : [];
      let ranked = false;
      if (competitorDomains.length) {
        const params = new URLSearchParams(); competitorDomains.slice(0, 10).forEach(d => params.append("domain", d));
        const metrics = record((await get(`/api/seo-reports/metrics?${params}`))?.metrics);
        ranked = !!metrics && competitorDomains.every(d => !!metrics[d]);
      }
      if (controller.signal.aborted) return;
      setState({ loading: false,
        seoDone: Array.isArray(reports?.reports) && reports!.reports.some(item => record(item)?.state === "complete" && host(`https://${String(record(item)?.domain)}/`) === domain),
        seoReady: seo?.configured === true && seo?.authorized === true,
        researchReady: access?.canRun === true,
        researchBlocked: access && access.canRun !== true ? String(access.message ?? "Paid research is unavailable for this account.") : null,
        discovered: completed("query-discovery").length > 0, briefed: !!brief, competitorDomains, ranked });
    })();
    return () => controller.abort();
  }, [websiteId, domain, refresh]);

  const notApproved = "Your account isn’t approved for this paid step yet. Ask the workspace operator to approve it.";
  const steps: Step[] = [
    { title: "Save your website", why: "Folio keeps it private. Nothing is scanned or charged yet.", done: true },
    { title: "Get your SEO baseline", why: "DataForSEO Domain Rank (0–100), backlinks, ranking keywords and traffic estimate.", done: state.seoDone,
      target: "website-seo", action: "Get baseline", cost: "Paid · 2 DataForSEO tasks", blocked: state.seoReady ? undefined : notApproved },
    { title: "Find the questions customers ask", why: "Luna reads your public pages and suggests up to five customer questions.", done: state.discovered,
      target: "website-research", action: "Discover questions", cost: "Paid · 1 OpenAI run", blocked: state.researchReady ? undefined : state.researchBlocked ?? notApproved },
    { title: "See who AI recommends", why: "Pick one question; Luna searches it and records which sites it recommends and why.", done: state.briefed,
      target: "website-research", action: "Research one question", cost: "Paid · 1 OpenAI run", blocked: state.researchReady ? undefined : state.researchBlocked ?? notApproved },
    { title: "Compare their authority", why: "Look up each recommended site's DataForSEO Domain Rank next to yours.", done: state.ranked,
      target: "website-research", action: "Compare domain ranks", cost: "Paid · 2 DataForSEO tasks per site", blocked: state.seoReady ? undefined : notApproved },
  ];
  const next = steps.findIndex(step => !step.done);
  const doneCount = steps.filter(step => step.done).length;

  return <section className="website-checklist" aria-label="Getting started">
    <header><h4>Getting started</h4><span>{state.loading ? "Checking your progress…" : `${doneCount} of ${steps.length} done`}</span></header>
    <ol>{steps.map((step, index) => {
      const current = !state.loading && index === next;
      const locked = !step.done && index > next && next !== -1;
      return <li key={step.title} data-state={step.done ? "done" : current ? "current" : "next"} aria-current={current ? "step" : undefined}>
        <span className="website-checklist-mark" aria-hidden="true">{step.done ? <Check size={13} /> : index + 1}</span>
        <div>
          <strong>{step.title}</strong>
          <p>{step.why}</p>
          {current && step.blocked && <p className="website-checklist-blocked" role="note">{step.blocked}</p>}
          {current && !step.blocked && step.target && <div className="website-checklist-cta">
            <button type="button" className="button primary" onClick={() => go(step.target!)}>{step.action} <ArrowDown size={14} /></button>
            <small>{step.cost}. You confirm on the next screen.</small></div>}
          {(step.done || locked) && step.target && <button type="button" className="text-link" onClick={() => go(step.target!)}>{step.done ? "View" : "Jump there"}</button>}
        </div>
      </li>;
    })}</ol>
    {!state.loading && next === -1 && <p className="website-checklist-done">All set. Re-run any step later to track changes over time.</p>}
  </section>;
}
