"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown,
  CircleDashed, Clock3, Code2, ExternalLink, FileCheck2, Fingerprint,
  FlaskConical, Globe2, Info, Loader2, LockKeyhole, Play, RefreshCw, ShieldCheck,
} from "lucide-react";
import { EVAL_SUITE, type EvaluationRun, type EvidenceCapture } from "@/lib/evals";
import { createDemoEvaluationRun } from "@/lib/eval-verifier";
import { MAX_REFERENCE_PRICE, parseOwnerConfirmedExpectedFacts, REFERENCE_PRICE_INTERVALS } from "@/lib/expected-facts";
import type { SeoReportSummary } from "@/lib/seo-store";
import { DeleteEvaluation } from "./delete-evaluation";
import { EvaluationComparison } from "./evaluation-comparison";
import { evaluationHref, readEvaluationIntent } from "@/lib/evaluation-navigation";
import { isKeywordBenchmarkId } from "@/lib/keyword-benchmark-types";
import { KeywordBenchmarksPanel } from "./keyword-benchmarks-panel";
import {
  activeRun, announceEvaluationUpdate, downloadEvaluation, evaluationDate,
  evaluationRequest, RunStatus, useEvaluationWorkspace,
} from "./evaluation-workspace";
import "./evaluations-panel.css";

type ReportTab = "checks" | "evidence" | "findings" | "activity" | "methodology";
const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "checks", label: "Verification checks" },
  { id: "evidence", label: "Source evidence" },
  { id: "findings", label: "Findings" },
  { id: "activity", label: "Agent returns" },
  { id: "methodology", label: "Methodology" },
];

export function EvaluationsPanel({ initialTargetUrl = "" }: { initialTargetUrl?: string }) {
  const query = useSearchParams();
  const intent = readEvaluationIntent(query);
  const requestedViews = query.getAll("view");
  const requestedView = requestedViews.length === 1 ? requestedViews[0] : undefined;
  const pageView = requestedView === "page" || (requestedView !== "search" && Object.keys(intent).length > 0);
  const workspace = useEvaluationWorkspace({ enabled: pageView });
  const ids = useId();
  const targetUrl = intent.targetUrl ?? readEvaluationIntent(new URLSearchParams({ target: initialTargetUrl })).targetUrl;
  const websiteValues = query.getAll("website");
  const websiteId = websiteValues.length === 1 && isKeywordBenchmarkId(websiteValues[0]) ? websiteValues[0] : undefined;
  const pageTarget = useRef<{ ownerId: string | null; url: string | undefined } | null>(null);

  function switchView(view: "search" | "page") {
    if ((view === "page") === pageView) return;
    const params = new URLSearchParams({ view });
    const retainedTarget = pageView && pageTarget.current?.ownerId === workspace.ownerId ? pageTarget.current.url : targetUrl;
    if (retainedTarget) params.set("target", retainedTarget);
    if (view === "search" && websiteId) params.set("website", websiteId);
    // Each view owns its run IDs. A switch preserves only website context.
    window.history.pushState(null, "", `/evaluations?${params}`);
  }

  return <div className="evaluation-hub">
    <div className="evaluation-hub-switch" role="group" aria-label="Evaluation view">
      <button id={`${ids}-search-control`} type="button" aria-pressed={!pageView} aria-controls={`${ids}-search`} onClick={() => switchView("search")}>Search questions</button>
      <button id={`${ids}-page-control`} type="button" aria-pressed={pageView} aria-controls={`${ids}-page`} onClick={() => switchView("page")}>Page evidence</button>
    </div>
    {pageView ? <section id={`${ids}-page`} className="evaluation-hub-view" aria-labelledby={`${ids}-page-control`}>
      <p className="evaluation-hub-intent">Inspect one page’s captured content, reference answers, and verification checks.</p>
      <EvaluationWorkspacePanel key={workspace.ownerId ?? "anonymous"} initialTargetUrl={targetUrl ?? ""} workspace={workspace} onTargetChange={url => { pageTarget.current = { ownerId: workspace.ownerId, url }; }} />
    </section> : <section id={`${ids}-search`} className="evaluation-hub-view" aria-labelledby={`${ids}-search-control`}>
      <p className="evaluation-hub-intent">Choose the questions people ask. Keep the returned answers, website mentions, and sources together.</p>
      <KeywordBenchmarksPanel key={workspace.ownerId ?? "anonymous"} basePath="/evaluations" targetUrl={targetUrl} websiteId={websiteId} />
    </section>}
  </div>;
}

function pageEvaluationHref(intent: Parameters<typeof evaluationHref>[0] = {}) {
  const query = new URLSearchParams(evaluationHref(intent).split("?")[1]);
  query.set("view", "page");
  return `/evaluations?${query}`;
}

