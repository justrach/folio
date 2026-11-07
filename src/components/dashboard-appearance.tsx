"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { setThemePreference, useFolioAppearance } from "./folio-appearance";

export function DashboardAppearance() {
  const { resolved, ready } = useFolioAppearance();
  const dark = resolved === "dark";
  function toggle() {
    setThemePreference(dark ? "light" : "dark");
  }
  return <button type="button" className="dashboard-appearance" disabled={!ready} onClick={toggle} aria-label="Dark appearance" aria-pressed={dark} title={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun size={17} /> : <Moon size={17} />}<span>{dark ? "Light" : "Dark"}</span></button>;
}

export function DashboardNavigation() {
  const [compact, setCompact] = useState(true);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let next = true;
    try { next = localStorage.getItem("folio-dashboard-navigation") !== "expanded"; } catch {}
    setCompact(next);
    button.current?.closest<HTMLElement>(".app-shell")?.setAttribute("data-nav-compact", String(next));
  }, []);
  return <button ref={button} className="dashboard-appearance dashboard-nav-toggle" type="button" aria-label="Compact navigation" aria-pressed={compact} title={compact ? "Expand navigation" : "Compact navigation"} onClick={() => {
    const next = !compact;
    setCompact(next);
    button.current?.closest<HTMLElement>(".app-shell")?.setAttribute("data-nav-compact", String(next));
    try { localStorage.setItem("folio-dashboard-navigation", next ? "compact" : "expanded"); } catch {}
  }}>{compact ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button>;
}
