"use client";

import { Suspense, useId } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PUBLIC_SEARCH_QUERIES,
  PUBLIC_SEARCH_OBSERVATIONS,
  latestPublicSearchObservation,
} from "@/lib/public-search-rankings";
import { RecordedRanking } from "./recorded-ranking";
import "./ranked-search-table.css";

const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
const initialQuery = PUBLIC_SEARCH_QUERIES.find(query => latestPublicSearchObservation(query.id)) ?? PUBLIC_SEARCH_QUERIES[0];
export function RankedSearchTable({ compact = false }: { compact?: boolean }) {
  return <Suspense fallback={<p>Loading recorded rankings…</p>}><RankedSearchTableContent compact={compact}/></Suspense>;
}
function RankedSearchTableContent({ compact }: { compact: boolean }) {
  const controlId = useId();
  const params = useSearchParams(), model=params.get("model");
  const models=[...new Set(PUBLIC_SEARCH_OBSERVATIONS.map(o=>o.model))];
  const preferred = PUBLIC_SEARCH_QUERIES.find(q=>PUBLIC_SEARCH_OBSERVATIONS.some(o=>o.queryId===q.id&&(!model||o.model===model))) ?? initialQuery;
  const requested = PUBLIC_SEARCH_QUERIES.find(q=>q.id===params.get("query")) ?? preferred;
  const category=requested?.category ?? "";
  const queries = PUBLIC_SEARCH_QUERIES.filter(query => query.category === category);
  const query=requested;
  const observation = query ? [...PUBLIC_SEARCH_OBSERVATIONS].filter(o=>o.queryId===query.id&&(!model||o.model===model)).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0] : undefined;
  function selectQuery(id:string){const next=new URLSearchParams(params.toString());next.set("query",id);window.history.pushState(null,"",`${window.location.pathname}?${next}`)}


  return <section className={`ranked-search${compact ? " ranked-search--compact" : ""}`} aria-label="Public search rankings">
    {PUBLIC_SEARCH_QUERIES.length > 0 ? <>
      <div className="ranked-search-controls">
        <label><span>Model</span><select aria-label="Index model" value={model??""} onChange={event=>{const next=new URLSearchParams(params.toString());if(event.target.value)next.set("model",event.target.value);else next.delete("model");window.history.pushState(null,"",`${window.location.pathname}?${next}`)}}><option value="">All models · latest answer</option>{model&&!models.includes(model)&&<option value={model}>{model} · unmeasured</option>}{models.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
        <label htmlFor={`${controlId}-category`}><span>Category</span>
          <select id={`${controlId}-category`} value={category} onChange={event => {
            const nextCategory = event.target.value;
            selectQuery(PUBLIC_SEARCH_QUERIES.find(item => item.category === nextCategory)?.id ?? "");
          }}>
            {categories.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label htmlFor={`${controlId}-query`}><span>Search query</span>
          <select id={`${controlId}-query`} title={query?.query} aria-describedby={`${controlId}-question`} value={query?.id ?? ""} onChange={event => selectQuery(event.target.value)}>
            {queries.map(item => <option key={item.id} value={item.id}>{item.query}</option>)}
          </select>
        </label>
      </div>
      {query && <div key={`${query.id}-${observation?.id ?? "pending"}`}>
        <p className="ranked-search-query" id={`${controlId}-question`}>{query.query}</p>
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
