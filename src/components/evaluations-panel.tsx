"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown,
  CircleDashed, Clock3, Code2, Copy, ExternalLink, FileCheck2, Fingerprint,
  FlaskConical, Globe2, Info, Loader2, LockKeyhole, Play, RefreshCw, ShieldCheck,
} from "lucide-react";
import { EVAL_SUITE, type EvaluationRun, type EvidenceCapture } from "@/lib/evals";
import { createDemoEvaluationRun } from "@/lib/eval-verifier";
import { MAX_REFERENCE_PRICE, parseOwnerConfirmedExpectedFacts, REFERENCE_PRICE_INTERVALS } from "@/lib/expected-facts";
import type { SeoReportSummary } from "@/lib/seo-store";
import { DeleteEvaluation } from "./delete-evaluation";
import { EvaluationComparison } from "./evaluation-comparison";
import { evaluationHref, readEvaluationIntent } from "@/lib/evaluation-navigation";
import {
  activeRun, announceEvaluationUpdate, downloadEvaluation, evaluationDate,
  evaluationRequest, RunStatus, useEvaluationWorkspace,
} from "./evaluation-workspace";
import "./evaluations-panel.css";

type ReportTab = "checks" | "evidence" | "activity" | "methodology";
const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "checks", label: "Verification checks" },
  { id: "evidence", label: "Source evidence" },
  { id: "activity", label: "Agent returns" },
  { id: "methodology", label: "Methodology" },
];

export function EvaluationsPanel({ initialTargetUrl = "example.com" }: { initialTargetUrl?: string }) {
  const workspace = useEvaluationWorkspace();
  // Remount drafts and private detail synchronously when the authenticated owner
  // changes. An effect-only reset can briefly paint the previous account's data.
  return <EvaluationWorkspacePanel key={workspace.ownerId ?? "anonymous"} initialTargetUrl={initialTargetUrl} workspace={workspace} />;
}

