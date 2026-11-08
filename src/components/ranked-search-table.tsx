"use client";

import { UiSelect } from "./ui/select";
import { Suspense, useId } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LivePublicIndex, useOptionalLivePublicIndex, useLivePublicIndex } from "./live-public-index";
import { RecordedQuestionPicker } from "./recorded-question-picker";
import { RecordedRanking } from "./recorded-ranking";
import "./ranked-search-table.css";

export function RankedSearchTable({ compact = false }: { compact?: boolean }) {
  const data = useOptionalLivePublicIndex();
  const content = <Suspense fallback={<p>Loading recorded rankings…</p>}><RankedSearchTableContent compact={compact}/></Suspense>;
  return data ? content : <LivePublicIndex>{content}</LivePublicIndex>;
}
function RankedSearchTableContent({ compact }: { compact: boolean }) {
  const { queries: PUBLIC_SEARCH_QUERIES, observations: PUBLIC_SEARCH_OBSERVATIONS } = useLivePublicIndex();
  const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
  const initialQuery = PUBLIC_SEARCH_QUERIES.find(query => PUBLIC_SEARCH_OBSERVATIONS.some(observation => observation.queryId === query.id)) ?? PUBLIC_SEARCH_QUERIES[0];
  const controlId = useId();
  const params = useSearchParams(), model=params.get("model");
  const models=[...new Set(PUBLIC_SEARCH_OBSERVATIONS.map(o=>o.model))];
  const preferred = PUBLIC_SEARCH_QUERIES.find(q=>PUBLIC_SEARCH_OBSERVATIONS.some(o=>o.queryId===q.id&&(!model||o.model===model))) ?? initialQuery;
  const requested = PUBLIC_SEARCH_QUERIES.find(q=>q.id===params.get("query")) ?? preferred;
  const category=requested?.category ?? "";
  const queries = PUBLIC_SEARCH_QUERIES.filter(query => query.category === category);
  const missingQuery = Boolean(params.get("query") && !PUBLIC_SEARCH_QUERIES.some(query => query.id === params.get("query")));
  const query=missingQuery ? undefined : requested;
  const observation = query ? [...PUBLIC_SEARCH_OBSERVATIONS].filter(o=>o.queryId===query.id&&(!model||o.model===model)).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0] : undefined;
  function selectQuery(id:string){const next=new URLSearchParams(params.toString());next.set("query",id);window.history.pushState(null,"",`${window.location.pathname}?${next}`)}


  return <section className={`ranked-search${compact ? " ranked-search--compact" : ""}`} aria-label="Public search rankings">
    {missingQuery ? <p role="status">The selected question is unavailable in the current published results. Refresh results to try again.</p> : PUBLIC_SEARCH_QUERIES.length > 0 ? <>
      <div className="ranked-search-controls">
        <label><span>Model</span><UiSelect aria-label="Index model" value={model??""} onChange={event=>{const next=new URLSearchParams(params.toString());if(event.target.value)next.set("model",event.target.value);else next.delete("model");window.history.pushState(null,"",`${window.location.pathname}?${next}`)}}><option value="">All models</option>{model&&!models.includes(model)&&<option value={model}>{model} · unmeasured</option>}{models.map(m=><option key={m} value={m}>{m}</option>)}</UiSelect></label>
        <label htmlFor={`${controlId}-category`}><span>Category</span>
          <UiSelect id={`${controlId}-category`} value={category} onChange={event => {
            const nextCategory = event.target.value;
            selectQuery(PUBLIC_SEARCH_QUERIES.find(item => item.category === nextCategory)?.id ?? "");
          }}>
            {categories.map(item => <option key={item}>{item}</option>)}
          </UiSelect>
        </label>
      </div>
      {query && <RecordedQuestionPicker questions={queries} selected={query} onSelect={selectQuery}/>}
      {query && <div key={`${query.id}-${observation?.id ?? "pending"}`}>
        <p className="ranked-search-context">{query.locale} · Language: {query.language}</p>
        {observation ? <RecordedRanking query={query} observation={observation} /> : <div className="ranked-search-empty" role="status">
          <h3>No recorded ranking yet.</h3>
          <p>Public rankings appear here after a completed search observation is published.</p>
          <Link className="ranked-search-empty-link" href="/evaluations">Open your evaluations</Link>
        </div>}
      </div>}
    </> : <div className="ranked-search-empty" role="status"><h3>No search queries are available yet.</h3><p>Recorded results will appear here when a query has been evaluated.</p></div>}
  </section>;
}
