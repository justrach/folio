"use client";

import { useMemo, useState } from "react";
import type { EvaluationRun } from "@/lib/evals";
import "./activity-bars.css";

type Bucket = { key: string; label: string; completed: number; failed: number; running: number; needs: number; total: number };

const DAY = 86_400_000;
const SERIES = [
  { key: "completed", label: "Completed" },
  { key: "running", label: "Running" },
  { key: "needs", label: "Needs you" },
  { key: "failed", label: "Failed" },
] as const;

function bucketize(runs: EvaluationRun[], days: number): Bucket[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets: Bucket[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const start = today.getTime() - offset * DAY;
    const date = new Date(start);
    buckets.push({
      key: String(start),
      label: date.toLocaleDateString(undefined, days > 7 ? { month: "short", day: "numeric" } : { weekday: "short" }),
      completed: 0, failed: 0, running: 0, needs: 0, total: 0,
    });
  }
  const index = new Map(buckets.map(bucket => [bucket.key, bucket]));
  for (const run of runs) {
    const created = new Date(run.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    created.setHours(0, 0, 0, 0);
    const bucket = index.get(String(created.getTime()));
    if (!bucket) continue;
    const status = run.status;
    if (status === "completed") bucket.completed += 1;
    else if (status === "failed" || status === "cancelled") bucket.failed += 1;
    else if (status === "requires_action") bucket.needs += 1;
    else bucket.running += 1;
    bucket.total += 1;
  }
  return buckets;
}

/** Activity as stacked bars: hover rings a day and a tooltip follows it. */
export function ActivityBars({ runs }: { runs: EvaluationRun[] }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [hovered, setHovered] = useState<number | null>(null);
  const buckets = useMemo(() => bucketize(runs, days), [runs, days]);
  const peak = Math.max(1, ...buckets.map(bucket => bucket.total));
  const active = hovered === null ? null : buckets[hovered];

  return (
    <section className="activity-bars" aria-label="Runs per day">
      <header className="activity-bars-head">
        <div>
          <h3>Activity</h3>
          <p>{active ? `${active.label} · ${active.total} ${active.total === 1 ? "run" : "runs"}` : "Runs recorded per day"}</p>
        </div>
        <div className="activity-bars-toggle" role="group" aria-label="Range">
          <button type="button" aria-pressed={days === 7} onClick={() => { setDays(7); setHovered(null); }}>7d</button>
          <button type="button" aria-pressed={days === 30} onClick={() => { setDays(30); setHovered(null); }}>30d</button>
        </div>
      </header>
      <div className="activity-bars-plot" onMouseLeave={() => setHovered(null)}>
        {buckets.map((bucket, index) => (
          <div
            key={bucket.key}
            className={`activity-bar ${hovered === index ? "ringed" : ""}`}
            onMouseEnter={() => setHovered(index)}
            onFocus={() => setHovered(index)}
            tabIndex={0}
            role="img"
            aria-label={`${bucket.label}: ${bucket.total} runs`}
          >
            <div className="activity-bar-stack" style={{ height: `${(bucket.total / peak) * 100}%` }}>
              {SERIES.map(series => bucket[series.key] > 0 && (
                <span
                  key={series.key}
                  className={`activity-bar-seg seg-${series.key}`}
                  style={{ flexGrow: bucket[series.key] }}
                  title={`${series.label}: ${bucket[series.key]}`}
                />
              ))}
            </div>
            <span className="activity-bar-label">{days === 7 ? bucket.label : ""}</span>
            {hovered === index && bucket.total > 0 && (
              <div className="activity-bar-tip" role="status">
                <strong>{bucket.total} runs</strong>
                {SERIES.filter(series => bucket[series.key] > 0).map(series => (
                  <span key={series.key}><i className={`seg-${series.key}`} />{series.label} {bucket[series.key]}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
