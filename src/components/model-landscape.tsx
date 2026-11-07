"use client";
import { UiSelect } from "./ui/select";
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { PUBLIC_SEARCH_QUERIES, PUBLIC_SEARCH_OBSERVATIONS, PUBLIC_CORE_QUERIES } from '@/lib/public-search-rankings';
import { websiteOverview } from '@/lib/website-landscape';
import { LANDSCAPE_MODELS } from '@/lib/model-landscape';
import { LabelInput } from './bencho/label-input/LabelInput';
import { CompanyFavicon } from './company-favicon';
import './bencho/label-input/LabelInput.css';
import { WebsiteSummaryChart } from './website-summary-chart';
import './model-landscape.css';
const core=PUBLIC_CORE_QUERIES;
const audienceNames=[...new Set(core.map(q=>q.audience))];
export function ModelLandscape() {
 const params=useSearchParams(), [search,setSearch]=useState(''), [limit,setLimit]=useState(12), [showChart,setShowChart]=useState(false);
 const selected=params.get('model')??'', audience=params.get('landscapeAudience')??'';
 const query=PUBLIC_SEARCH_QUERIES.find(q=>q.id===params.get('query'));
 const questions=query?[query]:core.filter(q=>!audience||q.audience===audience);
 const models=LANDSCAPE_MODELS.filter(m=>!selected||selected===m.id);
 const result=websiteOverview(PUBLIC_SEARCH_OBSERVATIONS,questions.map(q=>q.id),models.map(m=>m.id));
 const {rows,answers,coverage}=result;
 const active=rows.find(r=>r.domain===params.get('site'));
 const set=(changes:Record<string,string>)=>{const next=new URLSearchParams(params.toString());for(const [key,value] of Object.entries(changes)){if(value)next.set(key,value);else next.delete(key);}window.history.pushState(null,'',`${window.location.pathname}?${next}`);};
 const shareMax=query?100:Math.max(10,Math.ceil(Math.max(0,...rows.map(r=>r.share))/10)*10);
 const visible=rows.filter(r=>`${r.domain} ${r.name}`.toLowerCase().includes(search.toLowerCase()));
 const chartRows=visible.slice(0,limit);
 const selectSite=(domain:string)=>set({site:active?.domain===domain?'':domain});
 return <section className="model-landscape website-landscape" aria-labelledby="landscape-title">
  <header className="landscape-heading"><div><h2 id="landscape-title">Which websites get recommended?</h2><p className="landscape-intro">Compare appearances in saved answers. Select a website to inspect its evidence.</p></div><div className="landscape-cohort"><span><strong>{rows.length}</strong> websites</span><span><strong>{answers}</strong> saved {answers===1?'answer':'answers'}</span><span><strong>{questions.length}</strong> {questions.length===1?'question':'questions'}</span></div></header>
  <div className="website-filter-bar">
  <div className="website-controls"><label>Explore<UiSelect aria-label="Website comparison audience" value={audience} onChange={e=>set({landscapeAudience:e.target.value,query:'',site:''})}><option value="">All website categories</option>{audienceNames.map(a=><option key={a}>{a}</option>)}</UiSelect></label><label>Answers from<UiSelect aria-label="Website comparison model" value={selected} onChange={e=>set({model:e.target.value,site:''})}><option value="">Average across models</option>{LANDSCAPE_MODELS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</UiSelect></label></div>
  <label className="website-question-select">Question<UiSelect aria-label="Website comparison question" value={query?.id??''} onChange={e=>set({query:e.target.value,site:''})}><option value="">All {core.filter(q=>!audience||q.audience===audience).length} core questions</option>{query&&!core.some(q=>q.id===query.id)&&<option value={query.id}>{query.query}</option>}{core.filter(q=>!audience||q.audience===audience||q.id===query?.id).map(q=><option key={q.id} value={q.id}>{q.query}</option>)}</UiSelect></label>
  </div>
  {showChart && <WebsiteSummaryChart rows={rows} shareMax={shareMax} selectedDomain={active?.domain}/>}
  {query&&<p className="website-question">{query.query} <button className="website-reset" onClick={()=>set({query:'',landscapeAudience:'',site:''})}>Show all websites ↗</button></p>}
  <div className="website-coverage" aria-label="Saved answer coverage">{coverage.map(c=><span key={c.model}><i className={c.answers===c.planned?'complete':''}/><b>{LANDSCAPE_MODELS.find(m=>m.id===c.model)?.label}</b> {c.answers}/{c.planned} answers</span>)}</div>
  <div className="website-list-toolbar"><div><h3>Websites <span>{visible.length}</span></h3><p>Appearance in saved answers · average returned position</p></div><div className="website-search-field"><LabelInput field="Find a website" value={search} onValueChange={value=>{setSearch(value);setLimit(12)}} corner={8}/></div><button className="website-chart-toggle" type="button" aria-pressed={showChart} onClick={()=>setShowChart(value=>!value)}>{showChart?'Hide chart':'Show chart'}</button></div>
  {!result.complete&&<p className="website-coverage-note">Partial coverage: {answers}/{questions.length*models.length} answers available. Averages use saved answers only; missing results are not zeroes.</p>}
  {rows.length ? <><div className="website-ranking-chart" role="group" aria-label="Top websites by appearance rate"><div className="website-ranking-head"><span>Website</span><span>Appearance rate</span><span>Avg. position</span></div><ol>{chartRows.map((r,index)=><li key={r.domain}><button type="button" className="website-ranking-row" aria-pressed={active?.domain===r.domain} onClick={()=>selectSite(r.domain)}><span className="website-ranking-name"><span className="website-ranking-number">{String(index+1).padStart(2,'0')}</span><CompanyFavicon url={r.url} name={r.name}/><span><strong>{r.name}</strong><small>{r.domain}</small></span></span><span className="website-ranking-measure"><span className="website-ranking-track"><span style={{width:`${Math.max(2,Math.min(100,r.share/shareMax*100))}%`}}/></span><strong>{r.share.toFixed(1)}%</strong></span><span className="website-ranking-position" aria-label={`Average position ${r.position.toFixed(1)}`}><span className="website-ranking-mobile-position">Position </span>{r.position.toFixed(1)}</span></button></li>)}</ol></div><div className="website-list-footer"><p>{chartRows.length} of {visible.length} websites · missing answers excluded</p>{visible.length>limit&&<button className="website-show-more" onClick={()=>setLimit(limit+12)}>Show more websites ({limit} of {visible.length})</button>}</div>
  {active&&<aside className="website-detail" aria-label={`Model results for ${active.domain}`}><div><h3>{active.name}</h3><a href={active.url} target="_blank" rel="noreferrer">{active.domain} ↗</a><button aria-label="Close website details" onClick={()=>set({site:''})}>×</button></div><div className="website-model-breakdown">{active.perModel.map(m=><section key={m.model}><h4>{LANDSCAPE_MODELS.find(item=>item.id===m.model)?.label}</h4><strong>{m.share===null?'—':`${m.share.toFixed(1)}%`}</strong><p>{m.appearances}/{m.answers} saved answers</p><small>{m.position===null?'No recommendation position':`Avg. position ${m.position.toFixed(1)}`}</small>{m.queryId&&<Link href={`?query=${encodeURIComponent(m.queryId)}&model=${encodeURIComponent(m.model)}`}>See source answer ↗</Link>}</section>)}</div></aside>}
  <details className="website-full-table"><summary>Full comparison table</summary><div className="landscape-table-wrap website-results"><table><caption>{selected?'One model’s saved recommendations':'Each model has equal weight in the average'} · {questions.length} {questions.length===1?'question':'questions'}</caption><thead><tr><th>Website</th><th>Avg. appearance</th><th>Avg. position</th><th>Models recommending</th><th>Questions appearing in</th></tr></thead><tbody>{visible.slice(0,limit).map(r=><tr key={r.domain} aria-selected={active?.domain===r.domain}><th><button onClick={()=>selectSite(r.domain)}>{r.name} ↗</button><small>{r.domain}</small></th><td><span className="website-rate"><i style={{width:`${Math.max(2,r.share)}%`}}/>{r.share.toFixed(1)}%</span></td><td>{r.position.toFixed(1)}</td><td>{r.modelCount}/{result.measuredModels}</td><td>{r.questionCount}/{questions.length}</td></tr>)}</tbody></table></div></details></> : <p>No saved answer for this selection. This is unmeasured, not a zero score. <button className="website-reset" onClick={()=>set({model:''})}>View available models</button></p>}
  {!visible.length && rows.length>0 && <p role="status">No websites match “{search}”.</p>}
  {result.firstDate&&<p className="landscape-note">Observed {result.firstDate}{result.lastDate!==result.firstDate?` — ${result.lastDate}`:''}. Latest published answer per model and question; collection dates can differ.</p>}
  <details className="landscape-details"><summary>How to read this comparison</summary><p>Uses the latest published answer for each question and model. For each model, appearance rate is the share of its saved answers recommending a website. We average those rates with equal weight per model. Average position is the mean of each recommending model’s average position; non-appearances have no position. Missing and failed answers are excluded, never scored as zero. Different coverage can affect averages.</p><p>This measures presence in the selected question set, not universal website quality. Some questions explicitly name websites, so compare within a relevant category or question. These are Folio managed research-agent results, not Google rankings or consumer ChatGPT measurements. Reviewed documentation aliases are grouped; other hostnames remain separate. Source questions, citations and returned reasons remain available below.</p></details>
  <p className="landscape-note"><a href="/leaderboard?view=questions">Explore earlier company-mention cohorts ↗</a></p>
 </section>;
}
