"use client";

import { useId } from "react";
import { savedQuestionMap, savedQuestionProgress } from "@/lib/saved-question-map";
import type { KeywordBenchmarkRunSummary, KeywordBenchmarkSuite } from "@/lib/keyword-benchmark-types";
import "./saved-question-map.css";

export function SavedQuestionMap({ suite, history, selectedId, busy, onSelect, questionHref }: {
  suite: KeywordBenchmarkSuite; history: KeywordBenchmarkRunSummary[] | null; selectedId?: string; busy: boolean;
  onSelect?: (caseId: string, runId?: string) => void;
  questionHref?: (caseId: string, runId?: string) => string;
}) {
  const items = savedQuestionMap(suite, history);
  const groups = history ? savedQuestionProgress(items) : null;
  const patternId = useId().replace(/:/g, "");
  const summary = groups ? `${items.length} saved questions: ${groups.map(group => `${group.count} ${group.label.toLowerCase()}`).join(", ")}.` : "Saved history is not confirmed. Progress counts are unavailable.";
  let offset = 0;
  return <section className="saved-question-map" aria-label="Your saved question map">
    <div className="saved-question-map-heading"><h2>Your question map</h2><p>{history ? `${items.filter(item => item.answered).length} of ${items.length} saved questions have recorded answers` : "Saved history is not confirmed. Answer counts are unavailable."}</p></div>
    <div className="saved-question-chart">
      <h3>Saved-question progress</h3>
      {groups && items.length > 0 ? <>
        <svg className="saved-question-chart-bar" viewBox="0 0 1000 40" preserveAspectRatio="none" role="img" aria-label={`Research progress across saved questions. ${summary}`}>
          <defs><pattern id={patternId} width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2 2L2 -2M0 10L10 0M8 12L12 8" fill="none" stroke="var(--folio-accent-text)" strokeWidth="2"/></pattern></defs>
          {groups.map(group => {
            const x = offset;
            const width = group.count / items.length * 1000;
            offset += width;
            return group.count > 0 ? <g key={group.key} className={`saved-question-chart-segment saved-question-chart-${group.key}`}><rect x={x} y="1" width={width} height="38"/>{group.key === "pending" && <rect x={x} y="1" width={width} height="38" style={{ fill: `url(#${patternId})` }}/>}</g> : null;
          })}
        </svg>
        <div className="saved-question-chart-scale" aria-hidden="true"><span>0</span><span>{items.length} saved {items.length === 1 ? "question" : "questions"}</span></div>
        <ul className="saved-question-chart-legend" aria-label="Research progress counts">{groups.map(group => <li key={group.key}><span className={`saved-question-chart-swatch saved-question-chart-${group.key}`} aria-hidden="true"/><span>{group.label}</span><strong>{group.count}</strong></li>)}</ul>
      </> : <p className="saved-question-chart-unavailable">{groups ? "No saved questions in this selection." : summary}</p>}
      <p className="saved-question-map-note">Each question appears once in the chart. Recorded answers match current wording and settings; later attempts may still need attention.</p>
    </div>
    <ol className="saved-question-map-grid" aria-label="Saved question progress">{items.map((item, index) => {
      const className = `saved-question-mark saved-question-mark-${item.state}`;
      const label = `Question ${index + 1}: ${item.query}. ${item.label}${item.id === selectedId ? ". Selected question" : ""}`;
      const content = <><span className="saved-question-mark-top"><span className="saved-question-mark-number">{String(index + 1).padStart(2, "0")}</span>{item.id === selectedId && <span className="saved-question-mark-selected">Selected</span>}</span><span className="saved-question-mark-query">{item.query}</span><span className="saved-question-mark-label">{item.label}</span></>;
      return <li key={item.id}>{questionHref ? <a className={className} href={busy ? undefined : questionHref(item.id, item.latestRunId)} aria-current={item.id === selectedId ? "true" : undefined} aria-disabled={busy || undefined} aria-label={label}>{content}</a>
        : <button type="button" className={className} aria-current={item.id === selectedId ? "true" : undefined} aria-label={label} disabled={busy || !onSelect} onClick={() => onSelect?.(item.id, item.latestRunId)}>{content}</button>}</li>;
    })}</ol>
    <details className="saved-question-map-list"><summary>Read all saved questions</summary><ol>{items.map((item, index) => <li key={item.id}><span>{index + 1}. {item.query}</span><small>{item.label}</small></li>)}</ol></details>
  </section>;
}
