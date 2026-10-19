"use client";

import { useState, type ReactNode } from "react";
import "./guided-first-run.css";

export function GuidedQuestionRun({ question, target, language, locale, model, allowance, available, busy, options, onStart }: {
  question: string; target: string; language: string; locale: string; model: string;
  allowance: string; available: boolean; busy: boolean; options: ReactNode; onStart: () => void;
}) {
  const [step, setStep] = useState(1);
  return <section className="panel guided-question-run" aria-label="Guided first observation">
    <p className="guided-run-eyebrow">Your first search observation</p>
    <ol className="guided-run-steps" aria-label="Run review steps"><li aria-current={step === 1 ? "step" : undefined}>Confirm question</li><li aria-current={step === 2 ? "step" : undefined}>Review and start</li><li>Read the answer</li></ol>
    <h2>{step === 1 ? "Review your question" : "Review this paid run"}</h2>
    <blockquote className="guided-run-question">{question}</blockquote>
    <p className="guided-run-target">Website: {target}</p>
    {step === 1 ? <>
      <p>Get one private answer to this question, with the sites and sources the agent returns.</p>
      <div className="guided-run-actions"><button className="button primary" type="button" disabled={busy} onClick={() => setStep(2)}>Continue to run review</button></div>
    </> : <>
      <dl className="guided-run-facts"><div><dt>Model</dt><dd>{model}</dd></div><div><dt>Workspace allowance</dt><dd>{allowance}</dd></div><div><dt>Cost</dt><dd>Paid agent usage. An exact price is not available before starting.</dd></div></dl>
      <details className="guided-run-options"><summary>Advanced run options</summary><p>Open-web search · {language} · {locale}. Failed or incomplete attempts can still incur charges.</p>{options}</details>
      {!available && <p role="status">Starting is unavailable while access, allowance or saved run state prevents a new observation. Review the saved workspace controls for details.</p>}
      <div className="guided-run-actions"><button className="button secondary" type="button" disabled={busy} onClick={() => setStep(1)}>Back to question</button><button className="button primary" type="button" disabled={!available || busy} onClick={() => { if (available && !busy) onStart(); }}>{busy ? "Starting paid run…" : "Start paid run"}</button></div>
    </>}
  </section>;
}
