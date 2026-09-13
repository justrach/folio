"use client";

import { useId, useState } from "react";
import {
  PUBLIC_SEARCH_QUERIES,
  latestPublicSearchObservation,
  type PublicSearchObservation,
  type PublicSearchQuery,
  type PublicSearchRecommendation,
} from "@/lib/public-search-rankings";
import "./ranked-search-table.css";

const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
const initialQuery = PUBLIC_SEARCH_QUERIES.find(query => latestPublicSearchObservation(query.id)) ?? PUBLIC_SEARCH_QUERIES[0];
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

function sourceLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

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
          <select id={`${controlId}-query`} value={query?.id ?? ""} onChange={event => setQueryId(event.target.value)}>
            {queries.map(item => <option key={item.id} value={item.id}>{item.query}</option>)}
          </select>
        </label>
      </div>
      {query && <div key={`${query.id}-${observation?.id ?? "pending"}`}>
        <p className="ranked-search-query">{query.query}</p>
        <p className="ranked-search-context">{query.audience} · {query.locale} · Language: {query.language}</p>
        {observation ? <RecordedRanking query={query} observation={observation} /> : <div className="ranked-search-empty" role="status">
          <h3>No recorded ranking yet.</h3>
          <p>Public rankings appear here after a completed search observation is published.</p>
        </div>}
      </div>}
    </> : <div className="ranked-search-empty" role="status"><h3>No search queries are available yet.</h3><p>Recorded results will appear here when a query has been evaluated.</p></div>}
  </section>;
}

function RecordedRanking({ query, observation }: { query: PublicSearchQuery; observation: PublicSearchObservation }) {
  return <>
    <p className="ranked-search-meta">
      Observed <time dateTime={observation.observedAt}>{dateFormat.format(new Date(observation.observedAt))} UTC</time>
      <span> · {observation.model} · Open-web search</span>
    </p>
    <p className="ranked-search-scope">Rank is the position in this query’s returned recommendation list. Another run can return a different order.</p>
    {observation.recommendations.length > 0 ? <table className="ranked-search-table">
      <caption className="ranked-search-sr-only">Returned recommendations</caption>
      <colgroup><col className="ranked-search-rank-column" /><col /></colgroup>
      <thead><tr><th scope="col">Rank</th><th scope="col">Website</th></tr></thead>
      <tbody>{observation.recommendations.map((recommendation, index) => <RecommendationRow
        key={`${recommendation.position}-${index}`} recommendation={recommendation} citations={observation.citations} />)}</tbody>
    </table> : <div className="ranked-search-empty" role="status"><h3>No recommendations returned.</h3><p>This completed observation did not include a recommendation list.</p></div>}
    <details className="ranked-search-provenance">
      <summary>About this observation</summary>
      <p>One saved OpenAI managed-agent web-search response. The reasons and citations below were returned with it; they are evidence to review.</p>
      <dl>
        <dt>Model</dt><dd>{observation.model}</dd>
        <dt>Observed at</dt><dd>{observation.observedAt}</dd>
        <dt>Surface</dt><dd>OpenAI managed Agents API</dd>
        <dt>Search mode</dt><dd>{observation.searchMode}</dd>
        <dt>Language / locale</dt><dd>{query.language} / {query.locale}</dd>
        <dt>Harness</dt><dd>{observation.harnessVersion}</dd>
        <dt>Environment</dt><dd>{observation.environmentType}</dd>
      </dl>
      {observation.citations.length > 0 && <>
        <h4>Sources returned with the observation</h4>
        <ul>{observation.citations.map((citation, index) => <li key={`${citation.url}-${index}`}>
          <a href={citation.url} target="_blank" rel="noreferrer">{citation.title || citation.url}</a>
        </li>)}</ul>
      </>}
      {observation.limitations.length > 0 && <><h4>Limits of this result</h4><ul>{observation.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></>}
    </details>
  </>;
}

function RecommendationRow({ recommendation, citations }: { recommendation: PublicSearchRecommendation; citations: PublicSearchObservation["citations"] }) {
  const sourceUrls = [...new Set(recommendation.citationUrls)];
  return <tr className="ranked-search-row">
    <td className="ranked-search-position">{recommendation.position}</td>
    <th scope="row" className="ranked-search-website">
      {recommendation.url ? <a className="ranked-search-name" href={recommendation.url} target="_blank" rel="noreferrer">{recommendation.name}</a>
        : <span className="ranked-search-name">{recommendation.name}</span>}
      <p className="ranked-search-domain">{recommendation.url ? sourceLabel(recommendation.url) : "Website URL not returned"}</p>
      {sourceUrls.length > 0 ? <div className="ranked-search-citations"><span>Sources:</span><ul>
        {sourceUrls.map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer" aria-label={citations.find(citation => citation.url === url)?.title || url}>{sourceLabel(url)}</a></li>)}
      </ul></div> : <p className="ranked-search-no-source">No source attached</p>}
      <details className="ranked-search-evidence"><summary>Returned reason</summary>
        <p>{recommendation.reason || "No reason was recorded for this recommendation."}</p>
      </details>
    </th>
  </tr>;
}
