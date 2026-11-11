"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "@/components/icons";

type Question = { id: string; query: string };

/** A full-text question control: native dialog supplies focus trapping and Escape. */
export function RecordedQuestionPicker({ questions, selected, onSelect }: { questions: Question[]; selected: Question; onSelect: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const titleId = useId();
  const matches = questions.filter(question => question.query.toLowerCase().includes(search.toLowerCase().trim()));
  return <>
    <div className="ranked-question-selection">
      <div className="ranked-question-heading"><span className="ranked-question-label">Question</span>
        <button ref={trigger} type="button" className="ranked-question-trigger" aria-label="Change question" aria-describedby={`${titleId}-selected`} aria-haspopup="dialog" onClick={() => { setSearch(""); dialog.current?.showModal(); searchInput.current?.focus({ preventScroll: true }); }}>Change question <ChevronDown size={15} aria-hidden="true" /></button>
      </div>
      <h3 id={`${titleId}-selected`} className="ranked-search-query">{selected.query}</h3>
    </div>
    <dialog ref={dialog} className="ranked-question-dialog" aria-labelledby={titleId} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.current?.close(); } }} onClose={() => trigger.current?.focus({ preventScroll: true })} onCancel={event => { event.preventDefault(); dialog.current?.close(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current?.close();
    }}>
      <header><h2 id={titleId}>Choose a question</h2><button type="button" aria-label="Close question picker" onClick={() => dialog.current?.close()}><X size={18}/></button></header>
      <label className="ranked-question-search"><Search size={17} aria-hidden="true"/><input ref={searchInput} type="search" aria-label="Filter questions" placeholder="Search questions in this category…" value={search} onChange={event => setSearch(event.target.value)}/></label>
      <p className="ranked-question-count" role="status">{matches.length} matching {matches.length === 1 ? "question" : "questions"}{matches.length > 100 ? " · Showing the first 100; search to narrow the list" : ""}</p>
      <ul>{matches.slice(0, 100).map(question => <li key={question.id}><button type="button" data-question-id={question.id} aria-pressed={question.id === selected.id} onClick={() => { onSelect(question.id); dialog.current?.close(); }}><span>{question.query}</span>{question.id === selected.id && <Check size={17} aria-hidden="true"/>}</button></li>)}</ul>
      {!matches.length && <p className="ranked-question-no-matches">No matching questions. Try a shorter search.</p>}
    </dialog>
  </>;
}
