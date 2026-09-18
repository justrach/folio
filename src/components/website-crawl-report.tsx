"use client";
import type { EvaluationRun } from "@/lib/evals";
import { DeleteEvaluation } from "./delete-evaluation";
export function WebsiteCrawlReport({run,busy,onRefresh,onCancel,onExport,onDeleted}:{run:EvaluationRun;busy:string;onRefresh?:()=>void;onCancel?:()=>void;onExport?:()=>void;onDeleted?:(id:string)=>void}) {
 const data=run.crawlResult, active=['queued','running','requires_action'].includes(run.status);
 return <section className="panel eval-report" aria-label="Website crawl report">
  <header className="eval-report-top"><div><span className="eval-report-kind">Private website crawl · Luna → Jev</span><h2>{run.siteName}</h2><p>{run.targetUrl}</p></div><strong>{run.status.replaceAll('_',' ')}</strong></header>
  <p>Luna chooses pages on this website. Folio saves the text fetched through its read-only tool; Jev checks that saved text for product, audience and pricing information.</p>
  <div className="eval-report-actions">{onRefresh&&<button className="button primary" disabled={!!busy} onClick={onRefresh}>Refresh crawl</button>}{active&&onCancel&&<button className="button secondary" disabled={!!busy} onClick={onCancel}>Cancel crawl</button>}{onExport&&<button className="button secondary" disabled={!!busy} onClick={onExport}>Download crawl</button>}{onDeleted&&!active&&<DeleteEvaluation run={run} onDeleted={onDeleted}/>}</div>
  {run.error&&<p role="alert" className="eval-run-error">{run.error}</p>}
  <p role="status">{data?.pages.length??0} pages saved · {data?.attemptedPages??0} of 10 page attempts · Jev: {data?.reviewStatus??'not started'}</p>
  <p>These are bounded excerpts from HTML, not a rendered-browser test or a search ranking. “Not established” can mean missing information, a blocked page, or text beyond the excerpt.</p>
  <div className="eval-evidence-list">{data?.pages.map(page=><article key={page.id} className="eval-check"><h3><a href={page.url} target="_blank" rel="noopener noreferrer">{page.title||new URL(page.url).pathname}</a></h3><p style={{overflowWrap:'anywhere'}}>{page.url}</p><small>Captured {new Date(page.capturedAt).toLocaleString()}{page.truncated?' · excerpt truncated':''}</small>
   <ul>{data.review?.results.filter(r=>r.evidenceId===page.id).map(r=><li key={r.field}><strong>{r.field}:</strong> {r.relation==='supports'?'Explicitly covered':r.relation==='contradicts'?'Conflicting evidence':'Not established in excerpt'} <small>· advisory judgment</small></li>)}</ul>
   <details><summary>Read saved page text</summary><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{page.text}</p></details>
  </article>)}</div>
  {data?.review&&<p>Jev model: {data.review.model} · {data.review.usage.input_tokens} input / {data.review.usage.output_tokens} output tokens. Dollar cost remains unknown. Luna usage is recorded separately.</p>}
  <details><summary>Agent activity</summary><ol>{run.events.map(e=><li key={e.id}><strong>{e.title}</strong>{e.detail&&<p style={{overflowWrap:'anywhere'}}>{e.detail}</p>}</li>)}</ol></details>
 </section>;
}
