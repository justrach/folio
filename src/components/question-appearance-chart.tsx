"use client";

import { questionAppearance, type QuestionAppearanceValue } from "@/lib/question-appearance";
import type { KeywordBenchmarkRun, KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "@/lib/keyword-benchmark-types";
import "./question-appearance-chart.css";

const labels: Record<QuestionAppearanceValue, string> = { yes: "Yes", no: "Not found", unknown: "Unknown", unmeasured: "Unmeasured", unavailable: "Unavailable" };
const symbols: Record<QuestionAppearanceValue, string> = { yes: "✓", no: "—", unknown: "?", unmeasured: "○", unavailable: "!" };
function AppearanceCell({ value, label, loading = false }: { value: QuestionAppearanceValue; label: string; loading?: boolean }) {
  return <td role="cell" className={`question-appearance-cell question-appearance-${loading ? "loading-cell" : value}`}><span className="question-appearance-mobile-label">{label}</span><span className="question-appearance-value"><span className="question-appearance-symbol" aria-hidden="true">{loading ? "·" : symbols[value]}</span>{loading ? "Loading" : labels[value]}</span></td>;
}
function startedDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Date unavailable"; }

export function QuestionAppearanceChart({ suite, history, details, detailsLoading = false, questionHref }: {
  suite: KeywordBenchmarkSuite; history: readonly KeywordBenchmarkRunSummary[] | null; details: readonly KeywordBenchmarkRun[];
  detailsLoading?: boolean; questionHref: (caseId: string, runId?: string) => string;
}) {
  const rows = questionAppearance(suite, history, details);
  return <section className="question-appearance-chart" aria-label="Your website in saved answers">
    <header className="question-appearance-heading"><p>Recorded website appearance</p><h2>Where your website appears</h2></header>
    <p className="question-appearance-intro">Two distinct observations from each question’s latest completed answer: whether your website was recommended, and whether it was cited as a source.</p>
    <p className="question-appearance-boundary">Exact website URL hosts only. “Not found” means no matching URL in that recorded answer; unknown identities and missing answers stay separate.</p>
    {detailsLoading && history && <p className="question-appearance-loading" role="status">Loading saved answers…</p>}
    {rows.some(row => row.runId) ? <table role="table" className="question-appearance-matrix"><caption className="question-appearance-caption">Appearance across your current saved questions</caption><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Saved question and run</th><th role="columnheader" scope="col">Recommended</th><th role="columnheader" scope="col">Cited as source</th></tr></thead><tbody role="rowgroup">{rows.map((row, index) => <tr role="row" key={row.caseId}>
      <th role="rowheader" scope="row"><span className="question-appearance-number">{String(index + 1).padStart(2, "0")}</span><a className="question-appearance-question" href={questionHref(row.caseId, row.runId)}>{row.question}</a>
        <span className="question-appearance-run">{row.model ? `${row.model} · Started ${startedDate(row.startedAt!)}` : row.recommended === "unavailable" ? "Run history unavailable" : "No completed run measured"}</span><span className="question-appearance-note">{detailsLoading && row.runId && row.recommended === "unavailable" ? row.note.replace("Latest completed run’s saved answer is unavailable.", "Loading latest completed run’s saved answer.") : row.note}</span>
        <a className="question-appearance-open" href={questionHref(row.caseId, row.runId)}>{row.runId ? "Open saved answer" : "Review question"}<span aria-hidden="true"> ↗</span></a>
      </th><AppearanceCell value={row.recommended} label="Recommended" loading={detailsLoading && !!row.runId && row.recommended === "unavailable"}/><AppearanceCell value={row.cited} label="Cited as source" loading={detailsLoading && !!row.runId && row.cited === "unavailable"}/>
    </tr>)}</tbody></table> : rows.length > 0 ? <p className="question-appearance-empty">{history ? "No completed answers for these current question inputs yet. Review a saved question below to start a run." : "Saved history is not confirmed. Website appearance is unavailable."}</p> : null}
    {!rows.length && <p className="question-appearance-loading">No saved questions in this selection.</p>}
    <p className="question-appearance-footer">Measured rows describe one saved agent answer, with its own model and date. This is not a Google ranking or a consumer AI visibility score.</p>
  </section>;
}
