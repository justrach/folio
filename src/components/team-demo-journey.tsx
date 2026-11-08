"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCheck, Copy, ChevronDown, Leaf, Mail, MessageCircle, RotateCcw, Search, Sparkles } from "lucide-react";
import "./team-demo-journey.css";

// Authored, fictional examples. This walkthrough never calls a provider or owner API.
const examples = [
  {
    id: "budget", title: "We’re a small team on a budget", person: "A support lead hiring their first teammates",
    question: "What’s a shared inbox for a five-person support team under $50 a month?",
    answer: "Willow Desk’s Starter plan supports five people for $45/month. Pebble Support is another option at $40/month for five seats.",
    outcome: "Moss wasn’t named", named: false,
    insight: "The example answer cites pages with a clear price and seat count. Let’s check whether our own page answers both parts of the question.",
    sources: [
      { title: "Willow Desk · Starter plan", url: "willow.example/plans", quote: "Starter includes five seats for $45 per month." },
      { title: "Pebble Support · Pricing", url: "pebble.example/pricing", quote: "The five-seat team plan costs $40 per month." },
    ],
    pageFact: "Our fictional pricing page says “$39/month” but doesn’t state the seat allowance.",
    note: "Check whether our $39 plan supports five teammates. If it does, make the seat allowance clear on the pricing page. Keep the original answer and sources so we can compare a future result.",
  },
  {
    id: "migration", title: "We’re moving out of Gmail", person: "An operations lead replacing a shared Gmail account",
    question: "Which shared inbox tools make it easy to move a support team from Gmail?",
    answer: "Moss Inbox offers a Gmail importer for shared conversations. Willow Desk also documents a Gmail migration path. Check each guide for supported data and setup requirements.",
    outcome: "Moss was named first", named: true,
    insight: "We appeared in this example. Now check the cited guide: would it actually help this customer move their team? A mention alone isn’t the whole story.",
    sources: [
      { title: "Moss Inbox · Gmail import", url: "moss.example/guides/gmail", quote: "Import shared conversations from Gmail. Attachments and labels have separate import limits." },
      { title: "Willow Desk · Migration guide", url: "willow.example/gmail", quote: "Connect your shared Gmail mailbox to begin a supported migration." },
    ],
    pageFact: "Our fictional guide mentions import limits but leaves the limits on a separate page.",
    note: "Review our Gmail migration guide with the support team. Check that import limits, supported data and setup steps are easy to find. A customer needs a usable answer, not just our product name.",
  },
  {
    id: "handoffs", title: "Our team works across time zones", person: "A customer-success lead trying to prevent dropped conversations",
    question: "Which shared inbox helps an async support team hand conversations between time zones?",
    answer: "Pebble Support documents shift handoffs. Moss Inbox also offers conversation assignments and an activity log that can help the next teammate pick up the thread.",
    outcome: "Moss was named second", named: true,
    insight: "The answer names our features. Does the source explain how a teammate uses them for an actual handoff? That’s a useful question for our team to investigate.",
    sources: [
      { title: "Pebble Support · Shift handoffs", url: "pebble.example/handoffs", quote: "Assign the conversation to the next shift and leave a handoff note." },
      { title: "Moss Inbox · Team activity", url: "moss.example/activity", quote: "Assignments and an activity log show who last worked on a conversation." },
    ],
    pageFact: "Our fictional page lists the features without showing a handoff example.",
    note: "Ask support how they hand a conversation to the next time zone. Review whether our activity page explains that workflow with an accurate example. Verify the product behavior before suggesting an edit.",
  },
];

