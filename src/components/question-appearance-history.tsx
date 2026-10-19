"use client";

import { questionAppearanceHistory, type AppearanceHistoryValue } from "@/lib/question-appearance-history";
import type { KeywordBenchmarkRun, KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "@/lib/keyword-benchmark-types";
import "./question-appearance-history.css";

const labels: Record<AppearanceHistoryValue, string> = { yes: "Yes", no: "Not found", unknown: "Unknown", unavailable: "Unavailable" };
const symbols: Record<AppearanceHistoryValue, string> = { yes: "✓", no: "—", unknown: "?", unavailable: "!" };
function dateLabel(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) : "Date unavailable"; }

export function QuestionAppearanceHistory({ suite, caseId, history, details, detailsLoading = false, questionHref, onQuestionChange }: {
  suite: KeywordBenchmarkSuite; caseId: string; history: readonly KeywordBenchmarkRunSummary[] | null; details: readonly KeywordBenchmarkRun[];
  detailsLoading?: boolean; questionHref: (caseId: string, runId?: string) => string; onQuestionChange?: (caseId: string) => void;
}) {
  const question = suite.cases.find(item => item.id === caseId);
  const data = questionAppearanceHistory(suite, caseId, history, details);
  const comparisonLoading = detailsLoading && data.points.slice(-2).some(point => !point.detail);
  return <section className="question-appearance-history" aria-label="Website appearance over time">
    <header><p className="question-history-eyebrow">Recorded change over time</p><h2>Your website, answer by answer</h2></header>
    <label className="question-history-select">Question appearance history<select value={question?.id ?? ""} disabled={!onQuestionChange} onChange={event => onQuestionChange?.(event.target.value)}>{suite.cases.map(item => <option key={item.id} value={item.id}>{item.query}</option>)}</select></label>
    {question && <p className="question-history-question">{question.query}</p>}
    {data.totalCompleted === null ? <p className="question-history-empty">Saved history is not confirmed. Appearance over time is unavailable.</p> : data.totalCompleted === 0 ? <p className="question-history-empty">No completed observations for this question yet. <a href={questionHref(caseId)}>Review this question</a>.</p> : <>
      <div className="question-history-summary"><p>Showing latest {data.points.length} of {data.totalCompleted} completed observations.</p><p>Oldest to newest, equally spaced. Dates show when each run started, in UTC.</p></div>
      {data.points.length < 2 ? <p className="question-history-empty">One completed observation. Another comparable answer is needed to see change.</p> : <div className="question-history-change" aria-label="Change between latest two completed answers"><div><span>Recommended</span><strong>{comparisonLoading ? "Loading saved answers…" : data.comparison.recommended}</strong></div><div><span>Cited as source</span><strong>{comparisonLoading ? "Loading saved answers…" : data.comparison.cited}</strong></div>{!comparisonLoading && data.comparison.reasons.length > 0 && <p>{data.comparison.reasons.join(" ")}</p>}</div>}
      {detailsLoading && <p className="question-history-loading" role="status">Loading saved observations…</p>}
      {data.points.length > 1 && <p className="question-history-scroll-hint">Scroll horizontally to see later observations.</p>}
      <div className="question-history-scroll" tabIndex={0} role="region" aria-label="Dated website appearance observations"><table className="question-history-matrix"><caption>Ordered saved observations of the selected question</caption><thead><tr><th scope="col">Run started · UTC</th>{data.points.map(point => <th scope="col" key={point.runId}><a href={questionHref(caseId, point.runId)}>{dateLabel(point.startedAt)}</a><span className="question-history-model">{point.model}</span><span className={`question-history-inputs ${point.currentInputs ? "" : "question-history-inputs-changed"}`}>{!point.detail && point.currentInputs ? "Inputs not confirmed" : point.currentInputs ? "Current inputs" : "Earlier inputs"}</span></th>)}</tr></thead><tbody>{(["recommended", "cited"] as const).map(lane => <tr key={lane}><th scope="row">{lane === "recommended" ? "Recommended" : "Cited as source"}</th>{data.points.map(point => <td key={point.runId}><a className={`question-history-mark question-history-mark-${point[lane]}`} href={questionHref(caseId, point.runId)} aria-label={`${lane === "recommended" ? "Recommended" : "Cited as source"}: ${point[lane] === "unavailable" && detailsLoading ? "Loading" : labels[point[lane]]}. Run started ${dateLabel(point.startedAt)} UTC. ${point.model}. ${!point.detail && point.currentInputs ? "Inputs not confirmed" : point.currentInputs ? "Current inputs" : "Earlier inputs"}.`}><span aria-hidden="true">{point[lane] === "unavailable" && detailsLoading ? "·" : symbols[point[lane]]}</span><small>{point[lane] === "unavailable" && detailsLoading ? "Loading" : labels[point[lane]]}</small></a></td>)}</tr>)}</tbody></table></div>
    </>}
    {data.latestAttempt && <p className="question-history-attempt">Latest attempt: {data.latestAttempt.status === "requires_action" ? "needs attention" : data.latestAttempt.status}. It is not a completed observation. <a href={questionHref(caseId, data.latestAttempt.id)}>Review saved status</a>.</p>}
    <p className="question-history-note">Recommended and cited are separate exact-host observations. Changes between saved answers do not establish that a website edit caused improvement, or measure Google rank or consumer AI visibility.</p>
  </section>;
}
