"use client";

import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, Download, FileSpreadsheet } from "lucide-react";
import { scrubIndex } from "@/lib/overview-question-filters";
import { byteSize, formatBytes, WINDOW_PRESETS, type DailyPoint, type DateWindow } from "@/lib/overview-window";

export type ExportFile = { kind: string; label: string; filename: string; rows: number; build: () => string };
type Props = {
  window: DateWindow;
  bounds: { from: string | null; to: string | null };
  label: string;
  series: DailyPoint[];
  inWindow: { questions: number; attempts: number; audits: number };
  exports: ExportFile[];
  onChange: (window: DateWindow) => void;
};

const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Close a popover on Escape or an outside press, returning focus to its trigger. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element=panel.current;
    if(!open || !element || !trigger.current) return;
    const place=()=>{
      const viewport=window.visualViewport;
      const width=viewport?.width??document.documentElement.clientWidth;
      const height=viewport?.height??document.documentElement.clientHeight;
      const leftEdge=viewport?.offsetLeft??0, topEdge=viewport?.offsetTop??0;
      element.style.width=`${Math.min(width-36,element.classList.contains("owb-export")?440:360)}px`;
      element.style.maxHeight=`${Math.max(120,height-100)}px`;
      const box=element.getBoundingClientRect();
      if(window.matchMedia("(max-width:700px)").matches){
        element.style.left=`${leftEdge+18}px`;
        const themeTop=document.querySelector(".folio-theme-picker")?.getBoundingClientRect().top;
        const bottom=Math.min(topEdge+height-18,themeTop===undefined?topEdge+height-82:themeTop-12);
        element.style.top=`${Math.max(topEdge+18,bottom-box.height)}px`;
      }else{
        const anchor=trigger.current!.getBoundingClientRect();
        element.style.left=`${Math.max(leftEdge+18,Math.min(anchor.left,leftEdge+width-box.width-18))}px`;
        element.style.top=`${Math.max(topEdge+18,Math.min(anchor.bottom+8,topEdge+height-box.height-18))}px`;
      }
      element.style.bottom="auto";element.style.right="auto";
    };
    // Set the width before entering the top layer to avoid mobile viewport expansion.
    element.style.width=`${Math.min((window.visualViewport?.width??document.documentElement.clientWidth)-36,element.classList.contains("owb-export")?440:360)}px`;
    element.showPopover?.();place();
    window.addEventListener("resize",place);
    window.visualViewport?.addEventListener("resize",place);
    window.visualViewport?.addEventListener("scroll",place);
    return()=>{window.removeEventListener("resize",place);window.visualViewport?.removeEventListener("resize",place);window.visualViewport?.removeEventListener("scroll",place);};
  },[open]);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, root, trigger, panel };
}

function RangeChart({ series }: { series: DailyPoint[] }) {
  const [picked, setPicked] = useState<number | null>(null);
  const dragging = useRef(false);
  const max = Math.max(1, ...series.map(point => point.total));
  const index = picked !== null && picked < series.length ? picked : null;
  const point = index !== null ? series[index] : null;
  const selected = series.filter(item => item.selected);
  const selectedTotal = selected.reduce((sum, item) => sum + item.total, 0);
  const width = 600, height = 56;
  const barWidth = width / series.length;
  function fromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setPicked(Math.min(series.length - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * series.length))));
  }
  return <div className="owb-chart">
    <div className="owb-readout" aria-live="polite">
      {point ? <><strong>{point.total}</strong><span>{point.total === 1 ? "attempt" : "attempts"} on {fmt(point.day)}</span><small>{point.completed} completed · {point.other} other</small></>
        : <><strong>{selectedTotal}</strong><span>{selectedTotal === 1 ? "attempt" : "attempts"} in highlighted days</span><small>{selected.length} of {series.length} displayed days</small></>}
    </div>
    <div className="owb-plot" role="slider" tabIndex={0} aria-label="Saved attempts per day" aria-valuemin={1} aria-valuemax={series.length} aria-valuenow={(index ?? series.length - 1) + 1}
      aria-valuetext={point ? `${fmt(point.day)}: ${point.total} attempts, ${point.completed} completed` : `${selectedTotal} loaded attempts in highlighted days`}
      onKeyDown={event => { const next = scrubIndex(event.key, index ?? series.length - 1, series.length); if (next !== null) { event.preventDefault(); setPicked(next); } else if (event.key === "Escape" && index !== null) { event.stopPropagation(); setPicked(null); } }}
      onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); fromPointer(event); }}
      onPointerMove={event => { if (dragging.current || event.pointerType === "mouse") fromPointer(event); }}
      onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setPicked(null); }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {series.map((item, i) => item.total > 0 && <rect key={item.day} x={i * barWidth + barWidth * 0.15} width={Math.max(1, barWidth * 0.7)} y={height - (item.total / max) * (height - 4)} height={(item.total / max) * (height - 4)}
          className={item.selected ? "owb-bar-in" : "owb-bar-out"} data-active={i === index || undefined} />)}
      </svg>
      {index !== null && <span className="owb-cross" style={{ left: `${((index + 0.5) / series.length) * 100}%` }} aria-hidden="true" />}
    </div>
    <div className="owb-axis" aria-hidden="true"><span>{fmt(series[0].day)}</span><span>Today</span></div>
  </div>;
}

