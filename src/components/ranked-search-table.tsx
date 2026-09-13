"use client";

import { useId, useState } from "react";
import Link from "next/link";
import {
  PUBLIC_SEARCH_QUERIES,
  latestPublicSearchObservation,
} from "@/lib/public-search-rankings";
import { RecordedRanking } from "./recorded-ranking";
import "./ranked-search-table.css";

const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
const initialQuery = PUBLIC_SEARCH_QUERIES.find(query => latestPublicSearchObservation(query.id)) ?? PUBLIC_SEARCH_QUERIES[0];
export function RankedSearchTable({ compact = false }: { compact?: boolean }) {
  const controlId = useId();
  const [category, setCategory] = useState(initialQuery?.category ?? "");
  const [queryId, setQueryId] = useState(initialQuery?.id ?? "");
  const queries = PUBLIC_SEARCH_QUERIES.filter(query => query.category === category);
  const query = queries.find(item => item.id === queryId) ?? queries[0];
  const observation = query ? latestPublicSearchObservation(query.id) : undefined;

  return <section className={`ranked-search${compact ? " ranked-search--compact" : ""}`} aria-label="Public search rankings">
    {PUBLIC_SEARCH_QUERIES.length > 0 ? <>
      <div className="ranked-search-controls">
        <label htmlFor={`${controlId}-category`}><span>Category</span>
          <select id={`${controlId}-category`} value={category} onChange={event => {
            const nextCategory = event.target.value;
            setCategory(nextCategory);
            setQueryId(PUBLIC_SEARCH_QUERIES.find(item => item.category === nextCategory)?.id ?? "");
          }}>
            {categories.map(item => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label htmlFor={`${controlId}-query`}><span>Search query</span>
          <select id={`${controlId}-query`} title={query?.query} value={query?.id ?? ""} onChange={event => setQueryId(event.target.value)}>
            {queries.map(item => <option key={item.id} value={item.id}>{item.query}</option>)}
          </select>
        </label>
      </div>
      {query && <div key={`${query.id}-${observation?.id ?? "pending"}`}>
        <p className="ranked-search-query">{query.query}</p>
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