function EvaluationWorkspacePanel({ initialTargetUrl, workspace, onTargetChange }: { initialTargetUrl: string; workspace: ReturnType<typeof useEvaluationWorkspace>; onTargetChange: (url: string | undefined) => void }) {
  const searchParams = useSearchParams();
  const intent = readEvaluationIntent(searchParams);
  const selectedId = intent.runId ?? null;
  const [domain, setDomain] = useState(intent.targetUrl ?? initialTargetUrl);
  const editedTarget = useRef(false);
  const appliedIntent = useRef("");
  const [pendingSeoIntent, setPendingSeoIntent] = useState<string | null>(intent.seoReportId ?? null);
  const [referenceProduct, setReferenceProduct] = useState("");
  const [referencePricing, setReferencePricing] = useState<"unknown" | "stated" | "absent">("unknown");
  const [referenceAmount, setReferenceAmount] = useState("");
  const [referenceCurrency, setReferenceCurrency] = useState("USD");
  const [referenceInterval, setReferenceInterval] = useState("month");
  const [referenceConfirmed, setReferenceConfirmed] = useState(false);
  const [seoReports, setSeoReports] = useState<{ ownerId: string; reports: SeoReportSummary[] } | null>(null);
  const [seoReportId, setSeoReportId] = useState("");
  const [seoReportsError, setSeoReportsError] = useState("");
  const [selected, setSelected] = useState<{ ownerId: string | null; run: EvaluationRun; local?: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const startedNoticeRun = useRef<string | null>(null);
  const account = useRef(workspace.ownerId);
  account.current = workspace.ownerId;
  const current = busy === "start" ? null : selected?.local && !selectedId ? selected.run : selected?.ownerId === workspace.ownerId && selected?.run.id === selectedId ? selected.run : null;
  const liveReady = Boolean(workspace.ownerId && workspace.connection?.configured && workspace.connection.canRun);
  const savedRun = workspace.runs.find((run) => run.id === selectedId);
  const hasReferences = Boolean(referenceProduct.trim() || referencePricing !== "unknown");
  let targetHost = "";
  const validatedDraftTarget = readEvaluationIntent(new URLSearchParams({ target: domain.trim() })).targetUrl;
  try { if (validatedDraftTarget) targetHost = new URL(validatedDraftTarget).hostname.toLowerCase(); } catch { /* An invalid target has no matching report. */ }
  const matchingSeoReports = seoReports?.ownerId === workspace.ownerId
    ? seoReports.reports.filter((report) => report.state === "complete" && report.domain === targetHost) : [];
  const targetAllowed = Boolean(targetHost && workspace.connection?.allowedTargets?.includes(targetHost));
  const activeSavedRun = workspace.runs.find((run) => activeRun(run) || run.status === "requires_action");
  const activeRunId = workspace.connection?.usage?.activeRunId ?? activeSavedRun?.id ?? null;
  const hasBudget = workspace.connection?.usage?.remainingLiveRuns == null || workspace.connection.usage.remainingLiveRuns > 0;
  const canLaunch = liveReady && targetAllowed && !activeRunId && hasBudget && !workspace.loading;
  const preflightTitle = workspace.isPending || (workspace.ownerId && workspace.loading) ? "Checking your workspace" : !workspace.ownerId ? "Sign in to run a private evaluation" : !workspace.connection?.configured ? "Evaluations are currently unavailable" : !workspace.connection.canRun ? "Runs are unavailable for this workspace" : activeRunId ? "Finish your saved session first" : !hasBudget ? "Your rolling 24-hour run allowance is used" : !targetAllowed ? "Choose an enabled website target" : "Ready to evaluate";
  const signInHref = `/login?next=${encodeURIComponent(pageEvaluationHref({ ...intent, targetUrl: domain, seoReportId: seoReportId || intent.seoReportId }))}`;
  const searchDataHref = validatedDraftTarget ? `/search-data?target=${encodeURIComponent(validatedDraftTarget)}` : "/search-data";

  function clearReferenceDraft() {
    setReferenceProduct(""); setReferencePricing("unknown"); setReferenceAmount("");
    setReferenceCurrency("USD"); setReferenceInterval("month"); setReferenceConfirmed(false);
    setSeoReportId(""); setPendingSeoIntent(null);
  }

  useEffect(() => { account.current = workspace.ownerId; return () => { account.current = null; }; }, [workspace.ownerId]);
  useEffect(() => { onTargetChange(current?.targetUrl ? readEvaluationIntent(new URLSearchParams({ target: current.targetUrl })).targetUrl : validatedDraftTarget); }, [current?.targetUrl, validatedDraftTarget, onTargetChange]);

  useEffect(() => {
    if (!editedTarget.current && !intent.targetUrl) setDomain(initialTargetUrl);
  }, [initialTargetUrl, intent.targetUrl]);

  useEffect(() => {
    const key = `${intent.targetUrl ?? ""}|${intent.seoReportId ?? ""}`;
    if (appliedIntent.current === key) return;
    appliedIntent.current = key;
    if (intent.targetUrl) {
      setDomain(intent.targetUrl); editedTarget.current = false;
      clearReferenceDraft();
      setNotice("Website prepared. Review the inputs, then start the evaluation when ready.");
    }
    if (intent.seoReportId) setPendingSeoIntent(intent.seoReportId);
  }, [intent.targetUrl, intent.seoReportId]);

  useEffect(() => {
    if (!workspace.ownerId) return;
    const ownerId = workspace.ownerId;
    const controller = new AbortController();
    evaluationRequest<{ reports: SeoReportSummary[] }>("/api/seo-reports", { signal: controller.signal })
      .then(({ reports }) => { if (!controller.signal.aborted && account.current === ownerId) { setSeoReports({ ownerId, reports }); setSeoReportsError(""); } })
      .catch(() => { if (!controller.signal.aborted && account.current === ownerId) setSeoReportsError("Saved SEO reports could not be loaded. You can run with the website capture alone."); });
    return () => controller.abort();
  }, [workspace.ownerId]);

  useEffect(() => {
    if (!pendingSeoIntent || !workspace.ownerId || seoReports?.ownerId !== workspace.ownerId) return;
    if (intent.targetUrl && domain !== intent.targetUrl) return;
    const matching = seoReports.reports.find((report) => report.id === pendingSeoIntent && report.state === "complete" && report.domain === targetHost);
    setSeoReportId(matching?.id ?? "");
    setPendingSeoIntent(null);
    setNotice(matching ? "Saved SEO evidence selected for this website. Review the inputs before starting; no provider call has been made." : "The linked SEO report is unavailable for this account or website. The evaluation will use the website capture alone.");
  }, [pendingSeoIntent, workspace.ownerId, seoReports, targetHost, intent.targetUrl, domain]);

  useEffect(() => {
    setError("");
    if (!workspace.ownerId || !selectedId) return;
    const controller = new AbortController();
    const ownerId = workspace.ownerId;
    evaluationRequest<{ run: EvaluationRun }>(`/api/evaluations/${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(({ run }) => { if (!controller.signal.aborted && account.current === ownerId) { if (run.id !== selectedId) throw new Error("The returned evaluation does not match the selected run."); setSelected({ ownerId, run }); } })
      .catch((failure) => { if (!controller.signal.aborted && account.current === ownerId) setError(failure.message); });
    return () => controller.abort();
  }, [workspace.ownerId, selectedId, savedRun?.revision, savedRun?.updatedAt]);

  useEffect(() => {
    if (selectedId && selectedId !== startedNoticeRun.current) setNotice("");
    startedNoticeRun.current = null;
  }, [selectedId]);

  async function demo() {
    setBusy("demo"); setError(""); setNotice("");
    try {
      const run = await createDemoEvaluationRun();
      if (selectedId) window.history.pushState(null, "", pageEvaluationHref({ targetUrl: domain }));
      setSelected({ ownerId: null, run, local: true });
      setNotice("Frozen demo verified locally. No agent run was started.");
    } catch { setError("The local fixture could not be verified in this browser."); }
    finally { setBusy(""); }
  }

  async function start(rerun?: EvaluationRun) {
    if (!workspace.ownerId || !liveReady || activeRunId || !hasBudget || (!rerun && !canLaunch)) return;
    const ownerId = workspace.ownerId;
    setBusy("start"); setError(""); setNotice("");
    try {
      const expectedFacts = !rerun && hasReferences ? {
        ...(referenceProduct.trim() ? { productName: referenceProduct.trim() } : {}),
        ...(referencePricing === "absent" ? { pricing: null } : referencePricing === "stated" ? {
          pricing: { amount: referenceAmount.trim() ? Number(referenceAmount) : NaN, currency: referenceCurrency, interval: referenceInterval },
        } : {}),
      } : undefined;
      if (expectedFacts) parseOwnerConfirmedExpectedFacts(expectedFacts, referenceConfirmed);
      if (!rerun && seoReportId && !matchingSeoReports.some((report) => report.id === seoReportId))
        throw new Error("Choose a saved SEO report for this website, or use the website capture alone.");
      const { run } = await evaluationRequest<{ run: EvaluationRun }>("/api/evaluations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: rerun?.targetUrl ?? domain.trim(), mode: "managed", ...(rerun ? { rerunOf: rerun.id } : { ...(expectedFacts ? { expectedFacts, confirmExpectedFacts: referenceConfirmed } : {}), ...(seoReportId ? { seoReportId } : {}) }) }),
      });
      if (account.current !== ownerId) return;
      setSelected({ ownerId, run });
      startedNoticeRun.current = run.id;
      window.history.pushState(null, "", pageEvaluationHref({ runId: run.id }));
      setNotice(run.status === "completed" ? "Run completed. Its returned evidence and verification checks are ready to inspect." : run.status === "failed" ? "The run was saved as failed. Inspect its error and captured evidence before starting another run." : run.status === "requires_action" ? "The run was saved and needs attention. Inspect its recorded returns and the available action below." : run.status === "cancelled" ? "The run was saved as cancelled. No completed evaluation is available." : run.sessionId ? "Run saved. Its managed session can continue while you explore Folio." : "Run reserved. Session preparation is not yet confirmed; refresh its saved state before retrying.");
      announceEvaluationUpdate();
    } catch (failure) {
      if (account.current === ownerId) setError(failure instanceof Error ? failure.message : "The run could not be started.");
    } finally { if (account.current === ownerId) setBusy(""); }
  }

  // Query selections are client state. Native history integrates with useSearchParams
  // without an unnecessary RSC fetch racing a newly saved evaluation.
  function prepareCurrentWebsite(run: EvaluationRun) {
    clearReferenceDraft();
    setDomain(run.targetUrl); editedTarget.current = true;
    appliedIntent.current = `${run.targetUrl}|`;
    setSelected(null); setError("");
    window.history.pushState(null, "", evaluationHref({ targetUrl: run.targetUrl }));
    setNotice("Fresh evaluation prepared for the current website. Reference answers and saved SEO evidence were cleared. Review the form, then explicitly start a new capture and managed run.");
    requestAnimationFrame(() => { document.getElementById("eval-domain")?.focus(); document.getElementById("eval-launch")?.scrollIntoView({ behavior: "smooth", block: "center" }); });
  }

  function compareRun(run: EvaluationRun) {
    window.history.pushState(null, "", evaluationHref({ runId: run.id, baselineId: run.id }));
    requestAnimationFrame(() => document.getElementById("eval-comparison-title")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function runAction(action: "refresh" | "cancel" | "export" | "tools") {
    if (!current) return;
    setBusy(action); setError("");
    const ownerId = workspace.ownerId;
    const runId = current.id;
    try {
      if (action === "export") {
        const bundle = selected?.local ? { format: "folio-local-demo-evaluation-bundle-v1", publication: "private", exportedAt: new Date().toISOString(), run: current, suite: EVAL_SUITE } :
          await evaluationRequest(`/api/evaluations/${encodeURIComponent(runId)}/export`);
        if (account.current !== ownerId) return;
        downloadEvaluation(bundle, `folio-evaluation-${runId}.json`);
        setNotice("Evidence bundle downloaded. It contains private source captures.");
      } else {
        const { run } = await evaluationRequest<{ run: EvaluationRun }>(
          `/api/evaluations/${encodeURIComponent(runId)}${action === "refresh" ? "/reconcile" : action === "tools" ? "/tools" : ""}`,
          { method: action === "cancel" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: action === "cancel" ? JSON.stringify({ action: "cancel" }) : "{}" },
        );
        if (account.current !== ownerId) return;
        setSelected({ ownerId, run }); announceEvaluationUpdate();
      }
    } catch (failure) { if (account.current === ownerId) setError(failure instanceof Error ? failure.message : "The request could not complete."); }
    finally { if (account.current === ownerId) setBusy(""); }
  }

  if (workspace.isPending) return <section className="eval-first-run" role="status"><Loader2 size={22} className="eval-spin" /><p>Checking your workspace…</p></section>;
  if (!workspace.ownerId && selectedId) return <section className="panel eval-private-access"><LockKeyhole size={22} /><h2>Sign in to open this private report</h2><p>Use the account that saved the evaluation. Your selection will be kept when you sign in.</p><Link className="button primary" href={signInHref}>Sign in to open report <ArrowRight size={14} /></Link></section>;

  return (
    <div className={`evaluations-panel ${current || selectedId ? "has-selection" : "is-preparing"}`}>
      {workspace.ownerId && <nav className="eval-history" aria-label="Your evaluation notebook"><div className="eval-notebook-heading"><span>Notebook <small>{workspace.runs.length}</small></span>{(current || selectedId) && <button type="button" className="button secondary" disabled={Boolean(busy)} onClick={() => { clearReferenceDraft(); setSelected(null); setDomain(""); editedTarget.current = true; setError(""); setNotice(""); window.history.pushState(null, "", "/evaluations?view=page"); requestAnimationFrame(() => document.getElementById("eval-domain")?.focus()); }}>New evaluation <ArrowRight size={13} /></button>}</div>{workspace.runs.length ? <div className="eval-history-list">{workspace.runs.map(run => <button key={run.id} type="button" className={current?.id === run.id ? "selected" : ""} aria-pressed={current?.id === run.id} onClick={() => { window.history.pushState(null, "", evaluationHref({ runId: run.id, baselineId: intent.baselineId })); setError(""); setNotice(""); }}><span><strong>{run.siteName || run.targetUrl}</strong><small>{evaluationDate(run.createdAt)} · {run.mode === "demo" ? "Local demo" : run.status === "completed" ? "Completed" : run.status === "failed" ? "Failed" : run.status === "cancelled" ? "Cancelled" : "In progress"}</small></span></button>)}</div> : <p>{workspace.loading ? "Loading saved evaluations…" : "Your saved evaluations will appear here."}</p>}</nav>}
      {(error || workspace.error) && <div className="eval-alert" role="alert"><Info size={16} />{error || workspace.error}</div>}
      {notice && <p className="eval-notice" role="status"><Check size={14} />{notice}</p>}
      {current ? <EvaluationReport key={current.id} run={current} busy={busy} onRefresh={selected?.local ? undefined : () => void runAction("refresh")} onCancel={selected?.local ? undefined : () => void runAction("cancel")} onReturnSeo={selected?.local ? undefined : () => void runAction("tools")} onExport={() => void runAction("export")} onRerun={current.mode === "demo" ? () => void demo() : liveReady && !activeRunId && hasBudget ? () => void start(current) : undefined} onPrepareFresh={current.mode === "live" ? () => prepareCurrentWebsite(current) : undefined} onCompare={selected?.local || current.status !== "completed" ? undefined : () => compareRun(current)} onDeleted={selected?.local ? undefined : (id) => { setSelected((value) => value?.run.id === id ? null : value); if (selectedId === id) window.history.replaceState(null, "", pageEvaluationHref({ targetUrl: domain })); setNotice("Saved evidence deleted from Folio. Existing downloads and remote provider records are unchanged."); announceEvaluationUpdate(); }} /> : selectedId && workspace.ownerId ? <section className="eval-first-run" aria-label="Loading selected evaluation"><Loader2 className="eval-spin" size={25} /><h2>{error ? "This evaluation could not be opened." : "Opening your selected evaluation…"}</h2><p>{error ? "Choose another saved run from your notebook, or prepare a fresh evaluation." : "Loading this account’s private record. The previous run is hidden while the selection changes."}</p></section> : null}
      {!current && !(selectedId && workspace.ownerId) && <>
      <section className="panel eval-suite" aria-labelledby="eval-suite-title">
        <div className="eval-section-top"><div><h2 id="eval-suite-title">New evaluation</h2><p>Capture this page and verify the returned facts against your references.</p></div></div>
        <form id="eval-launch" className="eval-launch" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <label htmlFor="eval-domain">Website to evaluate</label>
          <div className="eval-input-row"><div className="eval-input"><Globe2 size={16} /><input id="eval-domain" name="domain" value={domain} onChange={(event) => { editedTarget.current = true; setDomain(event.target.value); setReferenceConfirmed(false); setSeoReportId(""); setPendingSeoIntent(null); }} autoComplete="url" inputMode="url" maxLength={2048} placeholder="your-website.com" required disabled={Boolean(busy)} /></div><button className="button primary" disabled={!canLaunch || Boolean(busy) || !domain.trim() || (hasReferences && !referenceConfirmed)} type="submit">{busy === "start" ? <Loader2 size={14} className="eval-spin" /> : <Play size={13} />}Run evaluation</button><button className="button secondary" type="button" onClick={() => void demo()} disabled={Boolean(busy)}>{busy === "demo" ? <Loader2 size={14} className="eval-spin" /> : <FlaskConical size={14} />}Try reproducible demo</button></div>
          <div className="eval-preflight" role="region" aria-label="Evaluation preflight"><div><span>{canLaunch ? <Check size={17} /> : <Info size={17} />}</span><div><h3>{preflightTitle}</h3><p>{!workspace.ownerId ? "The reproducible demo is available now. Private runs require a signed-in workspace." : activeRunId ? <>Review, refresh or cancel your <Link href={evaluationHref({ runId: activeRunId })}>saved session</Link> before spending credits on another run.</> : !hasBudget ? "Every reserved live attempt counts, including failures and deleted reports. You can continue inspecting your saved evidence." : !targetAllowed && workspace.connection?.configured ? "This website is not currently enabled for evaluation." : "Starting creates a new private record and can incur usage charges. Opening this page or changing inputs starts nothing."}</p></div>{workspace.ownerId && <button type="button" onClick={workspace.refresh} disabled={Boolean(busy)} aria-label="Refresh agent connection"><RefreshCw size={14} /></button>}</div>{workspace.connection?.usage && <p className="eval-preflight-budget">{workspace.connection.usage.remainingLiveRuns === null ? "No daily limit" : `${workspace.connection.usage.remainingLiveRuns} live ${workspace.connection.usage.remainingLiveRuns === 1 ? "attempt" : "attempts"} remaining in the rolling 24-hour allowance`} · {workspace.connection.usage.liveAttemptsLast24Hours} reserved</p>}</div>
          <details className="eval-reference-form">
            <summary><FileCheck2 size={14} />Optional reference answers<ChevronDown size={14} /></summary>
            <div>
              <p>Provide answers you have checked for this page. They stay private and are withheld from the agent, then compared with its return. Your confirmation supplies a reference; Folio does not independently establish that it is true.</p>
              <fieldset disabled={Boolean(busy)}>
                <legend className="sr-only">Owner-confirmed reference answers</legend>
                <div className="eval-reference-fields">
                  <label htmlFor="eval-reference-product">Expected product name<input id="eval-reference-product" maxLength={200} value={referenceProduct} placeholder="Leave blank if unknown" onChange={(event) => { editedTarget.current = true; setReferenceProduct(event.target.value); setReferenceConfirmed(false); }} /></label>
                  <label htmlFor="eval-reference-pricing">Pricing reference<select id="eval-reference-pricing" value={referencePricing} onChange={(event) => { editedTarget.current = true; setReferencePricing(event.target.value as typeof referencePricing); setReferenceConfirmed(false); }}><option value="unknown">Not supplied · leave unmeasured</option><option value="stated">A price is stated</option><option value="absent">This page states no price</option></select></label>
                </div>
                {referencePricing === "stated" && <div className="eval-reference-price">
                  <label htmlFor="eval-reference-amount">Expected amount<input id="eval-reference-amount" type="number" min={0} max={MAX_REFERENCE_PRICE} step="any" required value={referenceAmount} onChange={(event) => { editedTarget.current = true; setReferenceAmount(event.target.value); setReferenceConfirmed(false); }} /></label>
                  <label htmlFor="eval-reference-currency">Currency code<input id="eval-reference-currency" maxLength={3} pattern="[A-Z]{3}" required value={referenceCurrency} onChange={(event) => { editedTarget.current = true; setReferenceCurrency(event.target.value.toUpperCase()); setReferenceConfirmed(false); }} /></label>
                  <label htmlFor="eval-reference-interval">Billing interval<select id="eval-reference-interval" value={referenceInterval} onChange={(event) => { editedTarget.current = true; setReferenceInterval(event.target.value); setReferenceConfirmed(false); }}>{REFERENCE_PRICE_INTERVALS.map((interval) => <option key={interval} value={interval}>{interval === "one-time" ? "One-time" : `Per ${interval}`}</option>)}</select></label>
                </div>}
                {referencePricing === "absent" && <p className="eval-reference-explanation">This is an explicit absence reference. A returned price fails the check; abstaining keeps pricing unmeasured.</p>}
                {hasReferences && <label className="eval-reference-confirm"><input type="checkbox" checked={referenceConfirmed} onChange={(event) => { editedTarget.current = true; setReferenceConfirmed(event.target.checked); }} />I reviewed these reference answers for this website.</label>}
              </fieldset>
              <p className="eval-reference-explanation">Reruns retain the original references and frozen captures. Start a fresh run to use different answers.</p>
            </div>
          </details>
          {workspace.ownerId && <details className="eval-options" open={Boolean(seoReportId || pendingSeoIntent)}><summary>Saved SEO evidence<ChevronDown size={14} /></summary><div className="eval-saved-seo"><label htmlFor="eval-seo-report">Saved SEO evidence <span>Optional</span></label><select id="eval-seo-report" value={matchingSeoReports.some((report) => report.id === seoReportId) ? seoReportId : ""} disabled={Boolean(busy)} onChange={(event) => { editedTarget.current = true; setSeoReportId(event.target.value); setPendingSeoIntent(null); }}><option value="">Use the website capture alone</option>{matchingSeoReports.map((report) => <option key={report.id} value={report.id}>{report.domain} · {evaluationDate(report.createdAt)} · {report.status}</option>)}</select><p>{seoReportsError || (matchingSeoReports.length ? "Attach a private saved report for this website. Its organic and backlink observations are frozen with the run; selecting it performs no new paid lookup." : <>No saved reports match this website. Save a lookup in <Link href={searchDataHref}>Search & backlinks</Link>, then return here to use its observations.</>)}</p></div></details>}
          {(!liveReady || workspace.loading || workspace.isPending) && <div className="eval-connection-note"><Info size={14} /><p>{workspace.isPending ? "Checking your workspace…" : !workspace.ownerId ? <>Live evaluations use a private API-agent session. <Link href={signInHref}>Sign in to connect your workspace <ArrowUpRight size={12} /></Link></> : workspace.loading ? "Checking evaluation availability…" : liveReady ? null : "New evaluations are currently unavailable for this workspace. You can still inspect saved evidence or try the local demo."}</p></div>}

          <p className="eval-launch-note">The demo checks a frozen fictional website locally, without a model call.</p>
          <details className="eval-options eval-preparation-method"><summary>What this evaluation checks<ChevronDown size={14} /></summary><div><p>{EVAL_SUITE.description}</p><ul>{EVAL_SUITE.tasks.map(task => <li key={task.id}><strong>{task.label}</strong><p>{task.description}</p></li>)}</ul><p>Suite: {EVAL_SUITE.version}. Missing references remain unmeasured.</p></div></details>
        </form>
      </section>

      </>}
      {workspace.ownerId && <details className="eval-comparison-disclosure" open={Boolean(intent.baselineId)}><summary>Compare saved evaluations<ChevronDown size={14} /></summary><EvaluationComparison runs={workspace.runs} ownerId={workspace.ownerId} initialBaselineId={intent.baselineId} /></details>}
      <p className="eval-privacy"><LockKeyhole size={13} />Evaluations and captured sources stay private. They are never added to the public index automatically.</p>
    </div>
  );
}

export function EvaluationReport({ run, busy = "", onRefresh, onCancel, onExport, onRerun, onDeleted, onReturnSeo, onPrepareFresh, onCompare }: {
  run: EvaluationRun; busy?: string; onRefresh?: () => void; onCancel?: () => void; onExport?: () => void; onRerun?: () => void; onDeleted?: (id: string) => void; onReturnSeo?: () => void; onPrepareFresh?: () => void; onCompare?: () => void;
}) {
  const [tab, setTab] = useState<ReportTab>(run.status === "completed" && run.result ? "checks" : "activity");
  const previousResult = useRef(run.status === "completed" && Boolean(run.result));
  useEffect(() => { const complete = run.status === "completed" && Boolean(run.result); if (complete && !previousResult.current) setTab("checks"); previousResult.current = complete; }, [run.result, run.status]);
  const [filter, setFilter] = useState("all");
  const result = run.status === "completed" ? run.result : null;
  const captures = run.captures ?? [];
  const returnSeoAvailable = run.status === "requires_action" && captures.some((capture) => capture.kind === "seo-report") && run.events.some((event) => event.id === "provider-state" && event.data?.savedSeoToolAvailable === true) && !run.events.some((event) => event.id.startsWith("saved-seo-tool-"));
  const inProgress = activeRun(run) || run.status === "requires_action";
  const missingReferences = result?.checks.filter(check => check.status === "unmeasured" && ((check.id === "product-understanding" && !run.expectedFacts?.productName) || (check.id === "pricing-extraction" && run.expectedFacts?.pricing === undefined))).map(check => check.id === "product-understanding" ? "Product name" : "Pricing") ?? [];
  const checks = result?.checks.filter((check) => filter === "all" || check.status === filter) ?? [];
  const evidence = (id: string) => { setTab("evidence"); requestAnimationFrame(() => document.getElementById(`evidence-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
  return <section className={`panel eval-report ${result ? "is-complete" : "is-running"}`} aria-labelledby="eval-report-title">
    <div className="eval-report-top"><div><span className="eval-report-kind">{run.mode === "demo" ? "Reproducible demo · fictional website" : "Private evaluation"}</span><h2 id="eval-report-title">{run.siteName || run.targetUrl}</h2><p>{run.targetUrl}</p></div><RunStatus status={run.status} /></div>
    <div className="eval-report-actions">
      {inProgress ? <>{onRefresh && <button className="button primary" type="button" onClick={onRefresh} disabled={Boolean(busy)}><RefreshCw size={14} />Refresh returns</button>}{onCancel && <button className="button secondary" type="button" onClick={onCancel} disabled={Boolean(busy)}>Cancel run</button>}<button className="button secondary" type="button" onClick={() => setTab("evidence")}>View captured sources</button></> : <>{onExport && <button className="button primary" type="button" onClick={onExport} disabled={Boolean(busy)}><ArrowDownToLine size={14} />Download evidence</button>}{onPrepareFresh && <button className="button secondary" type="button" onClick={onPrepareFresh} disabled={Boolean(busy)}>Evaluate current website</button>}{onCompare && <button className="button secondary" type="button" onClick={onCompare} disabled={Boolean(busy)}>Compare this run</button>}</>}
      <details className="eval-more-actions"><summary>More actions<ChevronDown size={14} /></summary><div>
        {inProgress && onExport && <button className="button secondary" type="button" onClick={onExport} disabled={Boolean(busy)}>Download evidence</button>}
        {!inProgress && onRefresh && <button className="button secondary" type="button" onClick={onRefresh} disabled={Boolean(busy)}>Refresh returns</button>}
        {onRerun && !inProgress && <><p>{run.mode === "demo" ? "Replay the fictional fixture locally." : "A frozen replay starts a new paid session with these saved captures and references."}</p><button className="button secondary" type="button" onClick={onRerun} disabled={Boolean(busy)}><Play size={12} />{run.mode === "demo" ? "Replay local demo" : "Replay frozen evidence"}</button></>}
        {onDeleted && <DeleteEvaluation run={run} onDeleted={onDeleted} />}
        {run.mode === "live" && <Link href={`/agents?run=${encodeURIComponent(run.id)}`}>Open agent activity<ArrowUpRight size={12} /></Link>}
      </div></details>
    </div>
    {run.error && <p className="eval-run-error" role="alert">{run.error}</p>}
    {returnSeoAvailable && onReturnSeo && <div className="eval-tool-approval"><div><h3>The agent requested your saved SEO evidence.</h3><p>Returning this frozen report resumes the agent and can incur usage charges. It performs no new search-data lookup.</p></div><button type="button" className="button primary" disabled={Boolean(busy)} onClick={onReturnSeo}>{busy === "tools" ? <Loader2 size={13} className="eval-spin" /> : <Play size={13} />}Return saved SEO evidence</button></div>}
    {result ? <div className="eval-report-summary"><div className="eval-summary-copy"><h3>Evidence verification</h3><p>{result.failed > 0 ? `${result.failed} measured ${result.failed === 1 ? "check needs" : "checks need"} review.` : result.measured > 0 ? "All measured checks passed." : "No checks could be measured."} {result.unmeasured > 0 ? `${result.unmeasured} ${result.unmeasured === 1 ? "check remains" : "checks remain"} unmeasured.` : ""}</p>{missingReferences.length > 0 && <p className="eval-missing-references">Independent reference answers are needed to measure {missingReferences.join(" and ").toLowerCase()} accuracy. Prepare a new evaluation to add them; this saved result stays unchanged.</p>}<small>The measured checks describe this saved answer, not search rank or recommendation frequency.</small></div><div className="eval-result-counts" aria-label="Verification outcomes"><div><strong>{result.passed}</strong><span>Passed</span></div><div><strong>{result.failed}</strong><span>Failed</span></div><div><strong>{result.unmeasured}</strong><span>Unmeasured</span></div></div><div className="eval-verification-score"><strong>{result.verificationScore === null ? "Unmeasured" : `${result.verificationScore}%`}</strong><p>{result.passed} of {result.measured} measured checks passed</p><small>{result.unmeasured} unmeasured checks remain outside that percentage.</small></div></div> : <EvaluationProgress run={run} />}
    <div className="eval-report-metadata"><span>{run.mode === "demo" ? "Local verifier · no model call" : "API-agent observation"}</span><span>{run.suiteVersion}</span><span>{result ? "Completed" : "Requested"} {evaluationDate(result ? run.updatedAt : run.createdAt)}</span></div>
    <div className="eval-report-toolbar"><div className="eval-report-tabs" role="tablist" aria-label="Evaluation report sections">{REPORT_TABS.map((item, index) => <button id={`eval-tab-${item.id}`} role="tab" type="button" key={item.id} aria-selected={tab === item.id} aria-controls={`eval-pane-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const target = event.key === "Home" ? 0 : event.key === "End" ? REPORT_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + REPORT_TABS.length) % REPORT_TABS.length; setTab(REPORT_TABS[target].id); document.getElementById(`eval-tab-${REPORT_TABS[target].id}`)?.focus(); }}>{item.label}{item.id === "evidence" && <span>{captures.length}</span>}</button>)}</div></div>
    <div className="eval-report-body" id={`eval-pane-${tab}`} role="tabpanel" aria-labelledby={`eval-tab-${tab}`} tabIndex={0}>
      {tab === "checks" && <><div className="eval-check-heading"><h3>Verification checks</h3><label>Show <select aria-label="Filter verification checks" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All checks</option><option value="pass">Passed</option><option value="fail">Failed</option><option value="unmeasured">Unmeasured</option></select></label></div>{checks.length ? <div className="eval-check-groups">{(["fail", "unmeasured", "pass"] as const).map(outcome => {
        const group = checks.filter(check => check.status === outcome);
        return group.length > 0 && <section className="eval-check-group" key={outcome}><h4>{outcome === "fail" ? "Needs review" : outcome === "unmeasured" ? "Not measured" : "Passed checks"}<span>{group.length}</span></h4><div className="eval-check-list">{group.map(check => <details className="eval-check" key={check.id}><summary><span className={`eval-check-indicator ${check.status}`}>{check.status === "pass" ? <Check size={14} /> : check.status === "fail" ? <Info size={14} /> : <CircleDashed size={14} />}</span><span>{check.label}</span><RunStatus status={check.status} /><ChevronDown className="eval-disclosure-arrow" size={15} /></summary><div className="eval-check-content"><dl><div><dt>Expected</dt><dd>{check.expected}</dd></div><div><dt>Observed</dt><dd>{check.actual}</dd></div></dl><p>{check.detail}</p>{check.evidenceIds.length > 0 && <div className="eval-evidence-links">{[...new Set(check.evidenceIds)].map(id => <button type="button" key={id} onClick={() => evidence(id)}><FileCheck2 size={12} />{id}<ArrowUpRight size={12} /></button>)}</div>}</div></details>)}</div></section>;
      })}</div> : <p className="eval-empty-section">{result ? "No checks match this filter." : "Checks appear once the returned output has been verified."}</p>}</>}

      {tab === "evidence" && <><div className="eval-check-heading"><div><h3>Captured sources</h3><p>Read the saved text and exact quoted excerpts.</p></div><Fingerprint size={20} /></div>{captures.length ? <div className="eval-evidence-list">{captures.map((capture) => <EvidenceCard key={capture.id} capture={capture} citations={result?.citations.filter((citation) => citation.evidenceId === capture.id).map((citation) => citation.quote) ?? []} />)}</div> : <p className="eval-empty-section">No source captures have been returned for this run.</p>}</>}
      {tab === "findings" && <div className="eval-findings">{result && <section className="eval-agent-summary"><h3>Agent summary</h3><p>{result.summary}</p><small>This is the agent’s description. Independent verification outcomes are shown in Verification checks.</small></section>}<h3>Agent findings</h3><p>These findings are the agent’s interpretation. Exact quote matching establishes occurrence in a source, not semantic or factual support.</p>{result?.findings.length ? <ul>{result.findings.map((finding,index) => <li key={`${finding.dimension}-${index}`}><div><h4>{finding.dimension}</h4><span>{finding.status === "supported" ? "Agent marked supported" : "Unmeasured"}</span></div><p>{finding.explanation}</p><p><strong>Next step:</strong> {finding.recommendation}</p>{finding.evidenceIds.map(id => <button key={id} type="button" onClick={() => evidence(id)}>Read {id}<ArrowUpRight size={12} /></button>)}</li>)}</ul> : <p>No verified findings have been recorded.</p>}</div>}
      {tab === "activity" && <EvaluationActivity run={run} />}
      {tab === "methodology" && <div className="eval-methodology"><h3>Method and limits</h3><p>This run uses the frozen <code>{run.suiteVersion}</code> suite. Download the report to keep its input captures, output and verification checks together. Re-running creates a separate record.</p><ol>{(result?.limitations.length ? result.limitations : EVAL_SUITE.limitations).map((limit) => <li key={limit}>{limit}</li>)}</ol><div><Fingerprint size={17} /><p>Hashes identify captured UTF-8 text. They help detect changes; they are not independent proof of the source’s truth or capture time.</p></div><details className="eval-reference-report"><summary><FileCheck2 size={14} />{run.expectedFacts?.source === "owner-confirmed" ? "Owner-confirmed reference answers" : run.expectedFacts?.source === "fixture" ? "Frozen fixture reference answers" : "No reference answers supplied"}<ChevronDown size={14} /></summary><div><dl><div><dt>Product name</dt><dd>{run.expectedFacts?.productName ?? "Not supplied · accuracy unmeasured"}</dd></div><div><dt>Pricing</dt><dd>{run.expectedFacts?.pricing === undefined ? "Not supplied · accuracy unmeasured" : run.expectedFacts.pricing === null ? "No price stated · explicit absence reference" : `${run.expectedFacts.pricing.amount} ${run.expectedFacts.pricing.currency} / ${run.expectedFacts.pricing.interval}`}</dd></div></dl><p>{run.expectedFacts?.source === "owner-confirmed" ? "Confirmed by the account that created this run; not independently established by Folio. These answers were withheld from the agent and preserved for reruns." : run.expectedFacts?.source === "fixture" ? "Authored with the fictional demonstration. These are fixture answers, not an external attestation." : "Without reference answers, product and price accuracy remain unmeasured. Source integrity and citations can still be checked."}</p></div></details></div>}
    </div>
    <footer className="eval-report-footer"><span><LockKeyhole size={13} />{run.mode === "demo" ? "Illustrative fixture, verified in your browser" : "Saved privately with its source evidence"}</span></footer>
  </section>;
}

function EvaluationProgress({ run }: { run: EvaluationRun }) {
  const [now, setNow] = useState(() => Date.now());
  const terminal = ["completed", "failed", "cancelled"].includes(run.status);
  useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [terminal]);
  const events = run.events ?? [];
  const root = events.find(event => event.id === "provider-state")?.data;
  const sourceReady = run.captures.some(capture => capture.kind === "page" && capture.content.length > 0 && Boolean(capture.sha256));
  const taskAccepted = run.mode === "live" && Boolean(run.sessionId) && (events.some(event => event.id === "input-accepted") ||
    (typeof root?.turnId === "string" && typeof root.turnStatus === "string" && ["queued", "in_progress", "waiting", "completed", "failed", "cancelled"].includes(root.turnStatus)));
  const answerReturned = Boolean(run.agentOutput || run.result) || events.some(event => event.type === "message" && event.status === "completed" && event.data?.phase === "final_answer" &&
    typeof root?.turnId === "string" && event.data.turnId === root.turnId && root.turnStatus === "completed");
  const preparedFailure = run.mode === "live" && run.status === "failed" && !run.sessionId && !events.some(event => ["session-create-attempt", "input-uncertain"].includes(event.id));
  const end = terminal ? Date.parse(run.updatedAt) : now;
  const seconds = Math.max(0, Math.floor((end - Date.parse(run.createdAt)) / 1000));
  const elapsed = Number.isFinite(seconds) ? `${Math.floor(seconds / 3600) ? `${Math.floor(seconds / 3600)}h ` : ""}${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : "Not available";
  const milestones = [
    { label: "Evidence prepared", done: sourceReady },
    { label: run.mode === "demo" ? "Fixture answer supplied" : "Task accepted", done: run.mode === "demo" ? answerReturned : taskAccepted },
    { label: "Answer returned", done: answerReturned },
    { label: "Checks completed", done: run.status === "completed" && Boolean(run.result) },
  ];
  return <section className="eval-progress" aria-label="Evaluation progress"><div className="eval-progress-heading"><div><h3>{run.status === "queued" ? "Evaluation queued" : run.status === "running" ? "Evaluation in progress" : run.status === "requires_action" ? "Review required" : preparedFailure ? "Preparation failed" : run.status === "cancelled" ? "Evaluation cancelled" : "No verified report was produced"}</h3><p>{activeRun(run) ? "Folio retrieves the saved task while this page is visible. Recorded returns appear below." : run.status === "requires_action" ? "Inspect the saved activity before continuing. A cancellation request is not confirmation that work stopped." : "Inspect the recorded activity and captured sources before deciding what to do next."}</p></div><dl><div><dt>{terminal ? "Elapsed to recorded outcome" : "Elapsed since start"}</dt><dd>{elapsed}</dd></div><div><dt>Last updated</dt><dd>{evaluationDate(run.updatedAt)}</dd></div></dl></div><ol className="eval-milestones" aria-label="Recorded progress">{milestones.map(item => <li key={item.label} data-complete={item.done}><span>{item.done ? <Check size={15} /> : <CircleDashed size={15} />}</span><div><strong>{item.label}</strong><small>{item.done ? "Recorded" : "Not recorded"}</small></div></li>)}</ol><p className="eval-progress-note">Elapsed time starts at the saved request, not at model execution. Milestones reflect recorded evidence only.</p></section>;
}

function EvidenceCard({ capture, citations }: { capture: EvidenceCapture; citations: string[] }) {
  const sourceUrl = /^https?:\/\//i.test(capture.url) ? capture.url : null;
  return <article id={`evidence-${capture.id}`} className="eval-evidence-card"><div className="eval-evidence-top"><span className="eval-version"><FileCheck2 size={12} />{capture.id}</span><span>{capture.transport === "fixture" ? "Frozen demo fixture" : "Captured source"}</span></div><h4>{sourceUrl && capture.transport !== "fixture" ? <a href={sourceUrl} target="_blank" rel="noreferrer">{capture.url}<ExternalLink size={12} /></a> : capture.url}</h4><p className="eval-capture-date">{evaluationDate(capture.capturedAt)} · {capture.content.length.toLocaleString()} characters · {capture.kind}</p>{citations.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}<details><summary><Code2 size={13} />Read captured text<ChevronDown size={13} /></summary><pre>{capture.content}</pre></details><details className="eval-capture-identity"><summary>Capture identity and limits<ChevronDown size={13} /></summary><div className="eval-hash"><Fingerprint size={13} /><div><span>SHA-256 · UTF-8 TEXT</span><code>{capture.sha256}</code></div></div><p className="eval-source-limit">A matching quote establishes that the text occurs in this capture; it does not establish factual truth or that the source supports the conclusion. The hash identifies saved UTF-8 text, not an independently trusted source or capture time.</p></details></article>;
}

export function EvaluationActivity({ run }: { run: EvaluationRun }) {
  const events = run.events ?? [];
  const toolCount = events.filter((event) => event.type === "tool").length;
  const messageCount = events.filter((event) => event.type === "message").length;
  return <div className="eval-activity"><div className="eval-check-heading"><div><h3>{run.mode === "demo" ? "Local verification activity" : "From the managed session"}</h3><p>{run.mode === "demo" ? "This fixture did not start a remote agent session." : "Recorded session events and returned artifacts."}</p></div><Bot size={22} /></div>{run.sessionId && <div className="eval-session-id"><span>SESSION</span><code>{run.sessionId}</code>{run.providerStatus && <small>{run.providerStatus}</small>}</div>}<details className="eval-event-group" open><summary><span><Code2 size={14} />{toolCount} tool {toolCount === 1 ? "return" : "returns"}, {messageCount} {messageCount === 1 ? "message" : "messages"}<small>{events.length} recorded events</small></span><ChevronDown size={15} /></summary><div className="eval-event-list">{events.length ? events.map((event) => <details className="eval-event" key={event.id}><summary><span className={`eval-event-dot ${event.status ?? "completed"}`} /><span><strong>{event.title}</strong><small>{event.type} · {evaluationDate(event.at)}{event.status ? ` · ${event.status}` : ""}</small></span><ChevronDown size={14} /></summary><div>{event.detail ? <p>{event.detail}</p> : <p>No further returned detail is available for this event.</p>}{event.data && Object.keys(event.data).length > 0 && <pre>{JSON.stringify(event.data, null, 2)}</pre>}</div></details>) : <p className="eval-empty-section">The session has not returned any recorded events yet.</p>}</div></details>{run.usage && <details className="eval-usage"><summary><Clock3 size={13} />Reported session usage<ChevronDown size={13} /></summary><pre>{JSON.stringify(run.usage, null, 2)}</pre></details>}<p className="eval-activity-note">Only recorded events and returned data are shown. Missing tool activity or usage stays unreported.</p></div>;
}
