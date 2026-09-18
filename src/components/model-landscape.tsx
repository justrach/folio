"use client";
import { useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { PUBLIC_SEARCH_QUERIES } from '@/lib/public-search-rankings';
import artifact from '@/data/model-landscape.json';
import type { ModelLandscapeData } from '@/lib/model-landscape';
const data: ModelLandscapeData = artifact;
import { LANDSCAPE_MODELS, summarizeLandscape } from '@/lib/model-landscape';
import './model-landscape.css';
const dollars=(v:number|null)=>v===null?'Not reported':`$${v.toFixed(v<0.1?4:3)}`;
export function ModelLandscape() {
  const params=useSearchParams(), path=usePathname(), selected=params.get('model');
  const summaries=summarizeLandscape(data);
  const dots=data.points.filter(p=>p.status==='completed'&&p.costUsd!==null&&p.costUsd>0&&p.seconds!==null&&p.seconds>=0);
  const costs=dots.map(p=>p.costUsd!);
  const low=costs.length?Math.floor(Math.log10(Math.min(...costs))):-3;
  const high=costs.length?Math.max(low+1,Math.ceil(Math.log10(Math.max(...costs)))):0;
  const maxSeconds=Math.max(60,Math.ceil(Math.max(0,...dots.map(p=>p.seconds!))/60)*60);
  const x=(v:number)=>86+(Math.log10(v)-low)/(high-low)*690;
  const y=(v:number)=>360-v/maxSeconds*290;
  const link=(model:string)=>{const next=new URLSearchParams(params.toString());if(selected===model)next.delete('model');else {next.set('model',model);const first=data.points.find(p=>p.model===model&&p.status==='completed');if(first)next.set('query',first.queryId)}return `${path}?${next}`};
  const mx=(v:number)=>48+(Math.log10(v)-low)/(high-low)*264;
  const my=(v:number)=>242-v/maxSeconds*188;
  const completed=summaries.reduce((sum,m)=>sum+m.completed,0);
  return <section className="model-landscape" aria-labelledby="landscape-title">
    <header className="landscape-heading"><div><p className="landscape-kicker">THE FOLIO INDEX / MODEL FIELD NOTES</p><h2 id="landscape-title">The cost of<br/><em>an answer.</em></h2><p className="landscape-intro">Same questions. Four models. Explore the time and estimated token spend behind real web research.</p></div><div className="landscape-cohort"><strong>{data.questionCount} × 4</strong><span>shared questions × models</span><p>{completed} completed / {data.planned} planned attempts</p></div></header>
    <div className="landscape-chart-heading"><h3>Time × token cost</h3><span>Small dots: completed runs · Large dots: model medians</span></div>
    <div className="landscape-plot">
      <svg className="landscape-svg-desktop" viewBox="0 0 900 440" role="img" aria-labelledby="landscape-chart-title landscape-chart-desc">
        <title id="landscape-chart-title">Observed research time versus estimated token cost</title><desc id="landscape-chart-desc">Lower and further left means less time and lower token cost. Horizontal cost scale is logarithmic. Exact model summaries and completion counts follow in a table. Failed runs are excluded from dots but included in cost totals.</desc>
        <rect x="86" y="70" width="690" height="290" fill="#fbf8ee"/>
        {[0,1,2,3,4].map(i=>{const v=maxSeconds*i/4;return <g key={i}><line x1="86" x2="776" y1={y(v)} y2={y(v)} stroke="#d5d7c9" strokeDasharray={i?'3 5':undefined}/><text x="71" y={y(v)+4} textAnchor="end" className="landscape-tick">{Math.round(v)}s</text></g>})}
        {Array.from({length:high-low+1},(_,i)=>low+i).map(pow=><g key={pow}><line x1={x(10**pow)} x2={x(10**pow)} y1="70" y2="360" stroke="#e1e1d4"/><text x={x(10**pow)} y="387" textAnchor="middle" className="landscape-tick">${(10**pow).toLocaleString('en-US',{maximumFractionDigits:5})}</text></g>)}
        <text x="431" y="423" textAnchor="middle" className="landscape-axis">Estimated token cost / run (USD · log scale)</text>
        <text transform="translate(22 215) rotate(-90)" textAnchor="middle" className="landscape-axis">Time to recorded answer</text>
        <text x="100" y="347" className="landscape-direction">↙ Less time, lower token cost</text>
        {dots.map((p,i)=>{const m=LANDSCAPE_MODELS.find(m=>m.id===p.model);return <circle key={i} cx={x(p.costUsd!)} cy={y(p.seconds!)} r="4.5" fill={m?.color} opacity={selected&&selected!==p.model?.toString()?0.12:0.38}><title>{`${m?.label}: ${Math.round(p.seconds!)} seconds, ${dollars(p.costUsd)} estimated token cost`}</title></circle>})}
        {summaries.filter(m=>m.costUsd!==null&&m.seconds!==null).map((m,i)=><g key={m.id} opacity={selected&&selected!==m.id?0.25:1}><circle cx={x(m.costUsd!)} cy={y(m.seconds!)} r="10" fill={m.color} stroke="#faf7eb" strokeWidth="3"/><path d={`M ${x(m.costUsd!)+11} ${y(m.seconds!)} L 800 ${88+i*58}`} fill="none" stroke={m.color} strokeWidth="1" opacity=".55"/><text x="808" y={92+i*58} fill={m.color} className="landscape-label">{m.label}</text><text x="808" y={109+i*58} className="landscape-tick">{dollars(m.costUsd)}</text></g>)}
        {!dots.length&&<text x="431" y="205" textAnchor="middle" className="landscape-axis">Awaiting completed observations</text>}
      </svg>
      <svg className="landscape-svg-mobile" viewBox="0 0 340 314" role="img" aria-label="Observed research time versus estimated token cost">
        <text x="48" y="27" className="landscape-axis">Time to recorded answer · seconds</text>
        <rect x="48" y="54" width="264" height="188" fill="#fbf8ee"/>
        {[0,1,2,3].map(i=><g key={i}><line x1="48" x2="312" y1={my(maxSeconds*i/3)} y2={my(maxSeconds*i/3)} stroke="#d5d7c9" strokeDasharray="3 5"/><text x="40" y={my(maxSeconds*i/3)+4} textAnchor="end" className="landscape-tick">{Math.round(maxSeconds*i/3)}</text></g>)}
        {Array.from({length:high-low+1},(_,i)=>low+i).map(pow=><g key={pow}><line x1={mx(10**pow)} x2={mx(10**pow)} y1="54" y2="242" stroke="#e1e1d4"/><text x={mx(10**pow)} y="262" textAnchor="middle" className="landscape-tick">${(10**pow).toLocaleString('en-US',{maximumFractionDigits:5})}</text></g>)}
        {dots.map((p,i)=><circle key={i} cx={mx(p.costUsd!)} cy={my(p.seconds!)} r="3" fill={LANDSCAPE_MODELS.find(m=>m.id===p.model)?.color} opacity={selected&&selected!==p.model?0.1:0.3}/>)}
        {summaries.filter(m=>m.costUsd!==null&&m.seconds!==null).map((m,i)=><g key={m.id} opacity={selected&&selected!==m.id?0.3:1}><circle cx={mx(m.costUsd!)} cy={my(m.seconds!)} r="6" fill={m.color} stroke="#faf7eb" strokeWidth="2"/><text x={Math.max(62,Math.min(286,mx(m.costUsd!)))} y={my(m.seconds!)-10-(i%2)*7} textAnchor="middle" fill={m.color} fontSize="11" fontWeight="650">{m.label}</text></g>)}
        {!dots.length&&<text x="180" y="148" textAnchor="middle" className="landscape-tick">Awaiting completed observations</text>}
        <text x="180" y="293" textAnchor="middle" className="landscape-axis">Token cost · USD (log scale)</text>
      </svg>
    </div>
    <nav className="landscape-models" aria-label="Compare index models">{summaries.map(m=><Link key={m.id} href={link(m.id)} aria-current={selected===m.id?'true':undefined} style={{'--model-color':m.color} as React.CSSProperties}><span className="landscape-model-name"><i/>{m.label}<span aria-hidden="true">↗</span></span><strong>{dollars(m.costUsd)}</strong><span>median token cost / completed run</span><small>{m.completed} / {data.questionCount} completed · {m.seconds===null?'Time unavailable':`${Math.round(m.seconds)}s median`}</small></Link>)}</nav>
    <details className="landscape-details"><summary>Read the numbers & methodology</summary><div className="landscape-table-wrap"><table><caption>Shared 10-question cohort. Token estimates in USD.</caption><thead><tr><th>Model</th><th>Completed</th><th>Plotted</th><th>Median time</th><th>Median token cost</th><th>All-attempt token total</th><th>Costs known</th></tr></thead><tbody>{summaries.map(m=><tr key={m.id}><th>{m.label}</th><td>{m.completed}/{data.questionCount}</td><td>{m.plotted}</td><td>{m.seconds===null?'Unknown':`${Math.round(m.seconds)}s`}</td><td>{dollars(m.costUsd)}</td><td>{dollars(m.totalCostUsd)}</td><td>{m.knownCosts}/{m.attempts}</td></tr>)}</tbody></table></div><p>One attempt per model per question. Dots and medians use completed runs with recorded time and positive estimated token cost; differing completion counts can bias comparisons. Time runs from saved request to saved outcome and includes retrieval delay—it is not token generation speed. Totals include known costs of failed attempts.</p><p>Token estimates use Folio’s saved rate card and reported input, cached input and output usage. Web search, sandbox and other provider charges are excluded. Missing costs remain unknown. These observations measure this workflow, not overall model quality.</p></details>
    <details className="landscape-details landscape-attempts"><summary>Inspect all {data.planned} attempts</summary><div className="landscape-table-wrap"><table><caption>Same questions across all four models. Failed attempts are retained.</caption><thead><tr><th>Question</th><th>Model</th><th>Outcome</th><th>Recorded time</th><th>Token estimate</th></tr></thead><tbody>{data.points.map(p=><tr key={`${p.queryId}/${p.model}`}><td><Link href={`/overview?query=${encodeURIComponent(p.queryId)}&model=${encodeURIComponent(p.model)}`}>{PUBLIC_SEARCH_QUERIES.find(q=>q.id===p.queryId)?.category ?? p.queryId}</Link></td><td>{LANDSCAPE_MODELS.find(m=>m.id===p.model)?.label}</td><td>{p.status.replace('_',' ')}</td><td>{p.seconds===null?'Unknown':`${Math.round(p.seconds)}s`}</td><td>{dollars(p.costUsd)}</td></tr>)}</tbody></table></div></details>
    <p className="landscape-note"><a href="/leaderboard?view=questions">Explore earlier company-mention cohorts ↗</a></p>
    <footer className="landscape-note">Observed {data.observedAt.slice(0,10)} · OpenAI managed agents + web search · {data.planned} planned attempts · Estimated token costs, not provider invoices</footer>
  </section>;
}
