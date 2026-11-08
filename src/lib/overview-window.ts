/**
 * Date window and CSV export helpers for the private overview. The window only
 * narrows records already loaded in this browser; it never implies server-side
 * coverage beyond them.
 */
export type WindowPreset = "all" | "7" | "30" | "90" | "custom";
export type DateWindow = { preset: WindowPreset; from: string | null; to: string | null };
export const ALL_LOADED: DateWindow = { preset: "all", from: null, to: null };
export const WINDOW_PRESETS: { key: Exclude<WindowPreset, "custom">; label: string }[] = [
  { key: "7", label: "Last 7 days" }, { key: "30", label: "Last 30 days" }, { key: "90", label: "Last 90 days" }, { key: "all", label: "All loaded" },
];

const DAY = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
const validDay = (day: string) => DAY_RE.test(day) && Number.isFinite(dayStart(day)) && utcDay(dayStart(day)) === day;

/** Inclusive UTC day bounds; custom windows with reversed days are swapped. */
export function windowBounds(window: DateWindow, now: number): { from: string | null; to: string | null } {
  if (window.preset === "all") return { from: null, to: null };
  if (window.preset === "custom") {
    const from = window.from && validDay(window.from) ? window.from : null;
    const to = window.to && validDay(window.to) ? window.to : null;
    return from && to && from > to ? { from: to, to: from } : { from, to };
  }
  const today = utcDay(now);
  return { from: utcDay(dayStart(today) - (Number(window.preset) - 1) * DAY), to: today };
}

export function inWindow(createdAt: string, bounds: { from: string | null; to: string | null }): boolean {
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time)) return false;
  const day = utcDay(time);
  return (!bounds.from || day >= bounds.from) && (!bounds.to || day <= bounds.to);
}

export function windowLabel(bounds: { from: string | null; to: string | null }, format: (day: string) => string): string {
  if (!bounds.from && !bounds.to) return "All loaded history";
  if (bounds.from && bounds.to) return bounds.from === bounds.to ? format(bounds.from) : `${format(bounds.from)} – ${format(bounds.to)}`;
  return bounds.from ? `From ${format(bounds.from)}` : `Until ${format(bounds.to!)}`;
}

export type DailyPoint = { day: string; total: number; completed: number; other: number; selected: boolean };

/** One point per UTC day from the first loaded attempt to today; empty when nothing is loaded. */
export function dailySeries(items: readonly { createdAt: string; status: string }[], bounds: { from: string | null; to: string | null }, now: number, maxDays = 366): DailyPoint[] {
  const counts = new Map<string, { total: number; completed: number }>();
  let first: string | null = null;
  for (const item of items) {
    const time = Date.parse(item.createdAt);
    if (!Number.isFinite(time) || time > now) continue;
    const day = utcDay(time);
    const entry = counts.get(day) ?? { total: 0, completed: 0 };
    entry.total++; if (item.status === "completed") entry.completed++;
    counts.set(day, entry);
    if (!first || day < first) first = day;
  }
  if (!first) return [];
  const end = dayStart(utcDay(now));
  const start = Math.max(dayStart(first), end - (maxDays - 1) * DAY);
  const points: DailyPoint[] = [];
  for (let time = start; time <= end; time += DAY) {
    const day = utcDay(time); const entry = counts.get(day) ?? { total: 0, completed: 0 };
    points.push({ day, total: entry.total, completed: entry.completed, other: entry.total - entry.completed,
      selected: (!bounds.from || day >= bounds.from) && (!bounds.to || day <= bounds.to) });
  }
  return points;
}

/** Quote a CSV cell and neutralise spreadsheet formula prefixes. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@])/.test(text)) text = `'${text}`;
  return /[",\r\n']/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const byteSize = (text: string) => new TextEncoder().encode(text).length;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function exportFilename(host: string, kind: string, bounds: { from: string | null; to: string | null }, today: string): string {
  const safeHost = host.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-+|-+$/g, "") || "website";
  const range = bounds.from || bounds.to ? `${bounds.from ?? "start"}_${bounds.to ?? today}` : `all-loaded_${today}`;
  return `folio-${safeHost}-${kind}-${range}.csv`;
}
