"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function DashboardAppearance() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let value = false;
    try { value = localStorage.getItem("folio-dashboard-appearance") === "dark"; } catch { /* Storage is optional. */ }
    setDark(value);
    setReady(true);
    document.documentElement.setAttribute("data-folio-theme", value ? "dark" : "light");
    button.current?.closest<HTMLElement>(".app-shell")?.setAttribute("data-dashboard-theme", value ? "dark" : "light");
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-folio-theme", next ? "dark" : "light");
    button.current?.closest<HTMLElement>(".app-shell")?.setAttribute("data-dashboard-theme", next ? "dark" : "light");
    try { localStorage.setItem("folio-dashboard-appearance", next ? "dark" : "light"); } catch { /* Storage is optional. */ }
  }
  return <button ref={button} type="button" className="dashboard-appearance" disabled={!ready} onClick={toggle} aria-label="Dark appearance" aria-pressed={dark} title={dark ? "Use light appearance" : "Use dark appearance"}>{dark ? <Sun size={17} /> : <Moon size={17} />}<span>{dark ? "Light" : "Dark"}</span></button>;
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
