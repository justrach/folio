"use client";

import { memo, useMemo, useRef, useState } from "react";
import { nearestIndex, scrubIndex } from "@/lib/overview-question-filters";
import { activityGrid, appearanceBreakdown, attemptBreakdown, citedDomains, scaleY, scoreDomain, scoreTrend, sparkPath, type AttemptStatus, type Breakdown, type NamedState } from "@/lib/overview-visuals";
import "./overview-visual-cards.css";

type LoadState = "loading" | "ready" | "error";
export type OverviewVisualCardsProps = {
  state: LoadState;
  named: NamedState[];
  cited: (boolean | null)[];
  answers: { citationUrls: string[] }[];
  targetDomain: string | null;
  attempts: { createdAt: string; status: AttemptStatus }[];
  /** Status of the latest attempt per question. */
  latest: AttemptStatus[];
  unrun: number | null;
  historyPartial: boolean;
  scans: { createdAt: string; seoScore: number }[];
  scansState: LoadState;
  /** Set when a date window narrows activity and audits. */
  windowNote?: string;
  now?: Date;
};

const pct = (part: number, whole: number) => whole ? Math.round((part / whole) * 100) : 0;
const day = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function Card({ title, meta, children, label }: { title: string; meta?: string; children: React.ReactNode; label?: string }) {
  return <article className="ovc-card" aria-label={label ?? title}>
    <header><h3>{title}</h3>{meta && <span>{meta}</span>}</header>
    {children}
  </article>;
}

function Pending({ state, empty }: { state: LoadState; empty: string }) {
  if (state === "loading") return <p className="ovc-note" role="status">Reading saved records…</p>;
  if (state === "error") return <p className="ovc-note" role="alert">Saved records are unavailable, so this chart is not shown.</p>;
  return <p className="ovc-note">{empty}</p>;
}

