import type { PublicSearchObservation } from "./public-search-rankings";

export type ObservationBar = { vals: number[]; esc: number; label: string; short: string };
const DAY = 86400000;
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Published history counts only. An empty bin means no published record in this input, not a failed collection. */
export function publicObservationChart(observations: readonly Pick<PublicSearchObservation, "model" | "observedAt">[]) {
  const counts = [...new Set(observations.map(item => item.model))].map(model => ({ model, count: observations.filter(item => item.model === model).length })).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));
  const groups = counts.length <= 4 ? counts.map(item => item.model) : [...counts.slice(0, 3).map(item => item.model), "Other models"];
  if (!observations.length) return { counts, groups, day: [], week: [] };
  const end = Math.floor(Math.max(...observations.map(item => Date.parse(item.observedAt))) / DAY) * DAY;
  function series(size: number, width: number): ObservationBar[] {
    return Array.from({ length: size }, (_, index) => {
      const last = end - (size - 1 - index) * width * DAY;
      const first = last - (width - 1) * DAY;
      const records = observations.filter(item => Date.parse(item.observedAt) >= first && Date.parse(item.observedAt) < last + DAY);
      return { vals: groups.map(model => records.filter(item => model === "Other models" ? !groups.slice(0, 3).includes(item.model) : item.model === model).length), esc: 0, label: width === 1 ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`, short: shortDate(first) };
    });
  }
  return { counts, groups, day: series(14, 1), week: series(8, 7) };
}
