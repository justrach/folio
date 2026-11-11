"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export type PopoverPlacement = { left: number; width: number; bottom: number; maxHeight: number };
type Place = (trigger: DOMRect, sidebar: DOMRect | null, viewport: { width: number; height: number }) => PopoverPlacement;

/**
 * A sidebar popover in the browser's top layer (`popover="auto"`): the mobile sidebar is a transformed drawer, which
 * would trap a fixed panel inside it. The browser handles outside clicks, Escape and returning focus to the trigger;
 * this places the panel next to its trigger as it opens, and closes it if the window is resized.
 */
export function useSidebarPopover(place: Place, onOpen?: () => void) {
  const id = useId().replace(/:/g, "");
  const trigger = useRef<HTMLButtonElement>(null);
  // The panel may render later than the hook (after its data loads), so listeners attach whenever it appears.
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const panel = useCallback((node: HTMLDivElement | null) => setElement(node), []);
  const [open, setOpen] = useState(false);
  const placeRef = useRef(place), openRef = useRef(onOpen);
  placeRef.current = place; openRef.current = onOpen;
  useEffect(() => {
    if (!element) return;
    const before = (event: Event) => {
      if ((event as ToggleEvent).newState !== "open" || !trigger.current) return;
      const sidebar = trigger.current.closest(".sidebar")?.getBoundingClientRect() ?? null;
      const spot = placeRef.current(trigger.current.getBoundingClientRect(), sidebar, { width: window.innerWidth, height: window.innerHeight });
      Object.assign(element.style, { left: `${spot.left}px`, width: `${spot.width}px`, bottom: `${spot.bottom}px`, maxHeight: `${Math.max(160, spot.maxHeight)}px`, top: "auto", right: "auto" });
      openRef.current?.();
    };
    const toggle = (event: Event) => setOpen((event as ToggleEvent).newState === "open");
    element.addEventListener("beforetoggle", before);
    element.addEventListener("toggle", toggle);
    return () => { element.removeEventListener("beforetoggle", before); element.removeEventListener("toggle", toggle); };
  }, [element]);
  const close = useCallback(() => { if (element?.matches(":popover-open")) element.hidePopover(); }, [element]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open, close]);
  // Escape closes only the popover: the workspace also closes its mobile drawer and dialogs on Escape at the window.
  // The browser's own popover dismissal doesn't depend on the event reaching the window.
  const onKeyDown = useCallback((event: { key: string; stopPropagation: () => void }) => { if (event.key === "Escape" && open) event.stopPropagation(); }, [open]);
  return { id: `sidebar-popover-${id}`, trigger, panel, open, close, onKeyDown };
}

const MOBILE = 760, GAP = 12;
/** Opens upward from a trigger at the bottom of the sidebar, left-aligned with it and kept on screen. */
export function aboveTrigger(width: number): Place {
  return (trigger, _sidebar, viewport) => {
    const w = Math.min(width, viewport.width - GAP * 2);
    return { left: Math.max(GAP, Math.min(trigger.left, viewport.width - w - GAP)), width: w, bottom: viewport.height - trigger.top + 6, maxHeight: trigger.top - GAP - 6 };
  };
}
/** Beside the sidebar, bottoms aligned with the trigger; above the trigger on phones, where the sidebar is a drawer. */
export function besideSidebar(width: number): Place {
  return (trigger, sidebar, viewport) => {
    if (viewport.width <= MOBILE || !sidebar) return aboveTrigger(width)(trigger, sidebar, viewport);
    const left = sidebar.right + GAP, w = Math.min(width, viewport.width - left - GAP);
    return { left, width: w, bottom: viewport.height - trigger.bottom, maxHeight: trigger.bottom - GAP };
  };
}
