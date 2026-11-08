"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { UiSelect } from "./ui/select";
import "./folio-appearance.css";

type Preference = "system" | "light" | "dark";
const key = "folio-dashboard-appearance";
let cached: Preference | undefined;
function parsePreference(value: string | null): Preference {
  return value === "light" || value === "dark" ? value : "system";
}
function readPreference(): Preference {
  if (cached) return cached;
  try { cached = parsePreference(localStorage.getItem(key)); } catch { cached = "system"; }
  return cached;
}
function apply(choice: Preference): "light" | "dark" {
  const resolved = choice === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
  document.documentElement.dataset.folioTheme = resolved;
  document.documentElement.dataset.folioPreference = choice;
  document.querySelectorAll<HTMLElement>(".app-shell").forEach(shell => { shell.dataset.dashboardTheme = resolved; });
  return resolved;
}
export function setThemePreference(choice: Preference) {
  cached = choice;
  try { localStorage.setItem(key, choice); } catch { /* The choice still works for this tab. */ }
  apply(choice);
  window.dispatchEvent(new Event("folio-appearance-change"));
}
export function useFolioAppearance() {
  const pathname = usePathname();
  const [state, setState] = useState<{ preference: Preference; resolved: "light" | "dark"; ready: boolean }>({ preference: "system", resolved: "light", ready: false });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { const choice = readPreference(); setState({ preference: choice, resolved: apply(choice), ready: true }); };
    const storage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      cached = undefined;
      sync();
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", storage);
    window.addEventListener("folio-appearance-change", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", storage);
      window.removeEventListener("folio-appearance-change", sync);
    };
  }, [pathname]);
  return state;
}

/** One preference for standalone pages and every workspace shell. */
export function FolioAppearance() {
  const { preference, ready } = useFolioAppearance();
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return <div className="folio-theme-picker"><Icon size={16} aria-hidden="true"/><UiSelect className="squishy-control" aria-label="Color theme" value={preference} disabled={!ready} onChange={event => setThemePreference(parsePreference(event.target.value))}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></UiSelect></div>;
}