function ExportMenu({ exports, label }: { exports: ExportFile[]; label: string }) {
  const { open, setOpen, root, trigger, panel } = usePopover();
  const id = useId();
  const [done, setDone] = useState<Record<string, string>>({});
  return <div className="owb-pop" ref={root}>
    <button ref={trigger} type="button" className="button secondary owb-trigger squishy-control" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><Download size={14} aria-hidden="true"/>Export</button>
    {open && <div ref={panel} popover="manual" id={id} className="owb-panel owb-export" role="dialog" aria-label="Export CSV">
      <p className="owb-panel-note">CSV files are generated in this browser from the data loaded on this page · {label}. No upload is needed.</p>
      <ExportList exports={exports} done={done} onDone={(kind, signature) => setDone(previous => ({ ...previous, [kind]: signature }))} />
    </div>}
  </div>;
}

function ExportList({ exports, done, onDone }: { exports: ExportFile[]; done: Record<string, string>; onDone: (kind: string, signature: string) => void }) {
  const files = useMemo(() => exports.map(file => { const csv = file.build(); return { ...file, csv, bytes: byteSize(csv), signature: JSON.stringify([file.filename, csv]) }; }), [exports]);
  function download(file: (typeof files)[number]) {
    const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = file.filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onDone(file.kind, file.signature);
  }
  return <ul className="owb-files">{files.map(file => <li key={file.kind}>
    <FileSpreadsheet size={18} aria-hidden="true"/>
    <div><strong>{file.filename}</strong><small>{file.label} · {file.rows} {file.rows === 1 ? "row" : "rows"} · {formatBytes(file.bytes)}{done[file.kind] === file.signature ? " · Downloaded" : ""}</small></div>
    <button className="squishy-control" type="button" disabled={!file.rows} onClick={() => download(file)} aria-label={`Download ${file.filename}`}>{done[file.kind] === file.signature ? <Check size={14} aria-hidden="true"/> : <Download size={14} aria-hidden="true"/>}{file.rows ? "Download" : "No rows"}</button>
  </li>)}</ul>;
}

/** Date window, saved-activity overview and CSV export for the selected website. */
export function OverviewWindowBar({ window, bounds, label, series, inWindow, exports, onChange }: Props) {
  const { open, setOpen, root, trigger, panel } = usePopover();
  const id = useId();
  const [draft, setDraft] = useState({ from: bounds.from ?? "", to: bounds.to ?? "" });
  return <section className="owb" aria-label="Date window and export">
    <div className="owb-row">
      <div className="owb-pop" ref={root}>
        <button ref={trigger} type="button" className="button secondary owb-trigger squishy-control" aria-expanded={open} aria-controls={id}
          onClick={() => { setDraft({ from: bounds.from ?? "", to: bounds.to ?? "" }); setOpen(value => !value); }}><CalendarRange size={14} aria-hidden="true"/>{label}</button>
        {open && <div ref={panel} popover="manual" id={id} className="owb-panel" role="dialog" aria-label="Choose date window">
          <div className="owb-presets" role="group" aria-label="Presets">{WINDOW_PRESETS.map(item => <button className="squishy-control" key={item.key} type="button" aria-pressed={window.preset === item.key}
            onClick={() => { onChange({ preset: item.key, from: null, to: null }); setOpen(false); trigger.current?.focus(); }}>{item.label}</button>)}</div>
          <form className="owb-custom" onSubmit={event => { event.preventDefault(); onChange({ preset: "custom", from: draft.from || null, to: draft.to || null }); setOpen(false); trigger.current?.focus(); }}>
            <label>From<input type="date" value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))}/></label>
            <label>To<input type="date" value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))}/></label>
            <button type="submit" className="button primary squishy-control" disabled={!draft.from && !draft.to}>Apply</button>
          </form>
          <p className="owb-panel-note">Days are UTC. The window narrows records already loaded on this page.</p>
        </div>}
      </div>
      <ExportMenu exports={exports} label={label} />
    </div>
    <p className="owb-scope" role="status">{label}: {inWindow.questions} {inWindow.questions === 1 ? "question" : "questions"} with an attempt, {inWindow.attempts} saved {inWindow.attempts === 1 ? "attempt" : "attempts"}, {inWindow.audits} {inWindow.audits === 1 ? "audit" : "audits"}. Answer cards use all loaded history.</p>
    {series.length ? <details className="owb-inspector"><summary className="squishy-control">Inspect saved activity</summary><RangeChart key={`${series[0].day}:${series.at(-1)?.day}:${label}`} series={series} /></details> : <p className="owb-scope">No saved attempts loaded yet, so there is no activity to chart.</p>}
  </section>;
}