function Segments({ rows, label }: { rows: Breakdown; label: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <>
    <div className="ovc-stack" role="img" aria-label={`${label}: ${rows.map(row => `${row.label} ${row.count}`).join(", ")}`}>
      {rows.filter(row => row.count).map(row => <span key={row.key} data-tone={row.key} style={{ flexGrow: row.count }} />)}
    </div>
    <ul className="ovc-legend">{rows.map(row => <li key={row.key}><i data-tone={row.key} aria-hidden="true" />{row.label}<b>{row.count}</b><small>{pct(row.count, total)}%</small></li>)}</ul>
  </>;
}

function AppearanceCard({ state, named, cited }: Pick<OverviewVisualCardsProps, "state" | "named" | "cited">) {
  const rows = appearanceBreakdown(named);
  const identified = rows[0].count + rows[1].count;
  const knownCites = cited.filter((value): value is boolean => value !== null);
  const citedYes = knownCites.filter(Boolean).length;
  return <Card title="Answer appearance" meta="Latest per question">
    {state !== "ready" || !named.length ? <Pending state={state} empty="No completed answers yet. Run a saved question to measure appearance." /> : <>
      <div className="ovc-total"><strong>{identified ? `${pct(rows[0].count, identified)}%` : "—"}</strong>
        {knownCites.length > 0 && <span className="ovc-chip" data-tone="neutral">Cited in {citedYes} of {knownCites.length}</span>}</div>
      <p className="ovc-sub">{identified ? `${rows[0].count} of ${identified} identified answers named your site.` : "No answer could be matched to your site’s identity."}</p>
      <Segments rows={rows} label="Answer appearance" />
    </>}
  </Card>;
}

function CoverageCard({ state, latest, unrun }: Pick<OverviewVisualCardsProps, "state" | "latest" | "unrun">) {
  const rows = attemptBreakdown(latest, unrun).filter(row => row.count || row.key === "completed");
  const max = Math.max(1, ...rows.map(row => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const issues = rows.filter(row => row.key === "failed" || row.key === "attention").reduce((sum, row) => sum + row.count, 0);
  return <Card title="Question coverage" meta="Latest attempt">
    {state !== "ready" || !total ? <Pending state={state} empty="No saved questions or attempts for this scope yet." /> : <>
      <div className="ovc-total"><strong>{rows[0].count}<small> / {total}</small></strong>
        {issues > 0 ? <span className="ovc-chip" data-tone="warn">{issues} need review</span> : <span className="ovc-chip" data-tone="good">No failures</span>}</div>
      <p className="ovc-sub">Questions whose latest attempt completed.</p>
      <ul className="ovc-bars">{rows.map(row => <li key={row.key}>
        <span>{row.label}</span>
        <span className="ovc-bar" aria-hidden="true"><i data-tone={row.key} style={{ width: `${(row.count / max) * 100}%` }} /></span>
        <b>{row.count}</b>
      </li>)}</ul>
    </>}
  </Card>;
}

function ActivityCard({ state, attempts, historyPartial, now, windowNote }: Pick<OverviewVisualCardsProps, "state" | "attempts" | "historyPartial" | "now" | "windowNote">) {
  const grid = useMemo(() => activityGrid(attempts.map(item => item.createdAt), now ?? new Date()), [attempts, now]);
  return <Card title="Search activity" meta="12 weeks">
    {state !== "ready" ? <Pending state={state} empty="" /> : !grid.total ? <p className="ovc-note">No saved attempts in the last 12 weeks{windowNote ? ` within ${windowNote}` : ""}.</p> : <>
      <div className="ovc-total"><strong>{grid.total}</strong><span className="ovc-chip" data-tone="neutral">{grid.activeDays} active {grid.activeDays === 1 ? "day" : "days"}</span></div>
      <p className="ovc-sub">Saved attempts recorded{historyPartial ? " (loaded history only)" : ""}.</p>
      <div className="ovc-heat" role="img" aria-label={`${grid.total} saved attempts on ${grid.activeDays} days over 12 weeks${grid.peak ? `; busiest ${day(grid.peak.date)} with ${grid.peak.count}` : ""}.`}>
        {grid.weeks.map((week, index) => <div key={index}>{week.map(cell => <span key={cell.date} data-level={cell.level} title={`${day(cell.date)}: ${cell.count} ${cell.count === 1 ? "attempt" : "attempts"}`} />)}</div>)}
      </div>
      <footer className="ovc-foot"><span>{grid.peak && grid.peak.count > 1 ? `Busiest: ${day(grid.peak.date)} · ${grid.peak.count} attempts` : "At most 1 attempt per day"}</span><span className="ovc-scale" aria-hidden="true">Less{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}More</span></footer>
    </>}
  </Card>;
}

function SourcesCard({ state, answers, targetDomain }: Pick<OverviewVisualCardsProps, "state" | "answers" | "targetDomain">) {
  const ranked = useMemo(() => citedDomains(answers, targetDomain), [answers, targetDomain]);
  const targetRank = ranked.findIndex(item => item.isTarget);
  return <Card title="Most-cited sources" meta={`${answers.length} ${answers.length === 1 ? "answer" : "answers"}`}>
    {state !== "ready" || !ranked.length ? <Pending state={state} empty="No citations recorded in the completed answers." /> : <>
      <p className="ovc-sub">{targetRank >= 0 ? `Your site ranks #${targetRank + 1} among cited domains.` : "Your site is not among the top cited domains."}</p>
      <ol className="ovc-bars ovc-ranked">{ranked.map(item => <li key={item.domain} data-target={item.isTarget || undefined}>
        <span title={item.domain}>{item.isTarget && <em className="ovc-you">Your site</em>}{item.domain}</span>
        <span className="ovc-bar" aria-hidden="true"><i data-tone={item.isTarget ? "target" : "source"} style={{ width: `${item.share * 100}%` }} /></span>
        <b>{pct(item.answers, answers.length)}%</b>
      </li>)}</ol>
      <p className="ovc-note">Share of answers citing each domain at least once.</p>
    </>}
  </Card>;
}

function ReadinessCard({ scans, scansState, windowNote }: Pick<OverviewVisualCardsProps, "scans" | "scansState" | "windowNote">) {
  const trend = useMemo(() => scoreTrend(scans), [scans]);
  const [picked, setPicked] = useState<number | null>(null);
  const dragging = useRef(false);
  const width = 320, height = 84, pad = 4;
  const count = trend.points.length;
  const index = picked !== null && picked < count ? picked : count - 1;
  const point = trend.points[index] ?? null;
  const previous = index > 0 ? trend.points[index - 1] : null;
  const delta = point && previous ? point.score - previous.score : null;
  const domain = scoreDomain(trend.points.map(item => item.score), 70);
  const line = sparkPath(trend.points.map(item => item.score), width, height, pad, domain);
  const guide = scaleY(70, domain, height);
  const xPercent = count > 1 ? ((pad + index * ((width - pad * 2) / (count - 1))) / width) * 100 : 50;
  const yPercent = point ? (scaleY(point.score, domain, height, pad) / height) * 100 : 50;
  const isLatest = index === count - 1;
  function fromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = ((event.clientX - box.left) / box.width * width - pad) / (width - pad * 2);
    setPicked(nearestIndex(fraction, count));
  }
  return <Card title="Technical readiness" meta={count ? `${count} ${count === 1 ? "audit" : "audits"}` : undefined}>
    {scansState !== "ready" || !point ? <Pending state={scansState} empty={windowNote ? `No technical audit for this exact URL in ${windowNote}.` : "No technical audit saved for this exact URL yet."} /> : <>
      <div className="ovc-total" aria-live="polite"><strong>{point.score}<small>/100</small></strong>
        {delta !== null && <span className="ovc-chip" data-tone={delta < 0 ? "warn" : delta > 0 ? "good" : "neutral"}>{delta > 0 ? "▲ +" : delta < 0 ? "▼ " : ""}{delta} vs previous audit</span>}
        {point.score < 70 && <span className="ovc-chip" data-tone="warn">Below 70</span>}</div>
      <p className="ovc-sub">{isLatest ? "Latest audit" : `Audit ${index + 1} of ${count}`} · {shortDate(point.createdAt)}{!isLatest && <> · <button type="button" className="ovc-reset" onClick={() => setPicked(null)}>Show latest</button></>}</p>
      {count > 1 ? <div className="ovc-scrub" role="slider" tabIndex={0} aria-label="Technical readiness audits" aria-valuemin={1} aria-valuemax={count} aria-valuenow={index + 1}
        aria-valuetext={`${point.score} out of 100 on ${shortDate(point.createdAt)}, audit ${index + 1} of ${count}`}
        onKeyDown={event => { const next = scrubIndex(event.key, index, count); if (next !== null) { event.preventDefault(); setPicked(next); } }}
        onPointerDown={event => { dragging.current = true; event.currentTarget.setPointerCapture?.(event.pointerId); fromPointer(event); }}
        onPointerMove={event => { if (dragging.current || event.pointerType === "mouse") fromPointer(event); }}
        onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }}>
        <svg className="ovc-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={width} y1={guide} y2={guide} className="ovc-guide" />
          <polygon points={`${pad},${height - pad} ${line} ${width - pad},${height - pad}`} className="ovc-area" />
          <polyline points={line} className="ovc-line" />
        </svg>
        <span className="ovc-cursor" style={{ left: `${xPercent}%` }} aria-hidden="true" />
        <span className="ovc-dot" style={{ left: `${xPercent}%`, top: `${yPercent}%` }} aria-hidden="true" />
      </div> : <p className="ovc-note">Run another audit to see a trend.</p>}
      {count > 1 && <footer className="ovc-foot"><span>{shortDate(trend.points[0].createdAt)}</span><span>Drag or use arrow keys · dashed line 70 · scale {domain[0]}–{domain[1]}</span><span>{shortDate(trend.points[count - 1].createdAt)}</span></footer>}
    </>}
  </Card>;
}

/** Compact chart cards summarising the selected website’s saved records. */
export const OverviewVisualCards = memo(function OverviewVisualCards(props: OverviewVisualCardsProps) {
  return <section className="ovc-grid" aria-label="Overview charts">
    <AppearanceCard state={props.state} named={props.named} cited={props.cited} />
    <CoverageCard state={props.state} latest={props.latest} unrun={props.unrun} />
    <SourcesCard state={props.state} answers={props.answers} targetDomain={props.targetDomain} />
    <ActivityCard state={props.state} attempts={props.attempts} historyPartial={props.historyPartial} now={props.now} windowNote={props.windowNote} />
    <ReadinessCard scans={props.scans} scansState={props.scansState} windowNote={props.windowNote} />
  </section>;
});
