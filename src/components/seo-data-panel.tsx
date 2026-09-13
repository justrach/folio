"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  BarChart3,
  Check,
  Download,
  Globe2,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import type {
  BacklinksOverview,
  OrganicOverview,
  SeoObservation,
  SeoOverviewResult,
} from "@/lib/dataforseo";
import type { SeoReportSummary } from "@/lib/seo-store";
import { evaluationHref, readEvaluationIntent } from "@/lib/evaluation-navigation";
import "./seo-data-panel.css";

type Connection = { configured: boolean; authorized: boolean };
type Owned<T> = { ownerId: string | null; value: T };
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length <= 4_000;
}
function metric(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}
function hasMetrics(value: JsonRecord, keys: string[]) {
  return keys.every((key) => metric(value[key]));
}
function validOrganic(value: unknown): value is OrganicOverview {
  const data = record(value);
  const movement = record(data?.movement);
  return Boolean(
    data &&
    text(data.domain) &&
    data.searchEngine === "Google" &&
    data.locationName === "United States" &&
    data.languageCode === "en" &&
    text(data.note) &&
    hasMetrics(data, [
      "organicKeywords",
      "estimatedMonthlyTraffic",
      "estimatedTrafficValueUsd",
    ]) &&
    Array.isArray(data.positions) &&
    data.positions.length <= 20 &&
    data.positions.every((entry) => {
      const p = record(entry);
      return p && text(p.label) && metric(p.count);
    }) &&
    movement &&
    hasMetrics(movement, ["new", "up", "down", "lost"]),
  );
}
function validBacklinks(value: unknown): value is BacklinksOverview {
  const data = record(value);
  return Boolean(
    data &&
    text(data.domain) &&
    text(data.note) &&
    data.authorityRankScale === 100 &&
    hasMetrics(data, [
      "backlinks",
      "referringDomains",
      "referringMainDomains",
      "referringPages",
      "brokenBacklinks",
      "brokenPages",
      "crawledPages",
      "authorityRank",
      "backlinksSpamScore",
    ]) &&
    (data.authorityRank === null || (data.authorityRank as number) <= 100),
  );
}
function validObservation<T>(
  value: unknown,
  validData: (data: unknown) => data is T,
): value is SeoObservation<T> {
  const item = record(value);
  if (
    !item ||
    !["success", "empty", "error"].includes(String(item.status)) ||
    !metric(item.costUsd) ||
    !text(item.fetchedAt) ||
    !Number.isFinite(Date.parse(item.fetchedAt))
  )
    return false;
  if (item.status === "success") return validData(item.data);
  if (item.status === "empty") return item.data === null;
  const error = record(item.error);
  return item.data === null && Boolean(error && text(error.message));
}
function parseResult(value: unknown): SeoOverviewResult {
  const result = record(value);
  if (
    !result ||
    !text(result.id) ||
    !text(result.domain) ||
    result.provider !== "DataForSEO" ||
    !text(result.fetchedAt) ||
    !Number.isFinite(Date.parse(result.fetchedAt)) ||
    !["complete", "partial", "error"].includes(String(result.status)) ||
    !metric(result.totalCostUsd) ||
    !metric(result.knownCostUsd) ||
    typeof result.costIsComplete !== "boolean" ||
    !validObservation(result.organic, validOrganic) ||
    !validObservation(result.backlinks, validBacklinks)
  ) {
    throw new Error(
      "This update could not be displayed. Its outcome and charge are unconfirmed; review saved reports before trying again.",
    );
  }
  return result as SeoOverviewResult;
}