function EvaluationWorkspacePanel({ initialTargetUrl, workspace }: { initialTargetUrl: string; workspace: ReturnType<typeof useEvaluationWorkspace> }) {
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
  const hasBudget = workspace.connection?.usage?.remainingLiveRuns === undefined || workspace.connection.usage.remainingLiveRuns > 0;
  const canLaunch = liveReady && targetAllowed && !activeRunId && hasBudget && !workspace.loading;
  const workflowStep = intent.baselineId ? 4 : current?.status === "completed" ? 3 : current && (activeRun(current) || current.status === "requires_action") ? 2 : 1;
  const preflightTitle = workspace.isPending || (workspace.ownerId && workspace.loading) ? "Checking your workspace" : !workspace.ownerId ? "Sign in to run a private evaluation" : !workspace.connection?.configured ? "Connect the managed Agents API" : !workspace.connection.canRun ? "Enable managed runs for your account" : activeRunId ? "Finish your saved session first" : !hasBudget ? "Your rolling 24-hour run allowance is used" : !targetAllowed ? "Choose an enabled website target" : "Ready for your explicit start";
  const signInHref = `/login?next=${encodeURIComponent(evaluationHref({ ...intent, targetUrl: domain, seoReportId: seoReportId || intent.seoReportId }))}`;
  const searchDataHref = validatedDraftTarget ? `/search-data?target=${encodeURIComponent(validatedDraftTarget)}` : "/search-data";

  function clearReferenceDraft() {
    setReferenceProduct(""); setReferencePricing("unknown"); setReferenceAmount("");
    setReferenceCurrency("USD"); setReferenceInterval("month"); setReferenceConfirmed(false);
    setSeoReportId(""); setPendingSeoIntent(null);
  }

  useEffect(() => { account.current = workspace.ownerId; return () => { account.current = null; }; }, [workspace.ownerId]);

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

  async function demo() {
    setBusy("demo"); setError(""); setNotice("");
    try {
      const run = await createDemoEvaluationRun();
      if (selectedId) window.history.pushState(null, "", evaluationHref({ targetUrl: domain }));
      setSelected({ ownerId: null, run, local: true });
      setNotice("Frozen demo verified locally. No OpenAI request was made.");
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
      window.history.pushState(null, "", evaluationHref({ runId: run.id }));
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

  return (
    <div className="evaluations-panel">
      <section className="eval-intro panel" aria-labelledby="eval-intro-title">
        <div className="eval-intro-copy">
          <span className="eval-eyebrow">A LITTLE LESS GUESSWORK</span>
          <h2 id="eval-intro-title">Every finding.<br /><em>Something to stand on.</em></h2>
          <p>Give a managed agent a captured website. Check what it understood against the source, and keep the evidence behind every result.</p>
          <div className="eval-intro-tags"><span><Fingerprint size={14} /> Frozen source captures</span><span><LockKeyhole size={13} /> Private by default</span></div>
        </div>
        <div className="eval-specimen" aria-label="Evaluation process">
          <span className="eval-specimen-number">FIG. 01 / THE EVIDENCE TRAIL</span>
          <div><span className="eval-specimen-icon"><Globe2 size={23} /></span><i /><span className="eval-specimen-icon"><Bot size={23} /></span><i /><span className="eval-specimen-icon final"><FileCheck2 size={23} /></span></div>
          <ol><li>Capture the source</li><li>Read with an agent</li><li>Verify the return</li></ol>
          <p>A conclusion you can inspect, with the inputs to check it again.</p>
        </div>
      </section>

      <ol className="eval-workflow" aria-label="Evaluation workflow">
        {[{ title: "Prepare", detail: "Website, references and saved SEO" }, { title: "Run", detail: "Start an explicit managed session" }, { title: "Inspect", detail: "Check returns against their sources" }, { title: "Improve & compare", detail: "Capture changes or replay frozen inputs" }].map((step, index) => <li key={step.title} aria-current={workflowStep === index + 1 ? "step" : undefined}><span>{workflowStep > index + 1 ? <Check size={14} /> : `0${index + 1}`}</span><div><strong>{step.title}</strong><small>{step.detail}</small></div></li>)}
      </ol>

      <section className="panel eval-suite" aria-labelledby="eval-suite-title">
        <div className="eval-section-top">
          <div><span className="eval-eyebrow">THE STARTING SUITE</span><h2 id="eval-suite-title">{EVAL_SUITE.name}</h2><p>{EVAL_SUITE.description}</p></div>
          <span className="eval-version"><FlaskConical size={13} />{EVAL_SUITE.version}</span>
        </div>
        <div className="eval-suite-tasks">{EVAL_SUITE.tasks.map((task, index) => <div key={task.id}><span className="eval-task-number">0{index + 1}</span><div><h3>{task.label}</h3><p>{task.description}</p></div></div>)}</div>
        <form id="eval-launch" className="eval-launch" onSubmit={(event) => { event.preventDefault(); void start(); }}>
          <div className="eval-preflight" role="region" aria-label="Evaluation preflight"><div><span>{canLaunch ? <Check size={17} /> : <Info size={17} />}</span><div><h3>{preflightTitle}</h3><p>{!workspace.ownerId ? "The reproducible demo is available now. Private runs require a signed-in workspace." : activeRunId ? <>Review, refresh or cancel your <Link href={evaluationHref({ runId: activeRunId })}>saved session</Link> before spending credits on another run.</> : !hasBudget ? "Every reserved live attempt counts, including failures and deleted reports. You can continue inspecting your saved evidence." : !targetAllowed && workspace.connection?.configured ? "A server administrator controls which exact hostnames Folio may capture." : "Starting creates a new private record and can use OpenAI credits. Opening this page or changing inputs starts nothing."}</p></div></div><ul><li data-ready={Boolean(workspace.ownerId)}><i />Signed-in account</li><li data-ready={Boolean(workspace.connection?.configured)}><i />API configured</li><li data-ready={liveReady}><i />Account access</li><li data-ready={targetAllowed}><i />Allowed target</li></ul>{workspace.connection?.usage && <p className="eval-preflight-budget">{workspace.connection.usage.remainingLiveRuns} live {workspace.connection.usage.remainingLiveRuns === 1 ? "attempt" : "attempts"} remaining in the rolling 24-hour allowance · {workspace.connection.usage.liveAttemptsLast24Hours} reserved</p>}</div>
          <label htmlFor="eval-domain">Website to evaluate</label>
          <div className="eval-input-row"><div className="eval-input"><Globe2 size={16} /><input id="eval-domain" name="domain" value={domain} onChange={(event) => { editedTarget.current = true; setDomain(event.target.value); setReferenceConfirmed(false); setSeoReportId(""); setPendingSeoIntent(null); }} autoComplete="url" inputMode="url" maxLength={2048} placeholder="your-website.com" required disabled={Boolean(busy)} /></div><button className="button primary" disabled={!canLaunch || Boolean(busy) || !domain.trim() || (hasReferences && !referenceConfirmed)} type="submit">{busy === "start" ? <Loader2 size={14} className="eval-spin" /> : <Play size={13} />}Run with Agents API</button><button className="button secondary" type="button" onClick={() => void demo()} disabled={Boolean(busy)}>{busy === "demo" ? <Loader2 size={14} className="eval-spin" /> : <FlaskConical size={14} />}Try reproducible demo</button></div>
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
          {workspace.ownerId && <div className="eval-saved-seo"><label htmlFor="eval-seo-report">Saved SEO evidence <span>Optional</span></label><select id="eval-seo-report" value={matchingSeoReports.some((report) => report.id === seoReportId) ? seoReportId : ""} disabled={Boolean(busy)} onChange={(event) => { editedTarget.current = true; setSeoReportId(event.target.value); setPendingSeoIntent(null); }}><option value="">Use the website capture alone</option>{matchingSeoReports.map((report) => <option key={report.id} value={report.id}>{report.domain} · {evaluationDate(report.createdAt)} · {report.status}</option>)}</select><p>{seoReportsError || (matchingSeoReports.length ? "Attach a private saved report for this website. Its organic and backlink observations are frozen with the run; selecting it performs no new paid lookup." : <>No saved reports match this website. Save a lookup in <Link href={searchDataHref}>Search & backlinks</Link>, then return here to use its observations.</>)}</p></div>}
          <div className="eval-connection-note"><Info size={14} /><p>{workspace.isPending ? "Checking your workspace…" : !workspace.ownerId ? <>Live evaluations use a private OpenAI managed session. <Link href={signInHref}>Sign in to connect your workspace <ArrowUpRight size={12} /></Link></> : workspace.connection?.message ?? (workspace.loading ? "Checking Agents API configuration…" : "Connect an OpenAI API key in server configuration to enable managed evaluations.")}</p>{workspace.ownerId && <button type="button" onClick={workspace.refresh} disabled={Boolean(busy)} aria-label="Refresh agent connection"><RefreshCw size={14} /></button>}</div>
          {workspace.ownerId && !liveReady && <div className="eval-account-access"><span>Your account ID</span><code>{workspace.ownerId}</code><button type="button" aria-label="Copy account ID for Agents API access" onClick={async () => { try { await navigator.clipboard.writeText(workspace.ownerId!); setNotice("Account ID copied. An administrator can enable this account for managed runs."); } catch { setNotice("Select and copy your account ID to request managed run access."); } }}><Copy size={12} /></button><small>An administrator can enable this account for managed runs.</small></div>}
          {workspace.connection?.allowedTargets?.length ? <p className="eval-launch-note">Enabled website targets: {workspace.connection.allowedTargets.join(", ")}</p> : null}
          <p className="eval-launch-note">Live runs use your configured provider budget. The demo checks a frozen fictional website locally; it does not call an AI model.</p>
        </form>
      </section>
      {(error || workspace.error) && <div className="eval-alert" role="alert"><Info size={16} />{error || workspace.error}</div>}
      {notice && <p className="eval-notice" role="status"><Check size={14} />{notice}</p>}

      {current ? <EvaluationReport key={current.id} run={current} busy={busy} onRefresh={selected?.local ? undefined : () => void runAction("refresh")} onCancel={selected?.local ? undefined : () => void runAction("cancel")} onReturnSeo={selected?.local ? undefined : () => void runAction("tools")} onExport={() => void runAction("export")} onRerun={current.mode === "demo" ? () => void demo() : liveReady && !activeRunId && hasBudget ? () => void start(current) : undefined} onPrepareFresh={current.mode === "live" ? () => prepareCurrentWebsite(current) : undefined} onCompare={selected?.local || current.status !== "completed" ? undefined : () => compareRun(current)} onDeleted={selected?.local ? undefined : (id) => { setSelected((value) => value?.run.id === id ? null : value); if (selectedId === id) window.history.replaceState(null, "", evaluationHref({ targetUrl: domain })); setNotice("Saved evidence deleted from Folio. Existing downloads and remote provider records are unchanged."); announceEvaluationUpdate(); }} /> : selectedId && workspace.ownerId ? <section className="eval-first-run" aria-label="Loading selected evaluation"><Loader2 className="eval-spin" size={25} /><h2>{error ? "This evaluation could not be opened." : "Opening your selected evaluation…"}</h2><p>{error ? "Choose another saved run from your notebook, or prepare a fresh evaluation." : "Loading this account’s private record. The previous run is hidden while the selection changes."}</p></section> :
        <section className="eval-first-run" aria-label="Evaluation results"><span><FileCheck2 size={28} /></span><h2>Your findings belong with their evidence.</h2><p>Run an evaluation or explore the reproducible demo. Inspect expected and observed results, source text, and the checks that support each finding.</p><button type="button" onClick={() => void demo()} disabled={Boolean(busy)}>Explore an example report <ArrowRight size={15} /></button></section>}

      {workspace.ownerId && <section className="panel eval-history" aria-labelledby="eval-history-title"><div className="eval-section-top"><div><h2 id="eval-history-title">Your evaluation notebook</h2><p>Saved runs stay private to this account.</p></div><span className="eval-version">{workspace.runs.length} saved runs</span></div>{workspace.runs.length ? <div className="eval-history-list">{workspace.runs.map((run) => <button key={run.id} type="button" className={current?.id === run.id ? "selected" : ""} onClick={() => { window.history.pushState(null, "", evaluationHref({ runId: run.id, baselineId: intent.baselineId })); setError(""); setNotice(""); }}><span className="eval-history-icon"><FileCheck2 size={16} /></span><span><strong>{run.siteName || run.targetUrl}</strong><small>{evaluationDate(run.createdAt)} · {run.mode === "demo" ? "Local demo" : "Agents API"}</small></span><RunStatus status={run.status} /><ArrowUpRight size={15} /></button>)}</div> : <p className="eval-history-empty">{workspace.loading ? "Loading your notebook…" : "No saved evaluations yet. Your first managed run will appear here."}</p>}</section>}
      <EvaluationComparison runs={workspace.runs} ownerId={workspace.ownerId} initialBaselineId={intent.baselineId} />
      <p className="eval-privacy"><ShieldCheck size={14} /> Source captures, prompts, session returns and evaluation reports stay in your private workspace. A run is never automatically added to the public index.</p>
    </div>
  );
}

export function EvaluationReport({ run, busy = "", onRefresh, onCancel, onExport, onRerun, onDeleted, onReturnSeo, onPrepareFresh, onCompare }: {
  run: EvaluationRun; busy?: string; onRefresh?: () => void; onCancel?: () => void; onExport?: () => void; onRerun?: () => void; onDeleted?: (id: string) => void; onReturnSeo?: () => void; onPrepareFresh?: () => void; onCompare?: () => void;
}) {
  const [tab, setTab] = useState<ReportTab>("checks");
  const [filter, setFilter] = useState("all");
  const result = run.result;
  const captures = run.captures ?? [];
  const returnSeoAvailable = run.status === "requires_action" && captures.some((capture) => capture.kind === "seo-report") && run.events.some((event) => event.id === "provider-state" && event.data?.savedSeoToolAvailable === true) && !run.events.some((event) => event.id.startsWith("saved-seo-tool-"));
  const total = result ? result.passed + result.failed + result.unmeasured : 0;
  const checks = result?.checks.filter((check) => filter === "all" || check.status === filter) ?? [];
  const evidence = (id: string) => { setTab("evidence"); requestAnimationFrame(() => document.getElementById(`evidence-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); };
  return <section className="panel eval-report" aria-labelledby="eval-report-title">
    <div className="eval-report-top"><div><span className="eval-eyebrow">{run.mode === "demo" ? "REPRODUCIBLE DEMO / FICTIONAL WEBSITE" : "PRIVATE EVALUATION REPORT"}</span><h2 id="eval-report-title">{run.siteName || run.targetUrl}</h2><p>{run.targetUrl} <span>·</span> {evaluationDate(run.createdAt)}</p></div><RunStatus status={run.status} /></div>
    <div className="eval-report-metadata"><span><LockKeyhole size={12} />Private</span><span><FlaskConical size={12} />{run.suiteVersion}</span><span>{run.mode === "demo" ? "Local verifier · no model call" : `OpenAI Agents API${run.model ? ` · ${run.model}` : ""}`}</span></div>
    {run.mode === "live" && <div className="eval-report-next"><div><h3>{run.status === "completed" ? "Inspect the evidence, then choose what to check next." : run.status === "requires_action" ? "Review the requested action before the session continues." : run.status === "failed" || run.status === "cancelled" ? "Inspect what was saved before trying again." : "Follow the saved session while it works."}</h3><p>{run.status === "completed" ? "A fresh evaluation captures the website as it is now. A replay uses this run’s frozen evidence and reference answers to check another model return." : "Open the agent activity to inspect its saved status, returned items and available actions."}</p></div><Link className="button secondary" href={`/agents?run=${encodeURIComponent(run.id)}`}><Bot size={14} />Open agent activity<ArrowUpRight size={12} /></Link></div>}
    <details className="eval-reference-report"><summary><FileCheck2 size={14} />{run.expectedFacts?.source === "owner-confirmed" ? "Owner-confirmed reference answers" : run.expectedFacts?.source === "fixture" ? "Frozen fixture reference answers" : "No reference answers supplied"}<ChevronDown size={14} /></summary><div><dl><div><dt>Product name</dt><dd>{run.expectedFacts?.productName ?? "Not supplied · accuracy unmeasured"}</dd></div><div><dt>Pricing</dt><dd>{run.expectedFacts?.pricing === undefined ? "Not supplied · accuracy unmeasured" : run.expectedFacts.pricing === null ? "No price stated · explicit absence reference" : `${run.expectedFacts.pricing.amount} ${run.expectedFacts.pricing.currency} / ${run.expectedFacts.pricing.interval}`}</dd></div></dl><p>{run.expectedFacts?.source === "owner-confirmed" ? "Confirmed by the account that created this run; not independently established by Folio. These answers were withheld from the agent and preserved for reruns." : run.expectedFacts?.source === "fixture" ? "Authored with the fictional demonstration. These are fixture answers, not an external attestation." : "Without reference answers, product and price accuracy remain unmeasured. Source integrity and citations can still be checked."}</p></div></details>
    {run.error && <p className="eval-run-error" role="alert">{run.error}</p>}
    {returnSeoAvailable && onReturnSeo && <div className="eval-tool-approval"><div><h3>The agent requested your saved SEO evidence.</h3><p>Returning this frozen report resumes its OpenAI turn and can use OpenAI credits. It performs no new DataForSEO lookup.</p></div><button type="button" className="button primary" disabled={Boolean(busy)} onClick={onReturnSeo}>{busy === "tools" ? <Loader2 size={13} className="eval-spin" /> : <Play size={13} />}Return saved SEO evidence</button></div>}
    {result ? <div className="eval-report-summary"><div className="eval-verification-score"><span>Evidence verification</span><strong>{result.verificationScore === null ? "—" : result.verificationScore}<small>{result.verificationScore === null ? "Unmeasured" : "/ 100"}</small></strong><p>{result.passed} of {result.measured} measured checks passed</p></div><div className="eval-summary-copy"><p>{result.summary}</p><div className="eval-outcome-bar" role="img" aria-label={`${result.passed} passed, ${result.failed} failed, ${result.unmeasured} unobservable checks`}>{total > 0 && <><span className="pass" style={{ flex: result.passed }} /><span className="fail" style={{ flex: result.failed }} /><span className="unmeasured" style={{ flex: result.unmeasured }} /></>}</div><div className="eval-outcome-labels"><span><i className="pass" />{result.passed} passed</span><span><i className="fail" />{result.failed} failed</span><span><i className="unmeasured" />{result.unmeasured} unobservable</span></div><small>This verifies the returned evidence. It is not a search rank or a measure of AI recommendation frequency.</small></div></div> : <div className="eval-pending"><span>{activeRun(run) ? <Loader2 size={23} className="eval-spin" /> : <CircleDashed size={23} />}</span><div><h3>{activeRun(run) ? "The session is working in the background." : run.status === "requires_action" ? "This session needs attention." : "No verified report was produced."}</h3><p>{activeRun(run) ? "You can move around Folio. We check the saved provider session while this window is visible; its actual returns appear below." : "Inspect the recorded activity and any captured sources before starting another run."}</p></div></div>}
    <div className="eval-report-toolbar"><div className="eval-report-tabs" role="tablist" aria-label="Evaluation report sections">{REPORT_TABS.map((item, index) => <button id={`eval-tab-${item.id}`} role="tab" type="button" key={item.id} aria-selected={tab === item.id} aria-controls={`eval-pane-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); const target = event.key === "Home" ? 0 : event.key === "End" ? REPORT_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + REPORT_TABS.length) % REPORT_TABS.length; setTab(REPORT_TABS[target].id); document.getElementById(`eval-tab-${REPORT_TABS[target].id}`)?.focus(); }}>{item.label}{item.id === "evidence" && <span>{captures.length}</span>}</button>)}</div></div>
    <div className="eval-report-body" id={`eval-pane-${tab}`} role="tabpanel" aria-labelledby={`eval-tab-${tab}`} tabIndex={0}>
      {tab === "checks" && <><div className="eval-check-heading"><h3>Expected. Observed. Verified.</h3><label>Show <select aria-label="Filter verification checks" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All checks</option><option value="pass">Passed</option><option value="fail">Failed</option><option value="unmeasured">Unobservable</option></select></label></div>{checks.length ? <div className="eval-check-list">{checks.map((check) => <details className="eval-check" key={check.id}><summary><span className={`eval-check-indicator ${check.status}`}>{check.status === "pass" ? <Check size={14} /> : check.status === "fail" ? <Info size={14} /> : <CircleDashed size={14} />}</span><span>{check.label}</span><RunStatus status={check.status} /><ChevronDown className="eval-disclosure-arrow" size={15} /></summary><div className="eval-check-content"><dl><div><dt>Expected</dt><dd>{check.expected}</dd></div><div><dt>Observed</dt><dd>{check.actual}</dd></div></dl><p>{check.detail}</p>{check.evidenceIds.length > 0 && <div className="eval-evidence-links">{[...new Set(check.evidenceIds)].map((id) => <button type="button" key={id} onClick={() => evidence(id)}><FileCheck2 size={12} />{id}<ArrowUpRight size={12} /></button>)}</div>}</div></details>)}</div> : <p className="eval-empty-section">{result ? "No checks match this filter." : "Checks appear once the returned output has been verified."}</p>}</>}
      {tab === "evidence" && <><div className="eval-check-heading"><div><h3>The source of the finding.</h3><p>Frozen text, capture time and SHA-256 identity.</p></div><Fingerprint size={20} /></div>{captures.length ? <div className="eval-evidence-list">{captures.map((capture) => <EvidenceCard key={capture.id} capture={capture} citations={result?.citations.filter((citation) => citation.evidenceId === capture.id).map((citation) => citation.quote) ?? []} />)}</div> : <p className="eval-empty-section">No source captures have been returned for this run.</p>}</>}
      {tab === "activity" && <EvaluationActivity run={run} />}
      {tab === "methodology" && <div className="eval-methodology"><h3>Repeat the check. Inspect the limits.</h3><p>This run uses the frozen <code>{run.suiteVersion}</code> suite. Download the report to keep its input captures, output and verification checks together. Re-running creates a separate record.</p><ol>{(result?.limitations.length ? result.limitations : EVAL_SUITE.limitations).map((limit) => <li key={limit}>{limit}</li>)}</ol><div><Fingerprint size={17} /><p>Hashes identify captured UTF-8 text. They help detect changes; they are not independent proof of the source’s truth or capture time.</p></div></div>}
    </div>
    <footer className="eval-report-footer"><span><ShieldCheck size={13} />{run.mode === "demo" ? "Illustrative fixture, verified in your browser" : "Saved privately with its source evidence"}</span><div>{onRefresh && <button className="button secondary" type="button" onClick={onRefresh} disabled={Boolean(busy)}><RefreshCw size={13} />Refresh returns</button>}{onCancel && (activeRun(run) || run.status === "requires_action") && <button className="button secondary" type="button" onClick={onCancel} disabled={Boolean(busy)}>Cancel run</button>}{onPrepareFresh && <button className="button secondary" type="button" onClick={onPrepareFresh} disabled={Boolean(busy)}><Globe2 size={13} />Evaluate current website</button>}{onRerun && !activeRun(run) && run.status !== "requires_action" && <button className="button secondary" type="button" onClick={onRerun} disabled={Boolean(busy)} title={run.mode === "demo" ? "Verify the local demonstration again" : "Start a paid managed run using the exact saved captures and original reference answers"}><Play size={12} />{run.mode === "demo" ? "Replay local demo" : "Replay frozen evidence"}</button>}{onCompare && <button className="button secondary" type="button" onClick={onCompare} disabled={Boolean(busy)}><FileCheck2 size={13} />Compare this run</button>}{onExport && <button className="button primary" type="button" onClick={onExport} disabled={Boolean(busy)}><ArrowDownToLine size={13} />Download evidence</button>}{onDeleted && <DeleteEvaluation run={run} onDeleted={onDeleted} />}</div>{onRerun && run.mode === "live" && <p className="eval-replay-note">Replay frozen evidence starts a new managed session and can use OpenAI credits. Evaluate current website prepares a fresh form; it starts nothing until you press Run with Agents API.</p>}</footer>
  </section>;
}

