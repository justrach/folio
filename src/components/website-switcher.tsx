"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronDown, Globe2, Plus } from "lucide-react";
import type { Scan } from "@/lib/demo-data";
import "./website-switcher.css";

type Site = { id: string; name: string; url: string };

export function WebsiteSwitcher({ ownerId, name, activeUrl, onSelect, onAdd }: {
  ownerId: string | null;
  name: string;
  activeUrl?: string;
  onSelect: (site: Site, scan: Scan | null) => void;
  onAdd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selecting, setSelecting] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selectionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open || !ownerId) return;
    const controller = new AbortController();
    setLoading(true);
    setSites([]);
    setError("");
    fetch("/api/sites", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setSites(data.sites ?? []);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Your websites could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, ownerId, revision]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => () => selectionRequest.current?.abort(), []);

  async function select(site: Site) {
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelecting(site.id);
    setError("");
    try {
      const response = await fetch(`/api/scans?siteId=${encodeURIComponent(site.id)}`, { signal: controller.signal });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (controller.signal.aborted) return;
      onSelect(site, data.scans?.[0] ?? null);
      setOpen(false);
      trigger.current?.focus();
    } catch {
      if (!controller.signal.aborted) setError("This website’s audit could not be loaded. Please try again.");
    } finally {
      if (!controller.signal.aborted) setSelecting(null);
    }
  }

  return <div className="website-switcher" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} className="workspace-switch" aria-label="Switch website" aria-expanded={open} aria-controls="saved-website-picker" onClick={() => setOpen(value => !value)}>
      <span className="workspace-avatar">{ownerId ? name[0] : <Globe2 size={20} />}</span>
      <span>{ownerId ? `${name} workspace` : "Your websites"}<small>{activeUrl ? new URL(activeUrl).hostname : ownerId ? "Select a website" : "Sign in to view websites"}</small></span>
      <ChevronDown size={14} />
    </button>
    {open && <div id="saved-website-picker" className="website-picker" aria-label="Saved websites">
      <p className="website-picker-heading">YOUR WEBSITES</p>
      {!ownerId ? <><p>Sign in to switch between your saved websites.</p><Link href="/login">Sign in <ArrowRight size={14} /></Link></> : <>
        {loading && <p role="status">Loading websites…</p>}
        {error && <div role="alert"><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Retry websites</button></div>}
        {!loading && !error && !sites.length && <p>No websites saved yet. Add your first website to get started.</p>}
        <div className="website-picker-list">
          {sites.map(site => <button key={site.id} aria-pressed={activeUrl === site.url} disabled={selecting !== null} onClick={() => void select(site)}>
            <Globe2 size={16} /><span>{site.name}<small>{site.url}</small></span>{selecting === site.id ? <small>Opening…</small> : activeUrl === site.url ? <Check size={16} /> : null}
          </button>)}
        </div>
        <button className="website-picker-add" onClick={() => { setOpen(false); onAdd(); }}><Plus size={16} /> Add a website</button>
      </>}
    </div>}
  </div>;
}
