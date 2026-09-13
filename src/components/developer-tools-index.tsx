"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { DEVELOPER_TOOLS, WEBSITE_AUDIENCES, type DeveloperTool } from "@/lib/developer-tools-source";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import { DataTable, type DataTableColumn } from "./ui/spectrum-data-table";
import "./developer-tools-index.css";

type PageObservation = {
  toolId: string; name: string; submittedUrl: string; finalUrl: string | null;
  captureKind: string; status: string; capturedAt: string; contentHash: string | null;
  score: number | null; bytesFetched: number | null; error: string | null;
  checks: { id: string; label: string; status: string; points: number; maxPoints: number; detail: string }[];
};
const observations = evaluationBatch.results as PageObservation[];
type ToolRow = DeveloperTool & { observation: PageObservation | undefined };
const catalogRows: ToolRow[] = DEVELOPER_TOOLS.map(tool => ({
  ...tool,
  observation: observations.find(item => item.toolId === tool.id && item.captureKind === "public-homepage"),
}));

function isMeasured(observation: PageObservation | undefined) {
  return observation?.status === "complete" && observation.score !== null;
}

function attentionCount(observation: PageObservation) {
  return observation.checks.filter(check => check.maxPoints > 0 && check.points < check.maxPoints).length;
}

function unavailableReason(observation: PageObservation | undefined) {
  return observation?.error || (observation
    ? "The capture did not return a measurable HTML page."
    : "No capture is recorded in this batch.");
}

function CheckSummary({ observation }: { observation: PageObservation }) {
  const attention = attentionCount(observation);
  const failed = observation.checks.filter(check => check.status === "fail").length;
  return <span className="devtool-check-summary">
    {attention ? `${attention} ${attention === 1 ? "check needs" : "checks need"} attention` : "All scored checks passed"}
    {failed > 0 && ` · ${failed} failed`}
  </span>;
}

