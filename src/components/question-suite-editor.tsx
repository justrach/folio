"use client";

import { useState } from "react";
import { parseQuestionSuiteInput, type QuestionSuiteInput } from "@/lib/question-suite-input";
import "./question-suite-editor.css";

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
