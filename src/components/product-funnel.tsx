"use client";

import {useId, useRef, useState} from 'react';
import {ArrowDownRight, ChevronDown} from 'lucide-react';
import {funnelRates, type FunnelStage} from '@/lib/product-funnels';
import './product-funnel.css';

const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toLocaleString('en-US', {maximumFractionDigits: 1})}%`;

/** Original Folio SVG renderer; no Arc Pro source or runtime is included. */
export function ProductFunnel({stages, label}: {stages: FunnelStage[]; label: string}) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const clip = `funnel-${useId().replaceAll(':', '')}`;
  const rates = funnelRates(stages), selected = Math.min(active, Math.max(0, stages.length - 1));
  const first = stages[0]?.value ?? 0, current = rates[selected];
  const width = 800, height = 220, cell = width / Math.max(1, stages.length);
  const half = (i: number) => first ? 90 * stages[i].value / first : 0;
  // Flat reading areas, with a cubic connector between adjacent stages.
  const edge = (bottom: boolean) => {
    const indices = stages.map((_, i) => i);
    if (bottom) indices.reverse();
    let path = '';
    for (const [at, i] of indices.entries()) {
      const y = height / 2 + (bottom ? 1 : -1) * half(i);
      const start = i * cell + 12, end = (i + 1) * cell - 12;
      if (!at) path += `${bottom ? 'L' : 'M'}${bottom ? end : start},${y}`;
      else {
        const previous = indices[at - 1], py = height / 2 + (bottom ? 1 : -1) * half(previous);
        const boundary = bottom ? (i + 1) * cell : i * cell;
        path += `C${boundary},${py} ${boundary},${y} ${bottom ? end : start},${y}`;
      }
      path += `L${bottom ? start : end},${y}`;
    }
    return path;
  };
  const band = stages.length ? `${edge(false)}${edge(true)}Z` : '';
  function choose(index: number) {setActive(index); buttons.current[index]?.focus();}

  return <figure className="product-funnel" aria-label={label}>
    <figcaption className="product-funnel-summary"><span>From first step to last</span><strong>{percent(rates.at(-1)?.ofStart ?? null)}</strong><small>{stages.at(-1)?.value ?? 0} of {first} observed sessions</small></figcaption>
    {!first && <p className="product-funnel-empty" role="status">No matching journeys recorded yet. Counts stay at zero until the first step is observed.</p>}
    <div className="product-funnel-stage-grid" style={{gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`}} onKeyDown={event => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      choose(event.key === 'Home' ? 0 : event.key === 'End' ? stages.length - 1 : Math.max(0, Math.min(stages.length - 1, selected + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1))));
    }}>
      {rates.map((stage, i) => <button key={stage.key} ref={node => {buttons.current[i] = node;}} type="button" aria-pressed={i === selected} onClick={() => setActive(i)}>
        <span className="product-funnel-step">0{i + 1} · {stage.label}</span><strong>{stage.value.toLocaleString()}</strong><small>{i === 0 ? 'Starting sessions' : `${percent(stage.ofStart)} of start`}</small>
        <span className="product-funnel-mobile-bar" aria-hidden="true"><i style={{width: `${(stage.ofStart ?? 0) * 100}%`}}/></span>
      </button>)}
    </div>
    {first > 0 && <svg className="product-funnel-band" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs><clipPath id={clip}><path d={band}/></clipPath></defs>
      {stages.map((stage, i) => <line key={stage.key} x1={(i + .5) * cell} x2={(i + .5) * cell} y1="0" y2={height} className="product-funnel-guide"/>)}
      <path d={band} className="product-funnel-fill"/>
      <rect x={selected * cell} y="0" width={cell} height={height} clipPath={`url(#${clip})`} className="product-funnel-selected"/>
    </svg>}
    <div className="product-funnel-dropoffs" style={{gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`}} aria-hidden="true">{rates.map((stage, i) => <span key={stage.key}>{i > 0 && <><ArrowDownRight size={13}/>{stage.notObserved} not observed next</>}</span>)}</div>
    {current && <p className="product-funnel-reading" aria-live="polite"><strong>{current.label}</strong><span>{current.value} sessions · {percent(current.ofStart)} of start</span><span>{selected ? `${current.notObserved} did not reach this step in the observed session history.` : 'Each session counts once at this step.'}</span></p>}
    <details className="product-funnel-data"><summary>View stage data<ChevronDown size={14}/></summary><div><table><caption>{label} · observed sessions in order</caption><thead><tr><th>Stage</th><th>Sessions</th><th>Of start</th><th>Kept from previous</th></tr></thead><tbody>{rates.map(s => <tr key={s.key}><th scope="row">{s.label}</th><td>{s.value}</td><td>{percent(s.ofStart)}</td><td>{percent(s.retained)}</td></tr>)}</tbody></table></div></details>
  </figure>;
}
