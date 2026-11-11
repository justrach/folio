"use client";

import { useEffect, useState } from "react";
import { play } from "cuelume";
import { InkSpeaker } from "./landing-sketches";

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
  }}><InkSpeaker on={enabled} /><span>Sound {enabled ? "on" : "off"}</span></button>;
}

/**
 * Marks each drawing as it scrolls into view. `data-inview` stays once set, so a drawing is
 * drawn on once; `data-live` follows visibility, so loops and the boil rest while off screen.
 * Renders nothing and starts no request.
 */
export function LandingMotion() {
  useEffect(() => {
    const drawings = [...document.querySelectorAll<HTMLElement>(".landing-drawn [data-reveal]")];
    const show = (element: HTMLElement) => { element.dataset.inview = ""; element.dataset.live = ""; };
    if (!("IntersectionObserver" in window)) { drawings.forEach(show); return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) show(element); else delete element.dataset.live;
      }
    }, { threshold: 0.2 });
    drawings.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);
  return null;
}
