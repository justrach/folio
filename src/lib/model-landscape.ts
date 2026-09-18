export const LANDSCAPE_MODELS = [
  { id: 'gpt-6-astra', label: 'Astra', color: '#244f3d' },
  { id: 'gpt-5.6-sol', label: 'Sol', color: '#987442' },
  { id: 'gpt-5.6-terra', label: 'Terra', color: '#667d54' },
  { id: 'gpt-5.6-luna', label: 'Luna', color: '#465d68' },
] as const;
export type LandscapePoint = { queryId: string; model: string; status: string; seconds: number | null; costUsd: number | null };
export type ModelLandscapeData = { format: string; observedAt: string; questionCount: number; planned: number; points: LandscapePoint[] };
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a,b)=>a-b), middle=Math.floor(ordered.length/2);
  return ordered.length%2 ? ordered[middle] : (ordered[middle-1]+ordered[middle])/2;
}
export function summarizeLandscape(data: ModelLandscapeData) {
  return LANDSCAPE_MODELS.map(model => {
    const attempts=data.points.filter(p=>p.model===model.id);
    const completed=attempts.filter(p=>p.status==='completed');
    const plottable=completed.filter(p=>p.seconds!==null&&p.seconds>=0&&Number.isFinite(p.seconds)&&p.costUsd!==null&&p.costUsd>0&&Number.isFinite(p.costUsd));
    const known=attempts.filter(p=>p.costUsd!==null&&p.costUsd>=0&&Number.isFinite(p.costUsd));
    return {...model, attempts:attempts.length, completed:completed.length, plotted:plottable.length,
      seconds:median(plottable.map(p=>p.seconds!)), costUsd:median(plottable.map(p=>p.costUsd!)),
      totalCostUsd:known.length?known.reduce((sum,p)=>sum+p.costUsd!,0):null, knownCosts:known.length};
  });
}
