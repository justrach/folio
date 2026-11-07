"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Keep the same explicit appearance preference across every route shell. */
export function FolioAppearance() {
  const pathname = usePathname();
  useEffect(() => {
    let appearance = "light";
    try { appearance = localStorage.getItem("folio-dashboard-appearance") === "dark" ? "dark" : "light"; } catch {}
    document.documentElement.setAttribute("data-folio-theme", appearance);
  }, [pathname]);
  return null;
}