function EvidenceCard({ capture, citations }: { capture: EvidenceCapture; citations: string[] }) {
  const sourceUrl = /^https?:\/\//i.test(capture.url) ? capture.url : null;
  return <article id={`evidence-${capture.id}`} className="eval-evidence-card"><div className="eval-evidence-top"><span className="eval-version"><FileCheck2 size={12} />{capture.id}</span><span>{capture.transport === "fixture" ? "Frozen demo fixture" : "Captured source"}</span></div><h4>{sourceUrl && capture.transport !== "fixture" ? <a href={sourceUrl} target="_blank" rel="noreferrer">{capture.url}<ExternalLink size={12} /></a> : capture.url}</h4><p className="eval-capture-date">{evaluationDate(capture.capturedAt)} · {capture.content.length.toLocaleString()} characters · {capture.kind}</p>{citations.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}<details><summary><Code2 size={13} />Read captured text<ChevronDown size={13} /></summary><pre>{capture.content}</pre></details><div className="eval-hash"><Fingerprint size={13} /><div><span>SHA-256 · UTF-8 TEXT</span><code>{capture.sha256}</code></div></div></article>;
}

export function EvaluationActivity({ run }: { run: EvaluationRun }) {
  const events = run.events ?? [];
  const toolCount = events.filter((event) => event.type === "tool").length;
  const messageCount = events.filter((event) => event.type === "message").length;
  return <div className="eval-activity"><div className="eval-check-heading"><div><h3>{run.mode === "demo" ? "Local verification activity" : "From the managed session"}</h3><p>{run.mode === "demo" ? "This fixture did not start an OpenAI session." : "Recorded session events and returned artifacts."}</p></div><Bot size={22} /></div>{run.sessionId && <div className="eval-session-id"><span>SESSION</span><code>{run.sessionId}</code>{run.providerStatus && <small>{run.providerStatus}</small>}</div>}<details className="eval-event-group" open><summary><span><Code2 size={14} />{toolCount} tool {toolCount === 1 ? "return" : "returns"}, {messageCount} {messageCount === 1 ? "message" : "messages"}<small>{events.length} recorded events</small></span><ChevronDown size={15} /></summary><div className="eval-event-list">{events.length ? events.map((event) => <details className="eval-event" key={event.id}><summary><span className={`eval-event-dot ${event.status ?? "completed"}`} /><span><strong>{event.title}</strong><small>{event.type} · {evaluationDate(event.at)}{event.status ? ` · ${event.status}` : ""}</small></span><ChevronDown size={14} /></summary><div>{event.detail ? <p>{event.detail}</p> : <p>No further returned detail is available for this event.</p>}{event.data && Object.keys(event.data).length > 0 && <pre>{JSON.stringify(event.data, null, 2)}</pre>}</div></details>) : <p className="eval-empty-section">The session has not returned any recorded events yet.</p>}</div></details>{run.usage && <details className="eval-usage"><summary><Clock3 size={13} />Reported session usage<ChevronDown size={13} /></summary><pre>{JSON.stringify(run.usage, null, 2)}</pre></details>}<p className="eval-activity-note">Only recorded events and returned data are shown. Missing tool activity or usage stays unreported.</p></div>;
}