export function DeveloperToolsIndex() {
  const [query, setQuery] = useState("");
  const [audience, setAudience] = useState("All audiences");
  const [category, setCategory] = useState("All categories");
  const [resultFilter, setResultFilter] = useState("All results");
  const audienceRows = useMemo(() => catalogRows.filter(tool => audience === "All audiences" || tool.audience === audience), [audience]);
  const categories = [...new Set(audienceRows.map(tool => tool.category))].sort();
  const rows = useMemo(() => audienceRows.filter(tool => (category === "All categories" || tool.category === category)
    && `${tool.name} ${tool.description} ${tool.category} ${tool.audience} ${tool.websiteUrl}`.toLowerCase().includes(query.trim().toLowerCase())
    && (resultFilter === "All results" || (resultFilter === "Measured pages" ? isMeasured(tool.observation) : !isMeasured(tool.observation)))),
  [audienceRows, query, category, resultFilter]);
  const completed = catalogRows.filter(tool => isMeasured(tool.observation)).length;
  const hasFilters = query || audience !== "All audiences" || category !== "All categories" || resultFilter !== "All results";
  const columns: DataTableColumn<ToolRow>[] = [
    { id: "name", header: "Website", sortable: true, value: row => row.name, cell: row => <div className="devtool-name">
      <a href={row.websiteUrl} target="_blank" rel="noreferrer">{row.name}<ExternalLink size={12} aria-hidden="true" /></a>
      <span>{row.description}</span>
    </div> },
    { id: "category", header: "Category", sortable: true, value: row => row.category, cell: row => <div className="devtool-category">
      <span>{row.category}</span><small>{row.audience}</small>
    </div> },
    { id: "score", header: "Folio page evaluation", sortable: true, numeric: true, value: row => isMeasured(row.observation) ? row.observation!.score : null,
      cell: row => <div className="devtool-score">{isMeasured(row.observation) ? <>
        <strong>{row.observation!.score}<small> / 100</small></strong><CheckSummary observation={row.observation!} />
      </> : <><strong className="devtool-unmeasured">Not measured</strong><span className="devtool-capture-error">{unavailableReason(row.observation)}</span></>}</div> },
    { id: "sources", header: "Source", cell: row => <div className="devtool-links">
      <a href={row.docsUrl} target="_blank" rel="noreferrer">Official reference</a>
    </div> },
  ];

  return <div className="developer-tools-index">
    <section className="devtools-intro">
      <h2>HTML page checks</h2>
      <p>{completed} of {DEVELOPER_TOOLS.length} public homepages measured. Open a row for its checks and capture evidence.</p>
      <p>Folio’s readiness-v1 scores cover captured HTML only. Search rankings, API execution, and agent task success are outside this rubric.</p>
    </section>
    <section className="panel devtools-directory" aria-label="Website evaluation directory">
      <div className="devtools-filters">
        <label className="devtools-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search websites</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search websites, uses, or domains" /></label>
        <label className="devtools-select"><span>Audience</span><select value={audience} onChange={event => { setAudience(event.target.value); setCategory("All categories"); }}>
          {["All audiences", ...WEBSITE_AUDIENCES].map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="devtools-select"><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}>
          {["All categories", ...categories].map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="devtools-select"><span>Page evaluation status</span><select value={resultFilter} onChange={event => setResultFilter(event.target.value)}>
          {["All results", "Measured pages", "Not measured"].map(item => <option key={item}>{item}</option>)}</select></label>
        {hasFilters && <button type="button" className="button secondary" onClick={() => { setQuery(""); setAudience("All audiences"); setCategory("All categories"); setResultFilter("All results"); }}>Clear filters</button>}
      </div>
      <p className="devtools-results-count" role="status">{rows.length} {rows.length === 1 ? "website" : "websites"}{audience !== "All audiences" && ` · ${audience}`}</p>
      <DataTable key={`${query}|${audience}|${category}|${resultFilter}`} data={rows} columns={columns} rowId={row => row.id}
        caption="Websites and Folio page evaluations" pageSize={12} defaultSort={{ columnId: "name", direction: "asc" }}
        renderDetail={row => <ToolDetails tool={row} />} />
    </section>
    <details className="devtools-methodology"><summary>How to read these observations</summary>
      <p>Batch recorded {new Date(evaluationBatch.generatedAt).toISOString().slice(0, 10)}. Each capture is limited to {evaluationBatch.captureLimitBytes.toLocaleString("en-US")} response bytes, {evaluationBatch.timeoutMs / 1000} seconds, and three redirects. JavaScript is not executed. Successful captures include a timestamp and SHA-256 hash; unavailable captures stay unmeasured.</p>
      <p>Checks needing attention include partial points and failures. Official description sources and review dates appear in each row, separately from Folio’s capture time. Inclusion does not establish endorsement or domain ownership.</p>
      <Link href="/evaluations">Open website evaluations</Link>
    </details>
  </div>;
}

function ToolDetails({ tool }: { tool: ToolRow }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const target = heading.current;
    if (!target) return;
    // A mobile user may open details from the far-right table column.
    const scrollport = target.closest(".spectrum-table-scroll");
    if (scrollport) scrollport.scrollLeft = 0;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, []);
  return <div className="devtool-detail"><h3 ref={heading} tabIndex={-1}>{tool.name}: Folio page evaluation</h3><p>{tool.description}</p>
    <p>Official sources checked {tool.observedAt}: {tool.sourceUrls.map((url, index) => <span key={url}>{index > 0 && " · "}<a href={url} target="_blank" rel="noreferrer">Source {index + 1}</a></span>)}</p>
    {tool.observation ? <Observation observation={tool.observation} /> : <p>No capture is recorded for this website in the current Folio batch.</p>}
  </div>;
}

function Observation({ observation }: { observation: PageObservation }) {
  return <div className="devtool-observation">
    <p><strong>{isMeasured(observation) ? `${observation.score} / 100 Folio page evaluation` : "Not measured"}</strong> · {observation.capturedAt}</p>
    {isMeasured(observation) ? <p><CheckSummary observation={observation} /></p> : <p className="devtool-capture-error">{unavailableReason(observation)}</p>}
    <dl><dt>Requested page</dt><dd>{observation.submittedUrl}</dd>{observation.finalUrl && <><dt>Captured page</dt><dd>{observation.finalUrl}</dd></>}
      {observation.contentHash && <><dt>Capture SHA-256</dt><dd><code>{observation.contentHash}</code></dd></>}</dl>
    {observation.checks.length > 0 && <ul>{observation.checks.map(check => <li key={check.id} data-status={check.status}>
      <strong>{check.label}</strong> — {check.status} · {check.points}/{check.maxPoints}<p>{check.detail}</p>
    </li>)}</ul>}
  </div>;
}
