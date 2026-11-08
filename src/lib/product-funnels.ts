import type {ProductEvent} from './product-analytics-schema';
import {researchFunnel, type UsageEvent} from './product-analytics-store';

export type Journey = 'research' | 'content' | 'repair';
export type FunnelStage = {key: string; label: string; value: number};
export const JOURNEYS: Record<Journey, {label: string; note: string}> = {
  research: {label: 'Website research', note: 'Product sessions only. Evaluations are optional, so this is one possible path—not a required setup flow.'},
  content: {label: 'Content demo', note: 'Demo sessions only. Opening, saving and exporting are local interactions, not published posts or live agent calls.'},
  repair: {label: 'Repair requests', note: 'Bundle prepared means generation completed in the browser. It does not confirm the file was saved or a repair was applied.'},
};

const researchLabels = ['Check requested', 'Check returned', 'Evaluation requested', 'Report viewed', 'Evidence requested'];
export function journeyStages(events: UsageEvent[], journey: Journey): FunnelStage[] {
  if (journey === 'research') return researchFunnel(events).map((s, i) => ({key: s.event, label: researchLabels[i], value: s.count}));
  const definitions: {event: ProductEvent; label: string}[] = journey === 'content'
    ? [{event: 'draft_opened', label: 'Draft opened'}, {event: 'draft_saved', label: 'Draft saved'}, {event: 'export_requested', label: 'Caption requested'}]
    : [{event: 'repair_download_requested', label: 'Repair requested'}, {event: 'repair_download_result', label: 'Bundle prepared'}];
  const counts = definitions.map(() => 0);
  const sessions = new Map<string, UsageEvent[]>();
  for (const e of events) {
    if (journey === 'content' ? e.surface !== 'content_demo' : !['product', 'repair_demo'].includes(e.surface)) continue;
    // Never complete a product journey with a demo event from the same browser session.
    const key = `${e.sessionId}:${e.surface}`;
    sessions.set(key, [...(sessions.get(key) ?? []), e]);
  }
  for (const session of sessions.values()) {
    let step = 0;
    for (const e of [...session].sort((a, b) => a.at.localeCompare(b.at))) {
      if (e.event !== definitions[step].event || e.properties.result === 'failed') continue;
      if (e.event === 'repair_download_result' && e.properties.result !== 'success') continue;
      if (e.event === 'export_requested' && e.properties.kind !== 'caption') continue;
      counts[step++]++;
      if (step === definitions.length) break;
    }
  }
  return definitions.map((s, i) => ({key: s.event, label: s.label, value: counts[i]}));
}

export function funnelRates(stages: FunnelStage[]) {
  const start = stages[0]?.value ?? 0;
  return stages.map((stage, i) => {
    const previous = i ? stages[i - 1].value : start;
    return {...stage, ofStart: start ? stage.value / start : null,
      retained: previous ? stage.value / previous : null,
      notObserved: i ? previous - stage.value : 0};
  });
}
