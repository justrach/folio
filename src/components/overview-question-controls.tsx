"use client";

import { LayoutGrid, List, Search, X } from "lucide-react";
import { QUESTION_FILTERS, type QuestionFilter, type QuestionView } from "@/lib/overview-question-filters";

export type QuestionControlsProps = {
  query: string;
  tokens: string[];
  filters: ReadonlySet<QuestionFilter>;
  counts: Record<QuestionFilter, number>;
  shown: number;
  total: number;
  scopeLabel: string;
  view: QuestionView;
  onQuery: (value: string) => void;
  onRemoveToken: (token: string) => void;
  onToggle: (filter: QuestionFilter) => void;
  onClear: () => void;
  onView: (view: QuestionView) => void;
};

const label = (key: QuestionFilter) => QUESTION_FILTERS.find(item => item.key === key)!.label;

/** Search, outcome filters and view switch for the loaded question list. */
export function OverviewQuestionControls(props: QuestionControlsProps) {
  const active = props.tokens.length + props.filters.size;
  return <div className="oqc" role="search" aria-label="Filter loaded questions">
    <div className="oqc-row">
      <label className="oqc-search"><Search size={14} aria-hidden="true"/><span className="sr-only">Search loaded questions</span>
        <input type="search" value={props.query} placeholder="Search questions" autoComplete="off" spellCheck={false}
          onChange={event => props.onQuery(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && props.query) { event.preventDefault(); props.onQuery(""); } }}/>
      </label>
      <div className="oqc-view" role="group" aria-label="Question layout">
        <button type="button" aria-pressed={props.view === "list"} onClick={() => props.onView("list")}><List size={14} aria-hidden="true"/>List</button>
        <button type="button" aria-pressed={props.view === "cards"} onClick={() => props.onView("cards")}><LayoutGrid size={14} aria-hidden="true"/>Cards</button>
      </div>
    </div>
    <div className="oqc-pills" role="group" aria-label="Filter by outcome">
      {QUESTION_FILTERS.map(item => <button key={item.key} type="button" data-filter={item.key} aria-pressed={props.filters.has(item.key)} onClick={() => props.onToggle(item.key)}>
        {item.label}<span aria-hidden="true">{props.counts[item.key]}</span><span className="sr-only">, {props.counts[item.key]} loaded</span>
      </button>)}
    </div>
    {active > 0 && <div className="oqc-active" aria-label="Active filters">
      <span>Filters:</span>
      {props.tokens.map(token => <button key={`q:${token}`} type="button" className="oqc-chip" onClick={() => props.onRemoveToken(token)} aria-label={`Remove search “${token}”`}>“{token}”<X size={12} aria-hidden="true"/></button>)}
      {[...props.filters].map(key => <button key={key} type="button" className="oqc-chip" onClick={() => props.onToggle(key)} aria-label={`Remove filter ${label(key)}`}>{label(key)}<X size={12} aria-hidden="true"/></button>)}
      <button type="button" className="oqc-clear" onClick={props.onClear}>Clear all</button>
    </div>}
    <p className="oqc-scope" role="status" aria-live="polite">Showing {props.shown} of {props.total} loaded {props.total === 1 ? "question" : "questions"} · {props.scopeLabel}. Filters apply to this page’s loaded results only.</p>
  </div>;
}
