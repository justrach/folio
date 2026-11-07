/**
 * Pure helpers for the private overview chart cards. Every value is derived
 * from saved records already loaded by the overview; nothing is estimated.
 */
export type AttemptStatus = "queued" | "running" | "requires_action" | "completed" | "failed" | "cancelled";
export type NamedState = "yes" | "no" | "unknown";

export type ActivityCell = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
export type ActivityGrid = { weeks: ActivityCell[][]; total: number; peak: ActivityCell | null; activeDays: number };

const DAY = 86_400_000;
const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Calendar of saved attempts per UTC day for the last `weeks` weeks ending on `now`'s week. */
export function activityGrid(createdAt: readonly string[], now: Date, weeks = 12): ActivityGrid {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = today + (6 - new Date(today).getUTCDay()) * DAY; // Saturday of this week
  const start = end - (weeks * 7 - 1) * DAY;
  const counts = new Map<string, number>();
  for (const value of createdAt) {
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time < start || time >= end + DAY) continue;
    const key = isoDay(time);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const max = Math.max(0, ...counts.values());
  const cells: ActivityCell[] = [];
  for (let time = start; time <= end; time += DAY) {
    const date = isoDay(time);
    const count = time > today ? 0 : counts.get(date) ?? 0;
    const level = (count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))) as ActivityCell["level"];
    cells.push({ date, count, level });
  }
  const grid: ActivityCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7));
  const peak = cells.reduce<ActivityCell | null>((best, cell) => cell.count > (best?.count ?? 0) ? cell : best, null);
  return { weeks: grid, total: [...counts.values()].reduce((a, b) => a + b, 0), peak, activeDays: counts.size };
}

export type RankedDomain = { domain: string; answers: number; share: number; isTarget: boolean };

/** Domains ranked by how many answers cited them (each answer counts a domain once). */
export function citedDomains(answers: readonly { citationUrls: readonly string[] }[], targetDomain: string | null, limit = 5): RankedDomain[] {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    const seen = new Set<string>();
    for (const url of answer.citationUrls) {
      try {
        const host = new URL(url).hostname.replace(/\.$/, "").replace(/^www\./, "").toLowerCase();
        if (host) seen.add(host);
      } catch { /* malformed citations are skipped */ }
    }
    for (const host of seen) counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  const total = answers.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, answers: count, share: total ? count / total : 0, isTarget: domain === targetDomain }));
}

export type Breakdown = { key: string; label: string; count: number }[];

export function appearanceBreakdown(states: readonly NamedState[]): Breakdown {
  const count = (state: NamedState) => states.filter(item => item === state).length;
  return [
    { key: "yes", label: "Named your site", count: count("yes") },
    { key: "no", label: "Not named", count: count("no") },
    { key: "unknown", label: "Identity unknown", count: count("unknown") },
  ];
}

export function attemptBreakdown(statuses: readonly AttemptStatus[], unrun: number | null): Breakdown {
  const count = (...values: AttemptStatus[]) => statuses.filter(item => values.includes(item)).length;
  const rows: Breakdown = [
    { key: "completed", label: "Completed", count: count("completed") },
    { key: "pending", label: "Queued or running", count: count("queued", "running") },
    { key: "attention", label: "Needs attention", count: count("requires_action") },
    { key: "failed", label: "Failed", count: count("failed") },
    { key: "cancelled", label: "Cancelled", count: count("cancelled") },
  ];
  if (unrun !== null) rows.push({ key: "unrun", label: "Not run", count: unrun });
  return rows;
}

export type ScorePoint = { createdAt: string; score: number };
export type ScoreTrend = { points: ScorePoint[]; latest: ScorePoint | null; delta: number | null };

/** Oldest→newest readiness scores; delta only when two real audits exist. */
export function scoreTrend(scans: readonly { createdAt: string; seoScore: number }[], limit = 12): ScoreTrend {
  const points = scans
    .filter(scan => Number.isFinite(scan.seoScore) && Number.isFinite(Date.parse(scan.createdAt)))
    .map(scan => ({ createdAt: scan.createdAt, score: Math.max(0, Math.min(100, scan.seoScore)) }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-limit);
  const latest = points.at(-1) ?? null;
  const delta = points.length > 1 ? points[points.length - 1].score - points[points.length - 2].score : null;
  return { points, latest, delta };
}

/** Visible 0–100 score range padded around the data (and an optional reference value). */
export function scoreDomain(values: readonly number[], reference?: number): [number, number] {
  const all = reference === undefined ? values : [...values, reference];
  if (!all.length) return [0, 100];
  const low = Math.max(0, Math.floor((Math.min(...all) - 5) / 5) * 5);
  const high = Math.min(100, Math.ceil((Math.max(...all) + 5) / 5) * 5);
  return high > low ? [low, high] : [0, 100];
}

/** Y coordinate for a value within [min, max] inside height with padding. */
export const scaleY = (value: number, [min, max]: [number, number], height: number, pad = 4) =>
  height - pad - ((value - min) / (max - min)) * (height - pad * 2);

/** SVG polyline points for a series inside width×height with padding. */
export function sparkPath(values: readonly number[], width: number, height: number, pad = 4, domain: [number, number] = [0, 100]): string {
  if (!values.length) return "";
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values.map((value, index) => `${(pad + index * step).toFixed(1)},${scaleY(value, domain, height, pad).toFixed(1)}`).join(" ");
}
