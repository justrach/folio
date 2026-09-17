"use client";

import { useState } from "react";
import { parseQuestionSuiteInput, type QuestionSuiteInput } from "@/lib/question-suite-input";
import "./question-suite-editor.css";
import { PublicQuestionPicker } from "./public-question-picker";
import { websiteQuestionDrafts } from "@/lib/website-question-drafts";

export function QuestionSuiteEditor({ websiteId, initialName, initialQuestions, busy, onSave, onCancel }: {
  websiteId: string;
  initialName: string;
  initialQuestions: string[];
  busy: boolean;
  onSave: (input: QuestionSuiteInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [questions, setQuestions] = useState(initialQuestions.join("\n"));
  const [language, setLanguage] = useState("English");
  const [locale, setLocale] = useState("United States");
  const [error, setError] = useState("");
  const [audience, setAudience] = useState("");
  const [task, setTask] = useState("");
  const lines = questions.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return <form className="question-suite-editor" aria-label="Write a question suite" onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    setError("");
    try { await onSave(parseQuestionSuiteInput({ name, websiteId, questions: lines, language, locale })); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Check your questions."); }
  }}>
    <h3>Write the questions your customers ask</h3>
    <p>Include discovery, alternatives, pricing or terms, practical fit, and getting started. Each question becomes a separate observation.</p>
    <PublicQuestionPicker busy={busy} onChoose={query => {
      setQuestions(query.query); setLanguage(query.language); setLocale(query.locale); setError("");
    }} />
    <details><summary>Prepare new questions for your website</summary>
      <p>Describe your customers and their task. These editable drafts use your words; they do not fetch or infer facts about your website.</p>
      <label>Who are your customers?<input maxLength={60} value={audience} onChange={event => setAudience(event.target.value)} disabled={busy} placeholder="small design teams" /></label>
      <label>What do they need to do?<input maxLength={120} value={task} onChange={event => setTask(event.target.value)} disabled={busy} placeholder="collect feedback on prototypes" /></label>
      <button type="button" className="button secondary" disabled={busy || !websiteQuestionDrafts(audience, task).length} onClick={() => {
        const next = [...new Set([...lines, ...websiteQuestionDrafts(audience, task)])];
        if (next.length > 10) { setError("Remove some questions before adding three new drafts; a suite holds up to ten."); return; }
        setQuestions(next.join("\n")); setError("");
      }}>Add three scenario drafts</button>
      <p>New wording may have no matching public observation yet. Keep company names out of unbranded discovery questions.</p>
    </details>
    <label>Suite name<input value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={busy}/></label>
    <label>Questions, one per line<textarea value={questions} onChange={event => setQuestions(event.target.value)} rows={9} required disabled={busy}
      placeholder={"Which options would you recommend for this need?\nHow do the main alternatives compare?\nWhat costs, limits, or terms should a customer know?"}/></label>
    <p className="question-suite-count">{lines.length} / 10 questions · up to 300 characters each</p>
    <div className="question-suite-locale"><label>Answer language<input value={language} onChange={event => setLanguage(event.target.value)} maxLength={40} required disabled={busy}/></label>
      <label>Customer location<input value={locale} onChange={event => setLocale(event.target.value)} maxLength={40} required disabled={busy}/></label></div>
    {error && <p role="alert" className="question-suite-error">{error}</p>}
    <div className="benchmark-actions"><button type="submit" className="button primary" disabled={busy || !websiteId}>{busy ? "Saving questions…" : "Save questions"}</button>
      <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>Cancel</button></div>
    <p className="question-suite-count">Saving creates a draft suite. Start each observation when you are ready.</p>
  </form>;
}
