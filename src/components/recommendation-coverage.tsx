import React from "react";
import type { PublicQuestionCoverageRecord } from "@/lib/public-question-coverage";

const labels = { direct: "Direct answer", partial: "Partial answer", not_established: "Answer not established", irrelevant: "Not relevant", review_required: "Conflicting evidence · review required" };
const advice = {
  direct: "Review the page's exact wording and qualifications before relying on this answer.",
  partial: "Compare the captured pages with each part of this question and identify the details still missing.",
  not_established: "Capture a page that explicitly addresses this question; topic mentions alone are not an answer.",
  irrelevant: "Review whether another page on this same website addresses the question. This excerpt concerns a different task.",
  review_required: "Review the relevance and answer judgments together; conflicting classifications are not accepted as positive coverage.",
};

export function RecommendationCoverage({ record, hasWebsite }: { record?: PublicQuestionCoverageRecord; hasWebsite: boolean }) {
  return <details className="ranked-search-coverage">
    <summary>Evidence coverage <span>{record ? labels[record.status] : "Not evaluated"}</span></summary>
    {!record ? <p>{hasWebsite ? "No published Jev page-coverage review for this exact question and returned website. Not evaluated does not mean the website lacks an answer." : "No website URL was returned, so captured pages cannot be matched to this recommendation."} Opening this result does not run a review.</p> : <>
      <p className="ranked-search-coverage-limit">Advisory Jev classifications of frozen page excerpts, not verified truth or a website score. They do not explain why the search agent recommended this website or change its returned position.</p>
      <p><strong>Next evidence step:</strong> {advice[record.status]}</p>
      <p>{record.pages.length} captured page{record.pages.length === 1 ? "" : "s"} / {record.captureAttemptCount} attempts · limited capture, not the whole website.</p>
      <ul className="ranked-search-coverage-pages">{record.pages.map(page => <li key={page.url}>
        <a href={page.url} target="_blank" rel="noreferrer">{page.title || page.url}</a>
        <p>Relevance: {page.relevance.choice} · Answer: {labels[page.coverage.choice]}</p>
        <small>Captured <time dateTime={page.capturedAt}>{page.capturedAt}</time>{page.truncated ? " · source excerpt truncated" : ""}</small>
        <details><summary>Captured excerpt and provenance</summary>
          <p>Preview of the captured text, not a model-selected supporting quote.</p><blockquote>{page.excerpt || "No text preview available."}</blockquote>
          <p>Page text SHA-256: <code>{page.sha256}</code></p>
          <p>Model confidence (not measured accuracy): relevance {page.relevance.confidence.toFixed(3)}; answer {page.coverage.confidence.toFixed(3)}.</p>
          <p>Relevance distribution: {Object.entries(page.relevance.probabilities).map(([label, value]) => `${label} ${value.toFixed(3)}`).join(" · ")}</p>
          <p>Answer distribution: {Object.entries(page.coverage.probabilities).map(([label, value]) => `${label} ${value.toFixed(3)}`).join(" · ")}</p>
        </details>
      </li>)}</ul>
      <p className="ranked-search-coverage-limit">Review model: {record.model} (requested {record.requestedModel}) · Evaluated <time dateTime={record.evaluatedAt}>{record.evaluatedAt}</time> · {record.method}. Human review required. Missing information means missing from these captures, not absent from the website.</p>
    </>}
  </details>;
}