function parseHistory(value: unknown): SeoReportSummary[] {
  const payload = record(value);
  if (!Array.isArray(payload?.reports) || payload.reports.length > 50)
    throw new Error("Saved SEO reports could not be read.");
  return payload.reports.map((value) => {
    const item = record(value);
    if (!item || !text(item.id) || !text(item.domain) || !text(item.createdAt) ||
      !Number.isFinite(Date.parse(item.createdAt)) || item.publication !== "private" ||
      !["pending", "complete"].includes(String(item.state)) ||
      !["complete", "partial", "error", "unconfirmed"].includes(String(item.status)) ||
      !metric(item.totalCostUsd) || !metric(item.knownCostUsd) || typeof item.costIsComplete !== "boolean")
      throw new Error("Saved SEO reports could not be read.");
    return item as SeoReportSummary;
  });
}

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});
const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
function count(value: number | null) {
  return value === null ? "—" : numberFormat.format(value);
}
function money(value: number | null) {
  return value === null ? "—" : currencyFormat.format(value);
}
function date(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SeoDataPanel() {
  const searchParams = useSearchParams();
  const incomingTarget = readEvaluationIntent(searchParams).targetUrl;
  const { data: session, isPending } = useSession();
  const ownerId = session?.user.id ?? null;
  const [domain, setDomain] = useState(() => incomingTarget ? new URL(incomingTarget).hostname : "");
  const [connectionState, setConnectionState] =
    useState<Owned<Connection> | null>(null);
  const [statusError, setStatusError] = useState<Owned<string> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [resultState, setResultState] =
    useState<Owned<SeoOverviewResult> | null>(null);
  const [requestError, setRequestError] = useState<Owned<string> | null>(null);
  const [busyOwner, setBusyOwner] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<Owned<SeoReportSummary[]> | null>(null);
  const [historyError, setHistoryError] = useState<Owned<string> | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [openingState, setOpeningState] = useState<Owned<string> | null>(null);
  const [selectedReport, setSelectedReport] = useState<Owned<string> | null>(null);
  const [storageNotice, setStorageNotice] = useState<Owned<string> | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const activeReportRead = useRef<AbortController | null>(null);
  const account = useRef(ownerId);
  account.current = ownerId;

  useEffect(() => {
    // Navigation can prefill a domain; it never submits a paid lookup.
    activeRequest.current?.abort();
    activeReportRead.current?.abort();
    activeRequest.current = null;
    activeReportRead.current = null;
    setResultState(null);
    setSelectedReport(null);
    setRequestError(null);
    setStorageNotice(null);
    setBusyOwner(null);
    setOpeningState(null);
    setDomain(incomingTarget ? new URL(incomingTarget).hostname : "");
  }, [incomingTarget, ownerId]);

  useEffect(() => {
    setResultState(null);
    setRequestError(null);
    setBusyOwner(null);
    setHistoryState(null);
    setHistoryError(null);
    setSelectedReport(null);
    setOpeningState(null);
    setStorageNotice(null);
    return () => {
      activeRequest.current?.abort();
      activeReportRead.current?.abort();
      activeRequest.current = null;
      activeReportRead.current = null;
    };
  }, [ownerId]);

  useEffect(() => {
    if (isPending || !ownerId) return;
    const controller = new AbortController();
    setHistoryError(null);
    // Saved history never invokes the provider, even if live access is revoked.
    fetch("/api/seo-reports", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error("Saved SEO reports are temporarily unavailable.");
        const reports = parseHistory(payload);
        if (!controller.signal.aborted && account.current === ownerId)
          setHistoryState({ ownerId, value: reports });
      })
      .catch(() => {
        if (!controller.signal.aborted && account.current === ownerId)
          setHistoryError({ ownerId, value: "Saved SEO reports are temporarily unavailable. Reading history never starts a paid lookup." });
      });
    return () => controller.abort();
  }, [ownerId, isPending, historyRefreshKey]);

  useEffect(() => {
    if (isPending) return;
    const controller = new AbortController();
    let cancelled = false;
    setConnectionState(null);
    setStatusError(null);
    // This endpoint only reads server configuration and session permission.
    fetch("/api/seo-data", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        const data = record(payload);
        if (!response.ok)
          throw new Error("Website data availability could not be checked.");
        if (
          !data ||
          typeof data.configured !== "boolean" ||
          typeof data.authorized !== "boolean"
        )
          throw new Error("Connection status could not be read.");
        if (!cancelled)
          setConnectionState({
            ownerId,
            value: {
              configured: data.configured,
              authorized: data.authorized,
            },
          });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setStatusError({
            ownerId,
            value:
              error instanceof Error
                ? error.message
                : "Connection status is unavailable.",
          });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ownerId, isPending, refreshKey]);

  const connection =
    connectionState?.ownerId === ownerId && !isPending
      ? connectionState.value
      : null;
  const result =
    resultState?.ownerId === ownerId && !isPending ? resultState.value : null;
  const connectionError =
    statusError?.ownerId === ownerId ? statusError.value : null;
  const error = requestError?.ownerId === ownerId ? requestError.value : null;
  const busy = Boolean(ownerId && busyOwner === ownerId);
  const history = historyState?.ownerId === ownerId && !isPending ? historyState.value : null;
  const savedError = historyError?.ownerId === ownerId ? historyError.value : null;
  const opening = openingState?.ownerId === ownerId ? openingState.value : null;
  const activeReportId = selectedReport?.ownerId === ownerId ? selectedReport.value : null;
  const saveNotice = storageNotice?.ownerId === ownerId ? storageNotice.value : null;
  const ready = Boolean(
    ownerId && connection?.configured && connection.authorized && !isPending,
  );

  async function fetchData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || !ownerId || activeRequest.current || activeReportRead.current || !domain.trim()) return;
    const requestedBy = ownerId;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusyOwner(requestedBy);
    setRequestError(null);
    setStorageNotice(null);
    try {
      // Only an explicit form submission can start billable provider tasks.
      const response = await fetch("/api/seo-data", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const payload: unknown = await response.json();
      if (account.current !== requestedBy || controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          setRefreshKey((key) => key + 1);
        throw new Error(
          response.status === 429 ? "You’ve reached the update limit. Try again later."
            : response.status === 401 ? "Sign in to update website data."
            : response.status === 403 ? "Website data updates are not available for this account."
            : response.status === 400 ? "Enter a valid public website domain."
            : "The update could not be confirmed. Its outcome and charge are unknown; review saved reports before trying again.",
        );
      }
      setResultState({ ownerId: requestedBy, value: parseResult(payload) });
      const data = record(payload);
      setSelectedReport(data?.saved === true && text(data.reportId) ? { ownerId: requestedBy, value: data.reportId } : null);
      if (data?.saved === false)
        setStorageNotice({ ownerId: requestedBy, value: "This result was not saved. Download it before leaving; another update can charge again." });
    } catch (error: unknown) {
      if (account.current === requestedBy && !controller.signal.aborted)
        setRequestError({
          ownerId: requestedBy,
          value:
            error instanceof Error &&
            error.name !== "TypeError" &&
            error.name !== "SyntaxError"
              ? error.message
              : "The update could not be confirmed. Its outcome and charge are unknown; review saved reports before trying again.",
        });
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (account.current === requestedBy && !controller.signal.aborted) setBusyOwner(null);
      if (account.current === requestedBy && !controller.signal.aborted) setHistoryRefreshKey((key) => key + 1);
    }
  }

  async function openReport(id: string) {
    if (!ownerId || busy || activeReportRead.current) return;
    const requestedBy = ownerId;
    const controller = new AbortController();
    activeReportRead.current = controller;
    setOpeningState({ ownerId: requestedBy, value: id });
    setHistoryError(null);
    setResultState(null);
    setSelectedReport(null);
    setStorageNotice(null);
    try {
      const response = await fetch(`/api/seo-reports/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal });
      const payload: unknown = await response.json();
      if (account.current !== requestedBy || controller.signal.aborted) return;
      const report = record(record(payload)?.report);
      if (!response.ok || !report || report.id !== id || report.publication !== "private")
        throw new Error("This saved SEO report is unavailable.");
      if (report.state !== "complete" || report.result === null)
        throw new Error("This update has no saved result. Its completion and cost are unconfirmed; review it before starting another update.");
      const result = parseResult(report.result);
      if (report.domain !== result.domain)
        throw new Error("This saved SEO report could not be matched to its website.");
      setResultState({ ownerId: requestedBy, value: result });
      setSelectedReport({ ownerId: requestedBy, value: id });
      setStorageNotice(null);
      setRequestError(null);
    } catch (error: unknown) {
      if (account.current === requestedBy && !controller.signal.aborted)
        setHistoryError({ ownerId: requestedBy, value: error instanceof Error ? error.message : "The saved report could not be opened." });
    } finally {
      if (activeReportRead.current === controller) activeReportRead.current = null;
      if (account.current === requestedBy && !controller.signal.aborted) setOpeningState(null);
    }
  }

  function downloadResult() {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ format: "folio-private-seo-report-v1", publication: "private", reportId: activeReportId, result }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `folio-seo-${result.domain}-${result.fetchedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="seo-data-panel">
      <section className="seo-data-availability" aria-label="Website data availability">
        <p role={connectionError ? "alert" : "status"}>
          {isPending || (!connection && !connectionError) ? "Checking website data availability…"
            : connectionError ? "Website data availability could not be checked. Saved reports may still be available."
            : !ownerId ? "Sign in to save and update private website reports."
            : ready ? "Website data updates are available. Your saved reports stay private."
            : "Website data updates are unavailable right now. You can still open saved reports."}
        </p>
        {!isPending && !ownerId && <Link className="button primary" href="/login">Sign in to continue <ArrowUpRight size={14} /></Link>}
        {!isPending && !ready && <button type="button" className="button secondary" disabled={busy} onClick={() => setRefreshKey(key => key + 1)}><RefreshCw size={13} /> Check availability</button>}
      </section>

      <section
        className="panel seo-data-query"
        aria-labelledby="seo-data-query-title"
      >
        <div className="seo-data-section-heading">
          <div>
            <h2 id="seo-data-query-title">
              Search and backlinks
            </h2>
            <p>
              See a website’s search reach, ranking keywords, and referring domains.
            </p>
          </div>
        </div>
        <form onSubmit={fetchData}>
          <label htmlFor="seo-data-domain">Website domain</label>
          <div className="seo-data-input-row">
            <div className="seo-data-input-wrap">
              <Globe2 size={16} aria-hidden="true" />
              <input
                id="seo-data-domain"
                name="domain"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="example.com"
                maxLength={2048}
                required
                disabled={busy}
                aria-describedby="seo-data-billing-note"
              />
            </div>
            <button
              type="submit"
              className="button primary"
              disabled={!ready || busy || Boolean(opening) || !domain.trim()}
            >
              {busy ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <BarChart3 size={15} />
              )}{" "}
              {busy ? "Updating website data…" : "Update website data"}
            </button>
          </div>
          <p id="seo-data-billing-note" className="seo-data-query-note">
            <Info size={14} />
            <span>
              Updating runs a new lookup and may incur a charge. Saved reports open without a new lookup. Updates are never automatic.
            </span>
          </p>
          <div className="seo-data-market">
            <span>Google · United States · English</span>
            <span>Backlinks · live links, including subdomains</span>
          </div>
        </form>
        {busy && (
          <p role="status" className="seo-data-progress">
            Looking up organic search and backlinks. Each source returns
            independently.
          </p>
        )}
        {error && (
          <p role="alert" className="seo-data-alert">
            {error}
            {result && " The previous result is still shown below."}
          </p>
        )}
      </section>

      {!isPending && ownerId && (
        <section className="panel seo-data-history" aria-labelledby="seo-history-title">
          <div className="seo-data-section-heading">
            <div>
              <h2 id="seo-history-title">Saved website reports</h2>
              <p>Reopen your latest 50 reports without running another update.</p>
            </div>
            <button type="button" className="button secondary" disabled={busy || Boolean(opening)} onClick={() => setHistoryRefreshKey((key) => key + 1)}>
              <RefreshCw size={13} /> Refresh history
            </button>
          </div>
          {savedError && <p role="alert" className="seo-data-alert">{savedError}</p>}
          {!history && !savedError && <p role="status">Loading saved reports…</p>}
          {history?.length === 0 && <p className="seo-data-history-empty">Your next update will be saved here. Incomplete results remain visible.</p>}
          {history && history.length > 0 && (
            <ul className="seo-data-history-list">
              {history.map((report) => (
                <li key={report.id} className={activeReportId === report.id ? "selected" : ""}>
                  <div><strong>{report.domain}</strong><small>{date(report.retrievedAt ?? report.createdAt)}</small></div>
                  <span className="seo-data-history-status">{report.status === "unconfirmed" ? "Outcome unconfirmed" : report.status === "partial" ? "Partial result" : report.status === "error" ? "Sources unavailable" : "Completed"}</span>
                  <button type="button" className="button secondary" aria-label={`Open saved website report for ${report.domain} from ${date(report.createdAt)}`} disabled={busy || Boolean(opening)} onClick={() => openReport(report.id)}>
                    {opening === report.id ? <Loader2 className="spin" size={13} /> : <ArrowUpRight size={13} />} Open report
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!result ? (
        <section className="seo-data-empty" aria-label="SEO results">
          <span className="seo-data-empty-icon">
            <BarChart3 size={29} />
          </span>
          <h2>See how your website is found.</h2>
          <p>
            Enter a domain to update its search estimates and backlink profile, or open a saved report above.
          </p>
          <span>
            <ShieldCheck size={13} />
            Private to your account · separate from Folio audit scores
          </span>
        </section>
      ) : (
        <div
          className="seo-data-results"
          aria-label={`SEO data for ${result.domain}`}
        >
          <div className="seo-data-result-heading">
            <div>
              <h2>{result.domain}</h2>
              <p>
                Retrieved {date(result.fetchedAt)} · source update time
                unavailable
              </p>
            </div>
            <button type="button" className="button secondary" onClick={downloadResult}><Download size={14} /> Download private report</button>
          </div>
          {activeReportId && !busy && !opening && (
            <section className="seo-data-handoff" aria-label="Evaluate this website">
              <div>
                <h3>Evaluate with this report</h3>
                <p>Review {result.domain} with your saved search and backlink evidence. You’ll choose when to start.</p>
              </div>
              <Link className="button primary" href={evaluationHref({ targetUrl: `https://${result.domain}/`, seoReportId: activeReportId })}>
                Use in evaluation <ArrowRight size={15} />
              </Link>
            </section>
          )}
          {saveNotice && <p className="seo-data-alert" role="alert">{saveNotice}</p>}
          {result.status === "partial" && (
            <p className="seo-data-partial" role="status">
              <Info size={15} />
              One source could not complete. The available results are shown
              below.
            </p>
          )}
          <OrganicSection observation={result.organic} />
          <BacklinksSection observation={result.backlinks} />
          <p className="seo-data-disclosure">
            <ShieldCheck size={15} />
            Search and backlink observations remain distinct from readiness scores.
            They stay private when you include them in an evaluation and are not
            published to the Folio Index.
          </p>
        </div>
      )}
    </div>
  );
}

function DataMetric({
  label,
  value,
  hint,
  primary = false,
}: {
  label: string;
  value: string;
  hint: string;
  primary?: boolean;
}) {
  return (
    <div className={`seo-data-metric ${primary ? "primary" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}
function ObservationState({
  kind,
  observation,
}: {
  kind: "organic" | "backlinks";
  observation: SeoObservation<unknown>;
}) {
  if (observation.status === "success") return null;
  return (
    <div
      className={`seo-data-source-state ${observation.status === "error" ? "error" : ""}`}
    >
      <Info size={20} />
      <div>
        <h3>
          {observation.status === "error"
            ? `${kind === "organic" ? "Organic search" : "Backlinks"} unavailable`
            : "No data returned for this domain"}
        </h3>
        <p>
          {observation.status === "error"
            ? "This part of the report is unavailable. Missing data is not a zero score."
            : `No ${kind === "organic" ? "organic search" : "backlink"} record was returned. Missing data is not a zero score.`}
        </p>
      </div>
    </div>
  );
}
function SourceFooter({
  observation,
}: {
  observation: SeoObservation<unknown>;
}) {
  return (
    <div className="seo-data-source-footer">
      <span>
        {observation.status === "success" ? (
          <Check size={12} />
        ) : (
          <Info size={12} />
        )}
        Retrieved {date(observation.fetchedAt)}
      </span>
    </div>
  );
}
function OrganicSection({
  observation,
}: {
  observation: SeoObservation<OrganicOverview>;
}) {
  const data = observation.data;
  const largest = data
    ? Math.max(1, ...data.positions.map((position) => position.count ?? 0))
    : 1;
  return (
    <section
      className="panel seo-data-source"
      aria-labelledby="seo-organic-title"
    >
      <div className="seo-data-section-heading">
        <div>
          <h2 id="seo-organic-title">
            <BarChart3 size={17} />
            Organic search
          </h2>
          <p>Google · United States · English</p>
        </div>
        <span className="seo-data-badge">Search estimates</span>
      </div>
      <ObservationState kind="organic" observation={observation} />
      {observation.status === "success" && data && (
        <>
          <div className="seo-data-metrics">
            <DataMetric
              label="Ranking keywords"
              value={count(data.organicKeywords)}
              hint="Keywords in the search index"
              primary
            />
            <DataMetric
              label="Estimated monthly traffic"
              value={count(data.estimatedMonthlyTraffic)}
              hint="Modeled visits, not site analytics"
            />
            <DataMetric
              label="Estimated traffic value"
              value={money(data.estimatedTrafficValueUsd)}
              hint="Estimated paid equivalent · USD"
            />
          </div>
          <div className="seo-data-distribution">
            <h3>Where your keywords rank</h3>
            <p>Keyword count by Google position · a dash means unavailable</p>
            <ol aria-label="Organic keywords by search position">
              {data.positions.map((position, index) => (
                <li key={`${position.label}-${index}`}>
                  <span className="seo-data-position">{position.label}</span>
                  <span className="seo-data-bar-track" aria-hidden="true">
                    <span
                      style={{
                        width: `${((position.count ?? 0) / largest) * 100}%`,
                      }}
                    />
                  </span>
                  <strong>{count(position.count)}</strong>
                </li>
              ))}
            </ol>
          </div>
          <div className="seo-data-movement">
            {(
              [
                ["New keywords", data.movement.new],
                ["Moved up", data.movement.up],
                ["Moved down", data.movement.down],
                ["Lost keywords", data.movement.lost],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{count(value)}</strong>
              </div>
            ))}
          </div>
          <p className="seo-data-source-note">Search estimates are modeled observations, not your site analytics or a complete record of search activity.</p>
        </>
      )}
      <SourceFooter observation={observation} />
    </section>
  );
}
function BacklinksSection({
  observation,
}: {
  observation: SeoObservation<BacklinksOverview>;
}) {
  const data = observation.data;
  return (
    <section
      className="panel seo-data-source"
      aria-labelledby="seo-backlinks-title"
    >
      <div className="seo-data-section-heading">
        <div>
          <h2 id="seo-backlinks-title">
            <Link2 size={17} />
            Backlink profile
          </h2>
          <p>Live links · includes subdomains</p>
        </div>
        <span className="seo-data-badge">Live backlink index</span>
      </div>
      <ObservationState kind="backlinks" observation={observation} />
      {observation.status === "success" && data && (
        <>
          <div className="seo-data-metrics seo-data-metrics-four">
            <DataMetric
              label="Backlinks"
              value={count(data.backlinks)}
              hint="Live links found in the index"
            />
            <DataMetric
              label="Referring domains"
              value={count(data.referringDomains)}
              hint="May include subdomains"
            />
            <DataMetric
              label="Referring main domains"
              value={count(data.referringMainDomains)}
              hint="Root-domain grouping"
            />
            <DataMetric
              label="Link authority"
              value={
                data.authorityRank === null
                  ? "—"
                  : `${count(data.authorityRank)} / 100`
              }
              hint="Indexed link metric · not a search position"
              primary
            />
          </div>
          <dl className="seo-data-backlink-details">
            {(
              [
                ["Referring pages", data.referringPages],
                ["Broken backlinks", data.brokenBacklinks],
                ["Broken pages", data.brokenPages],
                ["Crawled pages", data.crawledPages],
                ["Backlink spam score", data.backlinksSpamScore],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{count(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="seo-data-source-note">Counts reflect links found in the backlink index and may differ from other sources. A dash means the value is unavailable.</p>
        </>
      )}
      <SourceFooter observation={observation} />
    </section>
  );
}