export function TeamDemoJourney({actualHref = "/overview?view=workspace"}: {actualHref?: string}) {
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState(0);
  const [source, setSource] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [copying, setCopying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const previousStep = useRef(step);
  const example = examples[choice];
  useLayoutEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [step]);
  useLayoutEffect(() => {
    if (error && !copying) { editor.current?.focus(); editor.current?.select(); }
  }, [error, copying]);
  function choose(index: number) { setChoice(index); setSource(null); setNote(""); setError(""); }
  async function copyNote() {
    if (!note.trim() || copying) return;
    setCopying(true); setError("");
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(`Folio walkthrough — fictional sample data\n\nCustomer question: ${example.question}\nExample outcome: ${example.outcome}\n\nFollow-up for our team:\n${note.trim()}\n\nExample sources: ${example.sources.map(item => item.url).join(", ")}\nThis is an authored example, not a live search result.`);
      setStep(3);
    } catch {
      setError("Copying isn’t available here. Select the note and copy it manually; your text is still here.");
    } finally { setCopying(false); }
  }
  const titles = ["Think like the person buying.", "Did we make the answer?", "Give the team a useful next step.", "A question turned into a plan."];
  return <section className="team-demo" aria-label="Interactive team walkthrough">
    <div className="team-demo-top" role="region" aria-label="Sample data notice"><span><i aria-hidden="true"/>Interactive demo · Fictional team & answers</span><div><Link href={actualHref}>My actual results</Link><Link href="/start">Use my website<ArrowRight size={14} aria-hidden="true"/></Link></div></div>
    <div className="team-demo-intro"><span className="team-demo-kicker"><Leaf size={16} aria-hidden="true"/>YOU’RE ON THE MOSS INBOX TEAM</span><h1>“Would a buyer find us?”</h1><p>We’ve launched an inbox for small support teams. Pick a buyer question and turn an example answer into a team follow-up.</p></div>
    <ol className="team-demo-progress" aria-label="Walkthrough progress">{["Pick a buyer question", "Explore an answer", "Make a next step"].map((label, index) => <li key={label}><button type="button" disabled={index > step || copying} aria-current={step === index ? "step" : undefined} onClick={() => { setError(""); setStep(index); }}><span>{step > index ? <Check size={14} aria-hidden="true"/> : index + 1}</span>{label}</button></li>)}</ol>
    <div className="team-demo-stage" key={step}>
      <header className="team-demo-stage-heading"><span>{step === 3 ? "READY FOR THE TEAM" : `YOUR MOVE · ${step + 1} OF 3`}</span><h3 ref={heading} tabIndex={-1}>{titles[step]}</h3></header>
      {step === 0 && <div className="team-demo-grid">
        <div><p className="team-demo-instruction">What’s happening in our customer’s world? Pick a situation.</p><fieldset className="team-demo-questions"><legend className="sr-only">Choose a buyer question</legend>{examples.map((item, index) => <label key={item.id} data-selected={choice === index}><input type="radio" name="demo-question" value={item.id} checked={choice === index} onChange={() => choose(index)}/><span className="team-demo-radio" aria-hidden="true">{choice === index && <Check size={13}/>}</span><span><strong>{item.title}</strong><span>{item.question}</span></span></label>)}</fieldset><button type="button" className="button primary squishy-control team-demo-primary" onClick={() => setStep(1)}>Show the example answer<ArrowRight size={16} aria-hidden="true"/></button><small className="team-demo-fineprint">This opens a written example instantly. No search is sent.</small></div>
        <aside className="team-demo-brief"><div className="team-demo-product"><span><Mail size={25} aria-hidden="true"/></span><div><strong>Moss Inbox</strong><small>moss.example · fictional company</small></div><Leaf size={24} aria-hidden="true"/></div><div className="team-demo-chat"><span className="team-demo-avatar">PM</span><div><strong>A note from our product teammate</strong><p>“We know what our inbox does. I want to know what a support lead hears when they ask for help choosing one.”</p></div></div><div className="team-demo-customer"><span>THE PERSON WE’RE TRYING TO HELP</span><p>{example.person}</p></div><p className="team-demo-brief-footer"><Search size={16} aria-hidden="true"/>One specific question gives us something useful to inspect.</p></aside>
      </div>}
      {step === 1 && <div className="team-demo-grid">
        <div className="team-demo-answer"><div className="team-demo-customer-question"><MessageCircle size={18} aria-hidden="true"/><p>{example.question}</p></div><span className="team-demo-kicker">WRITTEN EXAMPLE ANSWER</span><p className="team-demo-answer-text">{example.answer}</p><div className="team-demo-sources" aria-label="Example answer sources">{example.sources.map((item, index) => <button type="button" className="squishy-control" key={item.url} aria-expanded={source === index} onClick={() => setSource(source === index ? null : index)}><span>{index + 1}</span>{item.title}<ChevronDown size={12} aria-hidden="true"/></button>)}</div>{source !== null && <section className="team-demo-source-detail" aria-label="Example source excerpt" key={source}><span>FICTIONAL SOURCE · {example.sources[source].url}</span><blockquote>“{example.sources[source].quote}”</blockquote><small>This excerpt is part of the demo, not a page fetched from the web.</small></section>}<button type="button" className="button primary squishy-control team-demo-primary" onClick={() => { if (!note) setNote(example.note); setStep(2); }}>What should we do next?<ArrowRight size={16} aria-hidden="true"/></button></div>
        <aside className="team-demo-finding"><span className="team-demo-kicker">WHAT WE CAN TAKE FROM THIS EXAMPLE</span><span className="team-demo-outcome" data-named={example.named}>{example.named ? <CheckCheck size={18} aria-hidden="true"/> : <Search size={18} aria-hidden="true"/>}{example.outcome}</span><p>{example.insight}</p><div className="team-demo-tip"><Sparkles size={17} aria-hidden="true"/><p>Tap a source to inspect what it actually says. The answer and its evidence belong together.</p></div><small>One question, one example. Real answers can vary.</small></aside>
      </div>}
      {step === 2 && <div className="team-demo-grid"><form className="team-demo-note" onSubmit={event => { event.preventDefault(); void copyNote(); }}><p className="team-demo-instruction">Here’s a starting point. Make it sound like something you’d send your team.</p><label htmlFor="team-demo-note">Our follow-up</label><textarea id="team-demo-note" ref={editor} disabled={copying} value={note} maxLength={4000} onChange={event => setNote(event.target.value)} rows={6}/><div className="team-demo-note-actions"><button className="button primary squishy-control" type="submit" disabled={!note.trim() || copying}><Copy size={16} aria-hidden="true"/>{copying ? "Copying…" : "Copy the team note"}</button><small>The copied note includes its sample-data label and example sources.</small></div>{error && <p role="alert">{error}</p>}</form><aside className="team-demo-finding"><span className="team-demo-kicker">A REASON TO INVESTIGATE</span><h4>Check the page before changing it.</h4><p>{example.pageFact}</p><div className="team-demo-tip"><Leaf size={17} aria-hidden="true"/><p>A page review is a next step, not proof that an edit will change a recommendation.</p></div><small>We’re making a concrete follow-up, not promising a higher score.</small></aside></div>}
      {step === 3 && <div className="team-demo-finish"><div className="team-demo-success" aria-hidden="true"><CheckCheck size={35}/><i/><i/><i/></div><h4>Note copied. Bring it to the team.</h4><p>You picked a buyer question, opened an example answer, and copied a follow-up with its sources.</p><blockquote>{note}</blockquote><div><Link href="/start" className="button primary squishy-control">Try it with my website<ArrowRight size={16} aria-hidden="true"/></Link><button type="button" className="button secondary squishy-control" onClick={() => { setSource(null); setNote(""); setStep(0); }}><RotateCcw size={15} aria-hidden="true"/>Try another situation</button></div></div>}
      {step > 0 && step < 3 && <button type="button" className="team-demo-back" disabled={copying} onClick={() => { setError(""); setStep(step - 1); }}><ArrowLeft size={14} aria-hidden="true"/>Back</button>}
    </div>
    <footer className="team-demo-footer"><span>No account changes or paid searches in this walkthrough.</span><Link href="/overview?view=demo&demo=charts">Explore the sample charts<ArrowRight size={13} aria-hidden="true"/></Link></footer>
  </section>;
}
