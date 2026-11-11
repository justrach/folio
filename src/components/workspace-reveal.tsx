"use client";

import { useEffect } from "react";

/** Panels that can wait below the fold: the page's direct children, and the panels directly inside them. */
const PANEL = ".panel, .workspace-state, .empty-state, .insight-banner, .org-switcher, .seo-data-empty";
const TYPING = "input:not([type=checkbox], [type=radio], [type=range], [type=button], [type=submit], [type=reset], [type=file], [type=color]), textarea, select, [contenteditable=''], [contenteditable='true']";

/** Ends the finite entrance animations on and inside `element` now. A finished CSS animation stays finished, so it never replays. */
function finishEntrances(element: Element) {
  // Never throws: a browser without the Web Animations API (or CSSAnimation) simply skips this.
  if (typeof element.getAnimations !== "function" || typeof CSSAnimation === "undefined") return;
  let animations: Animation[];
  try { animations = element.getAnimations({ subtree: true }); } catch { return; }
  for (const animation of animations) {
    try {
      if (!(animation instanceof CSSAnimation) || animation.playState === "finished") continue;
      if (!Number.isFinite(animation.effect?.getComputedTiming().endTime ?? Infinity)) continue; // loaders keep looping
      animation.finish();
    } catch { /* an animation that cannot be read or finished is left alone */ }
  }
}

/**
 * Two small jobs for the page's motion (workspace-motion.css). No per-component observers, no
 * scroll or resize listeners, and no layout reads.
 *
 * Scroll reveal. One IntersectionObserver for the page. A panel that is in view on its first
 * report keeps its arrival animation and is never marked. One that is not is marked
 * `data-reveal="wait"` (transparent, in its place, so the observer measures its real box), becomes
 * `data-reveal="in"` when any part of it enters the viewport, and `data-reveal="done"` when that
 * entrance ends. "done" carries no animation and is never left, so a settled panel cannot replay:
 * printing, focusing a text field, leaving the page or unmounting moves anything still waiting or
 * entering straight to "done" (shown at once, without an entrance). Marks are never removed,
 * because removing one would hand the element back to its arrival rule, which would start again.
 * Only the observer's own report marks a panel, so if it never reports, nothing waits; a page that
 * cannot scroll has every panel in the viewport on the first report, so nothing waits there either.
 *
 * Typing. While a text field in the page has focus, nothing moves: entrances finish when it takes
 * focus, a waiting panel that it scrolls into view is shown at once, and rows that mount while it
 * keeps focus (a filter narrowing a list) are finished before they are painted.
 *
 * Reduced motion. Read at mount, and watched: if a person turns it on with the page open, every
 * waiting or entering panel is settled at once and nothing further is marked.
 *
 * New panels are found with a MutationObserver on the page and on each of its direct children
 * only (not the whole subtree), so a re-render deep inside a panel costs nothing here.
 * Keyed by page in dashboard.tsx, so each page starts afresh.
 */
export function WorkspaceReveal() {
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: no-preference)");
    if (!motion.matches) return;
    const root = document.querySelector<HTMLElement>(".folio-workspace .page-content");
    if (!root) return;
    const typing = () => document.activeElement instanceof Element && root.contains(document.activeElement) && document.activeElement.matches(TYPING);
    const pending = new Set<Element>(); // marked "wait" or "in"
    const settle = (element: Element) => { element.setAttribute("data-reveal", "done"); pending.delete(element); };
    const settleAll = () => { for (const element of [...pending]) settle(element); };

    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target, state = element.getAttribute("data-reveal");
        if (state === null) {
          // First report: in view keeps its arrival; out of view waits, unless someone is typing.
          if (entry.isIntersecting) { observer!.unobserve(element); continue; }
          if (typing()) { settle(element); observer!.unobserve(element); continue; }
          element.setAttribute("data-reveal", "wait");
          pending.add(element);
        } else if (state === "wait" && entry.isIntersecting) {
          if (typing()) settle(element); else element.setAttribute("data-reveal", "in");
          observer!.unobserve(element);
        }
      }
    }, { rootMargin: "0px" });
    const watch = (element: Element) => {
      // A panel that settled on an earlier page (a node React kept) stays settled.
      if (observer && !element.hasAttribute("data-reveal") && !element.matches(".page-heading")) observer.observe(element);
    };

    // The reveal ends: "in" becomes "done". Only the panel's own entrance counts, not its rows'.
    const onEnd = (event: AnimationEvent) => {
      if (event.target instanceof Element && event.target.getAttribute("data-reveal") === "in" && event.animationName === "ws-reveal") settle(event.target);
    };
    root.addEventListener("animationend", onEnd);
    root.addEventListener("animationcancel", onEnd);

    // Typing: finish what is moving, and show a waiting panel the field sits in.
    let rows: MutationObserver | null = null;
    const onFocusIn = (event: FocusEvent) => {
      if (!(event.target instanceof Element) || !event.target.matches(TYPING)) return;
      const waiting = event.target.closest("[data-reveal='wait'], [data-reveal='in']");
      if (waiting) settle(waiting);
      finishEntrances(root);
      if (!rows) {
        // Only while a field has focus: rows mounted by typing finish before they are painted.
        rows = new MutationObserver(records => {
          for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) finishEntrances(node);
        });
        rows.observe(root, { childList: true, subtree: true });
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      if (rows && !(event.relatedTarget instanceof Element && root.contains(event.relatedTarget) && event.relatedTarget.matches(TYPING))) { rows.disconnect(); rows = null; }
    };
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    // Panels: the page's direct children and the panels directly inside them.
    const panels = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (record.target === root) { watch(node); panels.observe(node, { childList: true }); for (const child of node.children) if (child.matches(PANEL)) watch(child); }
        else if (node.matches(PANEL)) watch(node);
      }
    });
    panels.observe(root, { childList: true });
    for (const child of root.children) { watch(child); panels.observe(child, { childList: true }); for (const inner of child.children) if (inner.matches(PANEL)) watch(inner); }

    addEventListener("beforeprint", settleAll);
    // Reduced motion turned on while the page is open: stop marking, and show everything now.
    const onMotionChange = () => {
      if (motion.matches) return;
      observer?.disconnect(); panels.disconnect();
      settleAll();
    };
    if (typeof motion.addEventListener === "function") motion.addEventListener("change", onMotionChange);
    else motion.addListener?.(onMotionChange);
    return () => {
      if (typeof motion.removeEventListener === "function") motion.removeEventListener("change", onMotionChange);
      else motion.removeListener?.(onMotionChange);
      observer?.disconnect(); panels.disconnect(); rows?.disconnect();
      root.removeEventListener("animationend", onEnd); root.removeEventListener("animationcancel", onEnd);
      root.removeEventListener("focusin", onFocusIn); root.removeEventListener("focusout", onFocusOut);
      removeEventListener("beforeprint", settleAll);
      settleAll();
    };
  }, []);
  return null;
}
