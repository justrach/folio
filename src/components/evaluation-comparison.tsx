"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Fingerprint, GitCompareArrows, Info, Loader2, LockKeyhole } from "lucide-react";
import { compareEvaluationRuns } from "@/lib/eval-comparison";
import type { EvaluationRun } from "@/lib/evals";
import { readEvaluationIntent } from "@/lib/evaluation-navigation";
import { evaluationDate, evaluationRequest, RunStatus } from "./evaluation-workspace";
import "./evaluation-comparison.css";

type Pair = { ownerId: string; beforeId: string; afterId: string };
type LoadedPair = Pair & { before: EvaluationRun; after: EvaluationRun };

/** Run list comes from the parent workspace; detail reads remain account-scoped and abortable. */
export function EvaluationComparison({ runs, ownerId, initialBaselineId }: {
  runs: EvaluationRun[]; ownerId: string | null; initialBaselineId?: string;
}) {
  const baselineIntent = readEvaluationIntent(new URLSearchParams(initialBaselineId ? { baseline: initialBaselineId } : {})).baselineId ?? "";
  const [selection, setSelection] = useState<(Pair & { baselineIntent: string }) | null>(null);
  const [loaded, setLoaded] = useState<LoadedPair | null>(null);
  const [failure, setFailure] = useState<{ ownerId: string; message: string } | null>(null);
  const completed = runs.filter(run => run.status === "completed" && run.result && run.publication === "private");
  const selectionMatches = selection?.ownerId === ownerId && selection.baselineIntent === baselineIntent;
  const beforeId = selectionMatches ? selection?.beforeId ?? "" : baselineIntent;
  const afterId = selectionMatches ? selection?.afterId ?? "" : "";
  const beforeSummary = completed.find(run => run.id === beforeId);
  const afterSummary = completed.find(run => run.id === afterId);
  const pair = beforeSummary && afterSummary && loaded?.ownerId === ownerId && loaded.beforeId === beforeId && loaded.afterId === afterId ? loaded : null;
  const error = failure?.ownerId === ownerId ? failure.message : "";

  useEffect(() => {
    setLoaded(null);
    setFailure(null);
    if (!ownerId || !beforeSummary || !afterSummary || beforeId === afterId) return;
    const controller = new AbortController();
    const identity = { ownerId, beforeId, afterId };
    void Promise.all([beforeId, afterId].map(id =>
      evaluationRequest<{ run: EvaluationRun }>(`/api/evaluations/${encodeURIComponent(id)}`, { signal: controller.signal }),
    )).then(([a, b]) => {
      if (controller.signal.aborted) return;
      if (a.run.id !== beforeId || b.run.id !== afterId) throw new Error("The returned run does not match your selection.");
      compareEvaluationRuns(a.run, b.run);
      setLoaded({ ...identity, before: a.run, after: b.run });
    }).catch(error => {
      if (!controller.signal.aborted) setFailure({ ownerId, message: error instanceof Error ? error.message : "The selected evaluations could not be compared." });
    });
    return () => controller.abort();
  }, [ownerId, beforeId, afterId, beforeSummary?.revision, afterSummary?.revision]);

  if (!ownerId) return null;
  const comparison = pair ? compareEvaluationRuns(pair.before, pair.after) : null;
  const eligibleAfter = completed.filter(run => run.id !== beforeId && (!beforeSummary || run.mode === beforeSummary.mode));
  const loading = Boolean(beforeSummary && afterSummary && !pair && !error);
  const optionLabel = (run: EvaluationRun) => `${run.siteName || run.targetUrl} · ${evaluationDate(run.createdAt)} · ${run.mode === "demo" ? "Local fixture" : "Agents API"} · ${run.id.slice(-6)}`;

  return <section className="panel eval-comparison" aria-labelledby="eval-comparison-title">
    <div className="eval-section-top"><div><span className="eval-eyebrow">KEEP THE INPUTS IN VIEW</span><h2 id="eval-comparison-title"><GitCompareArrows size={19} /> Compare completed runs</h2><p>Inspect each check side by side, including changes in source evidence and reference answers.</p></div><span className="eval-version"><LockKeyhole size={12} />Private</span></div>
    {baselineIntent && beforeId === baselineIntent && <p className="eval-comparison-intent" role="status">{beforeSummary ? <>Baseline selected: <strong>{beforeSummary.siteName || beforeSummary.targetUrl}</strong>. Choose another completed {beforeSummary.mode === "demo" ? "local fixture" : "live run"} to compare.</> : "The requested baseline is not available among this account’s completed evaluations. Choose a saved baseline below."}</p>}
    {completed.length < 2 ? <p className="eval-comparison-empty">Complete two saved evaluations to compare their results here. Local fixtures and live agent runs stay in separate comparisons.</p> : <>
      <div className="eval-comparison-selects">
        <label>Baseline evaluation<select aria-label="Baseline evaluation" value={beforeId} onChange={event => {
          setSelection({ ownerId, baselineIntent, beforeId: event.target.value, afterId: "" });
        }}><option value="">Choose a baseline</option>{completed.map(run => <option key={run.id} value={run.id}>{optionLabel(run)}</option>)}</select></label>
        <ArrowRight size={18} aria-hidden="true" />
        <label>Comparison evaluation<select aria-label="Comparison evaluation" value={afterId} disabled={!beforeSummary} onChange={event => {
          setSelection({ ownerId, baselineIntent, beforeId, afterId: event.target.value });
        }}><option value="">Choose another {beforeSummary?.mode === "demo" ? "local fixture" : "run"}</option>{eligibleAfter.map(run => <option key={run.id} value={run.id}>{optionLabel(run)}</option>)}</select></label>
      </div>
      {beforeSummary && eligibleAfter.length === 0 && <p className="eval-comparison-empty">No other completed {beforeSummary.mode === "demo" ? "local fixture" : "live agent run"} is available. Demo results are never mixed with live results.</p>}
    </>}
    {loading && <p className="eval-comparison-empty" role="status"><Loader2 size={14} className="eval-spin" />Loading the two private evidence records…</p>}
    {error && <p className="eval-comparison-warning" role="alert"><Info size={15} />{error}</p>}
    {pair && comparison && <div className="eval-comparison-result">
      <div className="eval-comparison-summary">
        <div><span>Verification percentage</span><strong>{comparison.beforeScore ?? "—"}<ArrowRight size={16} />{comparison.afterScore ?? "—"}</strong><small>{comparison.scoreDelta === null ? "Percentages shown separately" : `${comparison.scoreDelta > 0 ? "+" : ""}${comparison.scoreDelta} percentage points`}</small></div>
        <div><span>Measured checks</span><strong>{pair.before.result!.measured}<ArrowRight size={16} />{pair.after.result!.measured}</strong><small>{pair.before.result!.unmeasured} → {pair.after.result!.unmeasured} unmeasured</small></div>
        <div><span>Source identities</span><strong>{comparison.sourceHashesChanged ? "Changed" : "Unchanged"}</strong><small>SHA-256 of captured text</small></div>
      </div>
      {!comparison.comparable && <div className="eval-comparison-warning" role="note"><Info size={16} /><div><strong>These percentages are not interchangeable.</strong><ul>{comparison.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div></div>}
      <p className="eval-comparison-context">{comparison.sourceHashesChanged ? "Source hashes changed between these runs. " : "Both runs use the same source hashes. "}{comparison.referenceFactsChanged ? "Reference answers also changed. " : "Reference answers are unchanged. "}A check change alone does not establish a change in search rank or prove what caused the agent’s response to change.</p>
      <div className="eval-comparison-table-scroll" role="region" aria-label="Verification check comparison" tabIndex={0}><table><thead><tr><th scope="col">Verification check</th><th scope="col">Baseline</th><th scope="col">Comparison</th><th scope="col">Change</th></tr></thead><tbody>{comparison.checks.map(check => <tr key={check.id}><th scope="row">{check.label}</th><td>{check.before ? <RunStatus status={check.before.status} /> : "Not in suite"}</td><td>{check.after ? <RunStatus status={check.after.status} /> : "Not in suite"}</td><td><span className={`eval-comparison-change ${check.change}`}>{check.change}</span><details><summary>Inspect observations</summary><dl><div><dt>Baseline expected</dt><dd>{check.before?.expected ?? "Not measured"}</dd></div><div><dt>Baseline observed</dt><dd>{check.before?.actual ?? "Not measured"}</dd></div><div><dt>Comparison expected</dt><dd>{check.after?.expected ?? "Not measured"}</dd></div><div><dt>Comparison observed</dt><dd>{check.after?.actual ?? "Not measured"}</dd></div></dl></details></td></tr>)}</tbody></table></div>
      <details className="eval-comparison-provenance"><summary><Fingerprint size={15} />Inspect source hashes and reference answers</summary><div>{([pair.before, pair.after] as const).map((run, index) => <article key={run.id}><h3>{index === 0 ? "Baseline" : "Comparison"}</h3><p>{run.targetUrl}</p><small>{run.suiteVersion} · {run.model ?? "Local fixture"}</small>{run.captures.map(capture => <div className="eval-comparison-source" key={capture.id}><span>{capture.url}</span><code>{capture.sha256}</code></div>)}<h4>Reference answers</h4><pre>{run.expectedFacts ? JSON.stringify(run.expectedFacts, null, 2) : "No independent reference answers supplied."}</pre></article>)}</div></details>
    </div>}
  </section>;
}
