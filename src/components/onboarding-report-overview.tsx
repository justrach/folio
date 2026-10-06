import type { OnboardingReport } from "@/lib/onboarding-report";
import HatchedBarChart from "./evilcharts/hatched-bar-chart";
import "./onboarding-report-overview.css";

export default function OnboardingReportOverview({ report }: { report: OnboardingReport }) {
  const { snapshot } = report;
  const target = report.brands.find((brand) => brand.isTarget);
  const competitors = report.brands.filter((brand) => !brand.isTarget);
  const mode = snapshot.questions[0]?.mode === "named-comparison" ? "Named comparison" : "Open discovery";
  const chartData = report.brands
    .filter((brand) => brand.appearances !== null)
    .map((brand) => ({ label: brand.label, value: brand.appearances ?? 0, isTarget: brand.isTarget }));

  return (
    <section className="ob-report" aria-label="Sample report overview" data-report-overview>
      <div className="ob-report-head">
        <p className="ob-report-badge">Illustrative fixture report</p>
        <p className="ob-report-note">No live capture or collection date.</p>
      </div>
      <dl className="ob-report-meta">
        <div>
          <dt>Website</dt>
          <dd>{snapshot.websiteUrl ?? "—"}</dd>
        </div>
        <div>
          <dt>Business</dt>
          <dd>{target?.label ?? snapshot.businessName}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>
            {mode}
            {competitors.length > 0 ? ` — ${competitors.map((c) => c.label).join(", ")}` : ""}
          </dd>
        </div>
      </dl>
      <dl className="ob-report-counts">
        <div>
          <dt>Selected questions</dt>
          <dd>{report.selectedQuestionCount}</dd>
        </div>
        <div>
          <dt>Sample answers available</dt>
          <dd>{report.availableQuestionCount}</dd>
        </div>
        <div>
          <dt>Without sample answer</dt>
          <dd>{report.missingQuestionCount}</dd>
        </div>
      </dl>
      {report.availableQuestionCount > 0 ? (
        <figure className="ob-report-chart">
          <HatchedBarChart
            data={chartData}
            maxValue={report.availableQuestionCount}
            axisLabel="Appearances in sample answers"
          />
          <figcaption>
            Counts across available sample answers only; not market share or Google rankings.
          </figcaption>
          <ul className="ob-report-counts-list" aria-label="Appearance counts">
            {chartData.map((datum) => (
              <li key={datum.label} data-target={datum.isTarget}>
                {datum.label} — {datum.value} of {report.availableQuestionCount} sample answers
                {datum.isTarget ? " (this business)" : ""}
              </li>
            ))}
          </ul>
          {report.missingQuestionCount > 0 ? (
            <p className="ob-report-note">
              {report.missingQuestionCount} selected question
              {report.missingQuestionCount === 1
                ? " has no sample answer and is not"
                : "s have no sample answer and are not"}{" "}
              counted above.
            </p>
          ) : null}
        </figure>
      ) : (
        <p className="ob-report-empty">
          No sample observations — the selected questions have no fixture answers, so no appearances
          are counted.
        </p>
      )}
      <p className="ob-report-note">Competitors not listed here are not tracked in this preview.</p>
    </section>
  );
}
