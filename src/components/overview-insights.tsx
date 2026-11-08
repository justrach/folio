"use client";

import { LANDSCAPE_MODELS } from "@/lib/model-landscape";
import type { PublicSearchObservation } from "@/lib/public-search-rankings";
import { publicObservationChart } from "@/lib/public-observation-chart";
import { StackedBars } from "./bencho/stacked-bars/StackedBars";
import "./bencho/stacked-bars/StackedBars.css";

const modelLabel = (name: string) => LANDSCAPE_MODELS.find(model => model.id === name)?.label ?? name;

/** Counts published observations, not visits, spend, quality, or collection success. */
export function OverviewInsights({ observations }: { observations: PublicSearchObservation[] }) {
  if (!observations.length) return null;
  const { counts, groups, day, week } = publicObservationChart(observations);
  return <details className="overview-insights-disclosure"><summary>Activity and models<span>{observations.length} saved records</span></summary><section className="overview-insights" aria-label="Published observation insights">
    <div className="overview-activity-panel">
      <StackedBars colour="Mono" gap={8} categories={groups.map(modelLabel)} series={{ Day: day, Week: week }} />
      <p className="overview-chart-note">Recorded dates, not a live traffic feed. Each segment is one model’s published observations.</p>
      <details className="overview-chart-data"><summary>View chart data</summary><table><caption>Published observations by recorded day, UTC</caption><thead><tr><th>Date</th>{groups.map(model => <th key={model}>{modelLabel(model)}</th>)}</tr></thead><tbody>{day.map(bar => <tr key={bar.label}><th>{bar.label}</th>{bar.vals.map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody></table></details>
    </div>
    <div className="overview-model-panel"><header><h2>Answers by model</h2><span>{observations.length} saved observations</span></header><ol>{counts.slice(0, 5).map(item => <li key={item.model}><div><span>{modelLabel(item.model)}</span><strong>{item.count}</strong></div><div className="overview-model-track" aria-hidden="true"><i style={{ width: `${item.count / observations.length * 100}%` }} /></div></li>)}</ol><p>Includes published history. The question list uses the latest answer for each task.</p></div>
  </section></details>;
}
