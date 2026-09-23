import React from "react";
import type { PublicSearchObservation, PublicSearchQuery, PublicSearchRecommendation } from "@/lib/public-search-rankings";

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

function sourceLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function citationLabel(url: string, title?: string | null) {
  const label = title?.trim() || sourceLabel(url);
  return label.length > 90 ? `${label.slice(0, 87)}…` : label;
}

export function RecordedRanking({ query, observation }: { query: PublicSearchQuery; observation: PublicSearchObservation }) {
  return <>
    {observation.recommendations.length > 0 ? <figure className="ranked-search-chart" aria-label="Returned recommendations">
      <figcaption><strong>Recommendation order</strong><span>Listed as returned for this question. 1 is first.</span></figcaption>
      <ol>{observation.recommendations.map((recommendation, index) => <RecommendationRow
        key={`${recommendation.position}-${index}`} recommendation={recommendation} citations={observation.citations}
        />)}</ol>
    </figure> : <div className="ranked-search-empty" role="status"><h3>No recommendations returned.</h3><p>This completed observation did not include a recommendation list.</p></div>}
    <details className="ranked-search-provenance">
      <summary>About this observation</summary>
      <p>Position follows the returned list for this question. Depending on the question, recommendations may be websites, products, resources or steps. Another run can return a different order. Reasons and citations remain evidence to review.</p>
      <dl>
        <dt>Model</dt><dd>{observation.model}</dd>
        <dt>Observed at</dt><dd><time dateTime={observation.observedAt}>{dateFormat.format(new Date(observation.observedAt))} UTC</time></dd>
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
  return <li className="ranked-search-row">
    <span className="ranked-search-position" aria-label={`Position ${recommendation.position}`}>{recommendation.position}</span>
    <div className="ranked-search-row-content">
      <div className="ranked-search-website">
        {recommendation.url ? <a className="ranked-search-name" href={recommendation.url} target="_blank" rel="noreferrer">{recommendation.name}</a>
          : <span className="ranked-search-name">{recommendation.name}</span>}
        <p className="ranked-search-domain">{recommendation.url ? sourceLabel(recommendation.url) : "Website URL not returned"}</p>
      </div>
      <div className="ranked-search-row-evidence">
      {sourceUrls.length > 0 ? <div className="ranked-search-citations"><span>Sources:</span><ul>
        {sourceUrls.map(url => {
          const title = citations.find(citation => citation.url === url)?.title;
          return <li key={url}><a href={url} target="_blank" rel="noreferrer" aria-label={title || url} title={title || url}>{citationLabel(url, title)}</a></li>;
        })}
      </ul></div> : <p className="ranked-search-no-source">No source attached</p>}
      <details className="ranked-search-evidence"><summary>Returned reason</summary>
        <p>{recommendation.reason || "No reason was recorded for this recommendation."}</p>
      </details>
      </div>
    </div>
  </li>;
}
