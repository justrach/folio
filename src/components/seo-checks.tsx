"use client";

import { useState } from "react";
import { Check as CheckIcon, ChevronDown, Minus, X } from "lucide-react";
import type { Check } from "@/lib/demo-data";
import "./seo-checks.css";

const filters = [
  { status: "pass", label: "Pass" },
  { status: "warning", label: "Needs improvement" },
  { status: "fail", label: "Fail" },
  { status: "optional", label: "Optional" },
] as const;

function CheckRow({ check }: { check: Check }) {
  // Shorten scanner boilerplate for display; saved evidence stays unchanged.
  const detail = check.detail
    .replace(/title element\(s\);/g, "title ·")
    .replace(/description\(s\);/g, "description ·")
    .replace(/Recommended heuristic: /g, "Guide: ")
    .replace(/nonempty H1 heading\(s\) found/g, "H1 heading(s)")
    .replace(/canonical link\(s\);/g, "canonical ·")
    .replace("No noindex/none directive observed in supported meta tags or the response header.", "No indexing block found in checked tags or headers.")
    .replace("Search inclusion and robots.txt access are not established.", "Search inclusion and robots.txt access remain unverified.")
    .replace("words found after removing scripts, styles, navigation and footer markup.", "readable words (excluding scripts, styles, navigation and footer).")
    .replace("A text-availability heuristic; client-rendered content is not included.", "Client-rendered content excluded; text availability only.")
    .replace("links to another path on the same origin found.", "internal links found.");
  const [finding, ...notes] = detail.split(/(?<=[.!?])\s+(?=[A-Z])/);
  return (
    <details className={`seo-check-item ${check.status}`}>
      <summary>
        <span className="seo-check-icon" aria-hidden="true">{check.status === "pass" ? <CheckIcon size={16} /> : check.status === "fail" ? <X size={16} /> : <Minus size={16} />}</span>
        <span className="seo-check-name">{check.label}</span>
        <ChevronDown className="seo-check-chevron" size={16} aria-hidden="true" />
      </summary>
      <div className="seo-check-detail">
        <p>{finding}</p>
        {notes.length > 0 && <ul>{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
        {check.maxPoints > 0 && <span className="seo-check-score">{check.points}/{check.maxPoints} points</span>}
      </div>
    </details>
  );
}

export function SeoChecks({ checks, sample }: { checks: Check[]; sample: boolean }) {
  const [filter, setFilter] = useState<Check["status"] | null>(null);
  const visible = checks.filter(check => check.status === filter);
  const breakdown = filters.map(item => ({ ...item, count: checks.filter(check => check.status === item.status).length }));
  return (
    <section className="panel seo-checks-panel" aria-label="SEO checks">
      <div className="panel-heading"><h2>The details behind your score</h2>{sample && <span className="sample-label">Sample data</span>}</div>
      <div className="seo-check-layout">
        <div className="seo-check-breakdown" role="group" aria-label="Check breakdown">
          <div className="seo-breakdown-heading"><strong>{checks.length} checks</strong><span>Share of all checks</span></div>
          {breakdown.map(({ status, label, count }) => {
            const percentage = checks.length ? count / checks.length * 100 : 0;
            return <button type="button" key={status} className={`seo-breakdown-bar ${status}`} aria-pressed={filter === status} aria-controls="seo-check-results" onClick={() => setFilter(status)}>
              <span className="seo-bar-label">{label}<strong>{Math.round(percentage)}%</strong></span>
              <span className="seo-bar-track" aria-hidden="true"><span style={{ width: `${percentage}%` }} /></span>
              <span className="seo-bar-count">{count} {count === 1 ? "check" : "checks"}{status === "optional" ? " · Not scored" : ""}</span>
            </button>;
          })}
        </div>
        <div className="seo-check-inspector">
          <div className="seo-check-filters" role="group" aria-label="Filter checks">
            {breakdown.map(({ status, label, count }) => <button type="button" key={status} className={status} aria-pressed={filter === status} aria-controls="seo-check-results" onClick={() => setFilter(status)}>{label}<span>{count}</span></button>)}
          </div>
          <div id="seo-check-results" className="seo-check-results" key={filter}>
            {filter === null ? <div className="seo-check-placeholder"><ChevronDown size={22} aria-hidden="true" /><strong>Choose a status to explore</strong><p>See the checks, then open a row for details.</p></div> : <>
              {filter === "optional" && <p className="seo-unscored-note">Informational only · Does not affect your score.</p>}
              {visible.map(check => <CheckRow key={check.id} check={check} />)}
              {!visible.length && <p className="seo-check-empty">{filter === "fail" ? "No failed checks." : filter === "warning" ? "No checks need improvement." : filter === "optional" ? "No optional checks." : "No passed checks yet."}</p>}
            </>}
          </div>
        </div>
      </div>
    </section>
  );
}
