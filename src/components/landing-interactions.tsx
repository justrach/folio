"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Search, ScanLine, Compass, Volume2, VolumeX } from "@/components/icons";
import { play } from "cuelume";
import { CardSwap } from "./bencho/card-swap/CardSwap";
import "./bencho/card-swap/CardSwap.css";

let soundEnabled = false;
function cue() {
  if (soundEnabled) play("navigate", { volume: 0.18, emphasis: "subtle" });
}

export function LandingSound() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(".landing a")) cue();
    };
    document.addEventListener("click", onClick);
    return () => { soundEnabled = false; document.removeEventListener("click", onClick); };
  }, []);
  return <button className="landing-sound" aria-label="Interaction sounds" aria-pressed={enabled} onClick={() => {
    const next = !enabled;
    soundEnabled = next;
    setEnabled(next);
    if (next) play("toggle", { volume: 0.18, emphasis: "subtle" });
  }}>{enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Sound {enabled ? "on" : "off"}</span></button>;
}

const steps = [
  { title: "Ask a question.", body: "Start with what your customers want to know.", label: "01 / Ask", icon: Search },
  { title: "Follow the evidence.", body: "See who appears. Read the sources behind the answer.", label: "02 / Inspect", icon: ScanLine },
  { title: "Find your next move.", body: "Review your pages, make a change, then check again.", label: "03 / Improve", icon: Compass },
];

export function LandingWorkflow() {
  const [active, setActive] = useState(0);
  const api = useRef<{ next: () => void }>(null);
  return <section className="landing-workflow landing-workflow-sparse" id="how-it-works" aria-labelledby="workflow-heading">
    <div className="landing-workflow-intro"><h2 id="workflow-heading">Less noise.<br />More direction.</h2><p>One question at a time.</p></div>
    <div className="landing-deck-wrap">
      <CardSwap auto={false} apiRef={api} onSwap={() => { setActive(value => (value + 1) % steps.length); cue(); }}
        cards={steps.map((step, index) => ({ id: String(index), title: step.title, src: "" }))}
        renderCard={card => {
          const step = steps[Number(card.id)];
          const Icon = step.icon;
          return <div className="landing-card-content"><span className="landing-step-label">{step.label}</span><Icon className="landing-step-icon" size={40} strokeWidth={1.3} aria-hidden="true" /><strong>{step.title}</strong><span className="landing-step-body">{step.body}</span></div>;
        }} />
      <div className="landing-deck-controls"><p aria-live="polite" aria-atomic="true">{active + 1} / 3 <span className="sr-only">{steps[active].title} {steps[active].body}</span></p><button onClick={() => api.current?.next()} aria-label="Next workflow step">Next <ArrowRight size={16} /></button></div>
      <p className="landing-workflow-note">Each run is a snapshot. A changed answer does not prove an edit caused it.</p>
    </div>
  </section>;
}
