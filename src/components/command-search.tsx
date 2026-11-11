"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, BarChart3, BookOpen, Bot, CreditCard, Eye, FlaskConical, Globe2, LayoutDashboard, Link2, ListChecks, PlugZap, Plus, Search, Settings,
  ShieldCheck, Sparkles, Trophy, Users, WandSparkles, type FolioIcon } from "@/components/icons";
import { commandResults, type CommandResult, type SearchableAudit, type WorkspaceSearchIndex } from "@/lib/command-search";
import "./command-search.css";

const ICONS: Record<string, FolioIcon> = { workspace: LayoutDashboard, websites: Globe2, website: Globe2, "add-website": Plus, orgs: Users, "org-preview": Users, connect: PlugZap,
  agents: Bot, visibility: Sparkles, seo: BarChart3, "search-data": Link2, evaluations: FlaskConical, benchmarks: ListChecks, "search-console": Search, patches: WandSparkles,
  index: Trophy, "api-docs": BookOpen, settings: Settings, pricing: CreditCard, demo: Eye, privacy: ShieldCheck };

type Loaded = { state: "idle" | "loading" | "ready" | "error"; index: WorkspaceSearchIndex | null };
const isIndex = (value: unknown): value is WorkspaceSearchIndex => {
  const index = value as Partial<WorkspaceSearchIndex> | null;
  return Boolean(index && Array.isArray(index.websites) && Array.isArray(index.seoReports) && Array.isArray(index.searchConsole) && Array.isArray(index.organizations));
};

/** "Find anything": pages, plus the signed-in person's websites, organizations and saved reports. Results only navigate. */
export function CommandSearch({ signedIn, audits, onClose, onOpenAudit }: { signedIn: boolean; audits: SearchableAudit[]; onClose: () => void; onOpenAudit: (id: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState<Loaded>({ state: signedIn ? "loading" : "idle", index: null });
  const field = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  // Read fresh each time the box opens, so a website saved a moment ago is findable. One read-only request.
  useEffect(() => {
    if (!signedIn) return;
    const controller = new AbortController();
    fetch("/api/workspace-search", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = response.ok ? await response.json() as { index?: unknown } : null;
        if (!isIndex(body?.index)) throw new Error("unavailable");
        setLoaded({ state: "ready", index: body.index });
      })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ state: "error", index: null }); });
    return () => controller.abort();
  }, [signedIn]);

  const results = useMemo(() => commandResults(query, { index: loaded.index, audits }), [query, loaded.index, audits]);
  const typed = query.trim().length > 0;
  function open(result: CommandResult) {
    if (result.auditId) onOpenAudit(result.auditId);
    else { router.push(result.href); onClose(); }
  }
  function moveFrom(event: KeyboardEvent<HTMLElement>) {
    const links = [...(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])], at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown" && links.length) { event.preventDefault(); links[Math.min(at + 1, links.length - 1)]?.focus(); }
    else if (event.key === "ArrowUp" && at >= 0) { event.preventDefault(); (at === 0 ? field.current : links[at - 1])?.focus(); }
  }
  const sources = !signedIn ? "Sign in to search your websites and reports too."
    : loaded.state === "loading" ? "Loading your websites and reports…"
    : loaded.state === "error" ? "Your websites and reports can’t be searched right now; pages still work." : "";

  return <div className="command-search">
    <label className="command-search-field">
      <Search size={17} aria-hidden="true" />
      <input ref={field} type="search" aria-label="Search Folio" value={query} autoComplete="off" spellCheck={false} enterKeyHint="go"
        placeholder={signedIn ? "Search pages, websites and reports…" : "Search pages…"} onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && typed && results[0]) { event.preventDefault(); open(results[0]); }
          else moveFrom(event);
        }} />
      <kbd aria-hidden="true">Esc</kbd>
    </label>
    <p className="command-search-status" role="status">
      {typed ? `${results.length ? `${results.length} match${results.length === 1 ? "" : "es"}` : "No matches"}${sources ? `. ${sources}` : ""}`
        : sources || "Pages, websites, organizations and reports. ↑ ↓ to move, Enter to open."}
    </p>
    {typed && results.length === 0 ? <p className="command-search-empty">Nothing matches “{query.trim()}”. Try a website’s domain, or a page such as Organizations or API docs.</p>
      : <ul ref={list} className="command-search-results" aria-label={typed ? "Matches" : "Pages"} onKeyDown={moveFrom}>{results.map((result, index) => {
        const Icon = ICONS[result.icon] ?? ArrowRight;
        return <li key={result.key}>
          <Link href={result.href} className={typed && index === 0 ? "is-first" : undefined} onClick={event => {
            if (result.auditId) { event.preventDefault(); onOpenAudit(result.auditId); } else onClose();
          }}>
            <Icon size={18} aria-hidden="true" />
            <span><strong>{result.title}</strong><small>{result.detail}</small></span>
            {typed && index === 0 ? <kbd aria-hidden="true">Enter</kbd> : <ArrowRight size={14} aria-hidden="true" />}
          </Link></li>;
      })}</ul>}
  </div>;
}
