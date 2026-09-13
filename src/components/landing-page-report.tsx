"use client";

import { useEffect, useRef, useState } from "react";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import { DEVELOPER_TOOLS, WEBSITE_AUDIENCES } from "@/lib/developer-tools-source";
import { DataTable, type DataTableColumn } from "./ui/spectrum-data-table";

type PageObservation = (typeof evaluationBatch.results)[number];
type ReportCheck = PageObservation["checks"][number];
const reports = DEVELOPER_TOOLS.map(website => ({
  website,
  observation: evaluationBatch.results.find(result => result.toolId === website.id && result.captureKind === "public-homepage"),
}));
const measured = (report: (typeof reports)[number]) => report.observation?.status === "complete" && typeof report.observation.score === "number";
const initial = reports.find(report => report.website.id === "allbirds" && measured(report))
  ?? reports.find(report => report.website.audience !== "Developer tools" && measured(report))
  ?? reports.find(measured) ?? reports[0];
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const resultLabels: Record<string, string> = { pass: "Pass", warning: "Needs attention", fail: "Fail", optional: "Optional" };
const resultOrder: Record<string, number> = { fail: 0, warning: 1, pass: 2, optional: 3 };

export function LandingPageReport() {
  const [selectedId, setSelectedId] = useState(initial?.website.id ?? "");
  const selected = reports.find(report => report.website.id === selectedId);
  const observation = selected?.observation;
  const hasResult = selected && measured(selected);
  const attention = observation?.checks.filter(check => check.maxPoints > 0 && check.points < check.maxPoints).length ?? 0;
  const failures = observation?.checks.filter(check => check.status === "fail").length ?? 0;
  const columns: DataTableColumn<ReportCheck>[] = [
    { id: "label", header: "Check", value: check => check.label },
    { id: "status", header: "Result", sortable: true, value: check => resultOrder[check.status] ?? 4,
      cell: check => <span className="landing-report-result" data-status={check.status}>{resultLabels[check.status] ?? check.status}</span> },
    { id: "points", header: "Points", sortable: true, numeric: true, value: check => check.maxPoints > 0 ? check.points : null,
      cell: check => check.maxPoints > 0 ? `${check.points} / ${check.maxPoints}` : "Unscored" },
  ];

  return <div className="landing-report" role="region" aria-label="Folio website report">
    <div className="landing-report-header">
      <div><p>Folio page evaluation</p><h3>{selected?.website.name ?? "Website report"}</h3></div>
      <label className="landing-report-picker"><span>Choose a website report</span>
        <select value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={reports.length === 0}>
          {WEBSITE_AUDIENCES.map(audience => <optgroup key={audience} label={audience}>
            {reports.filter(report => report.website.audience === audience).map(report => <option key={report.website.id} value={report.website.id}>{report.website.name}</option>)}
          </optgroup>)}
        </select>
      </label>
    </div>
    {hasResult && observation && selected ? <>
      <div className="landing-report-score" aria-live="polite">
        <strong>{observation.score}<small> / 100</small></strong>
        <div><p>{attention ? `${attention} ${attention === 1 ? "check needs" : "checks need"} attention` : "All scored checks passed"}</p>
          {failures > 0 && <span>{failures} {failures === 1 ? "failed check" : "failed checks"}</span>}
        </div>
      </div>
      <p className="landing-report-meta">Captured <time dateTime={observation.capturedAt}>{dateFormat.format(new Date(observation.capturedAt))}</time> · {evaluationBatch.suiteVersion}</p>
      <p className="landing-report-meta">Folio checked this homepage’s HTML. This result does not measure search position or an agent’s ability to use the product.</p>
      <p className="landing-report-table-help">Scroll the table to see points and details.</p>
      <DataTable key={selectedId} data={observation.checks} columns={columns} rowId={check => check.id}
        caption={`Folio checks for ${selected.website.name}`} pageSize={5}
        renderDetail={check => <CheckDetail check={check} />}
        emptyState="This saved capture has no recorded checks." />
      <details className="landing-report-source" key={`source-${selectedId}`}>
        <summary>Captured source and hash</summary>
        <dl>
          <dt>Requested page</dt><dd><a href={observation.submittedUrl} target="_blank" rel="noreferrer">{observation.submittedUrl}</a></dd>
          {observation.finalUrl && <><dt>Captured page</dt><dd><a href={observation.finalUrl} target="_blank" rel="noreferrer">{observation.finalUrl}</a></dd></>}
          <dt>Captured at</dt><dd>{observation.capturedAt}</dd>
          {observation.contentHash && <><dt>Capture SHA-256</dt><dd><code>{observation.contentHash}</code></dd></>}
        </dl>
        <p>The hash identifies captured text. Opening a source link visits the current website, which may have changed.</p>
      </details>
    </> : <p className="landing-report-meta" role="status">{observation?.error ?? "No saved homepage evaluation is available for this website."}</p>}
  </div>;
}

function CheckDetail({ check }: { check: ReportCheck }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const target = heading.current;
    if (!target) return;
    const scrollport = target.closest(".spectrum-table-scroll");
    if (scrollport) scrollport.scrollLeft = 0;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, []);
  return <div className="landing-report-check-detail">
    <h4 ref={heading} tabIndex={-1}>{check.label} observation</h4>
    <p>{check.detail}</p>
  </div>;
}
