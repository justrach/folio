"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Globe2, Loader2, RefreshCw } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import "./published-index.css";

type Methodology = {
  version: string;
  name: string;
  summary: string;
  scope: string;
  formula: string;
  weights: { id: string; label: string; weight: number }[];
  rules: string[];
  limitations: string[];
};

type PublishedSite = {
  id: string;
  url: string;
  name: string;
  score: number;
  rank: number;
  scannedAt: string;
  evaluationVersion: string;
  source: "published-scan";
};

type OwnedSite = {
  id: string;
  url: string;
  name: string;
  isPublic: boolean;
  seoScore: number | null;
  lastScannedAt: string | null;
};

type PublishedResponse = {
  sites: PublishedSite[];
  methodology: Methodology;
  generatedAt: string;
};

function timestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function httpUrl(value: string) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  )
    return payload.error;
  return fallback;
}

function isMethodology(value: unknown): value is Methodology {
  if (!value || typeof value !== "object") return false;
  const method = value as Methodology;
  return (
    [
      method.version,
      method.name,
      method.summary,
      method.scope,
      method.formula,
    ].every((item) => typeof item === "string") &&
    Array.isArray(method.weights) &&
    method.weights.every(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.label === "string" &&
        Number.isFinite(item.weight),
    ) &&
    Array.isArray(method.rules) &&
    method.rules.every((item) => typeof item === "string") &&
    Array.isArray(method.limitations) &&
    method.limitations.every((item) => typeof item === "string")
  );
}

function isPublishedSite(value: unknown): value is PublishedSite {
  if (!value || typeof value !== "object") return false;
  const site = value as PublishedSite;
  return (
    [
      site.id,
      site.url,
      site.name,
      site.scannedAt,
      site.evaluationVersion,
    ].every((item) => typeof item === "string") &&
    site.source === "published-scan" &&
    Number.isFinite(site.score) &&
    site.score >= 0 &&
    site.score <= 100 &&
    Number.isInteger(site.rank) &&
    site.rank > 0 &&
    httpUrl(site.url) !== null &&
    !Number.isNaN(Date.parse(site.scannedAt))
  );
}

function isOwnedSite(value: unknown): value is OwnedSite {
  if (!value || typeof value !== "object") return false;
  const site = value as OwnedSite;
  return (
    [site.id, site.url, site.name].every((item) => typeof item === "string") &&
    typeof site.isPublic === "boolean" &&
    (site.seoScore === null || Number.isFinite(site.seoScore)) &&
    (site.lastScannedAt === null || typeof site.lastScannedAt === "string")
  );
}

function MethodologyDetails({ method }: { method: Methodology }) {
  return (
    <details className="published-methodology">
      <summary>
        Read the scoring methodology <span>{method.version}</span>
      </summary>
      <div className="published-methodology-body">
        <h3>{method.name}</h3>
        <p>{method.summary}</p>
        <p>
          <strong>Scope.</strong> {method.scope}
        </p>
        <p>
          <strong>Scoring.</strong> {method.formula}
        </p>
        <div
          className="published-weights"
          aria-label="Points available for each check"
        >
          {method.weights.map((weight) => (
            <div key={weight.id}>
              <span>{weight.label}</span>
              <strong>{weight.weight} points</strong>
            </div>
          ))}
        </div>
        <h4>How each check is scored</h4>
        <ul>
          {method.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        <h4>How to interpret the results</h4>
        <ul>
          {method.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** Actual opted-in saved audits. This component never substitutes demo data. */
export function PublishedIndex() {
  const [report, setReport] = useState<PublishedResponse | null>(null);
  const [methodology, setMethodology] = useState<Methodology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setReport(null);
    async function load() {
      try {
        const response = await fetch("/api/leaderboard", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (controller.signal.aborted) return;
        if (isMethodology(payload.methodology))
          setMethodology(payload.methodology);
        if (!response.ok)
          throw new Error(
            errorMessage(
              payload,
              "The published index is temporarily unavailable.",
            ),
          );
        if (
          !Array.isArray(payload.sites) ||
          !payload.sites.every(isPublishedSite) ||
          !isMethodology(payload.methodology) ||
          typeof payload.generatedAt !== "string" ||
          payload.sites.some(
            (site: PublishedSite) =>
              site.evaluationVersion !== payload.methodology.version,
          )
        ) {
          throw new Error(
            "The index response could not be read. Please try again.",
          );
        }
        setReport(payload as PublishedResponse);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "The published index could not be loaded.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  const filtered =
    report?.sites.filter((site) =>
      `${site.name} ${site.url}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ) ?? [];

  return (
    <section
      className="panel published-index"
      aria-labelledby="published-index-title"
      aria-busy={loading}
    >
      <div className="panel-heading published-heading">
        <div>
          <span className="published-kicker">PUBLISHED PAGE AUDITS</span>
          <h2 id="published-index-title">The public technical index.</h2>
          <p>Real saved audits, published by the accounts that added them.</p>
        </div>
        <button
          type="button"
          className="button secondary published-refresh"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
          aria-label="Refresh published index"
        >
          {loading ? (
            <Loader2 size={14} className="spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}{" "}
          Refresh
        </button>
      </div>
      <p className="published-scope">
        Each score checks one public HTML page. This is a submitted sample of
        page readiness; it does not measure search position, AI recommendations,
        or verified domain ownership.
      </p>
      {loading ? (
        <div className="published-state" role="status">
          <Loader2 className="spin" size={21} aria-hidden="true" />
          <p>Loading published audits…</p>
        </div>
      ) : error ? (
        <div className="published-state">
          <h3>The index is unavailable.</h3>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try loading again
          </button>
        </div>
      ) : report && report.sites.length === 0 ? (
        <div className="published-state">
          <Globe2 size={27} aria-hidden="true" />
          <h3>No page audits published yet.</h3>
          <p>
            Run a saved audit, then choose to publish it from My websites.
            Eligible results will appear here.
          </p>
          <Link href="/websites" className="button secondary">
            Go to My websites <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : report ? (
        <>
          <div className="published-table-toolbar">
            <span>
              {report.sites.length} published{" "}
              {report.sites.length === 1 ? "page" : "pages"} ·{" "}
              {report.methodology.version}
            </span>
            <label>
              Find a page
              <input
                type="search"
                aria-label="Search published pages"
                placeholder="Name or URL…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="table-scroll">
            <table className="ranking-table published-table">
              <caption className="published-sr-only">
                Published technical page readiness scores. Equal scores share a
                rank.
              </caption>
              <thead>
                <tr>
                  <th scope="col">RANK</th>
                  <th scope="col">PAGE</th>
                  <th scope="col">READINESS</th>
                  <th scope="col">AUDITED AT</th>
                  <th scope="col">RUBRIC</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((site) => (
                  <tr key={site.id}>
                    <td>{String(site.rank).padStart(2, "0")}</td>
                    <td>
                      <a
                        className="published-page-link"
                        href={site.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>
                          <strong>{site.name || site.url}</strong>
                          <small>{site.url}</small>
                        </span>
                        <ArrowUpRight size={15} aria-hidden="true" />
                        <span className="published-sr-only">
                          {" "}
                          (opens in a new tab)
                        </span>
                      </a>
                    </td>
                    <td>
                      <span className="score-cell">
                        <strong>
                          {site.score}
                          <small> / 100</small>
                        </strong>
                        <i aria-hidden="true">
                          <i style={{ width: `${site.score}%` }} />
                        </i>
                      </span>
                    </td>
                    <td>
                      <time dateTime={site.scannedAt}>
                        {timestamp(site.scannedAt)}
                      </time>
                    </td>
                    <td>
                      <span className="status-pill">
                        {site.evaluationVersion}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="published-no-results" role="status">
              No published pages match “{query}”.
            </p>
          )}
        </>
      ) : null}
      {report && !loading && !error && (
        <div className="published-updated">
          Index retrieved{" "}
          <time dateTime={report.generatedAt}>
            {timestamp(report.generatedAt)}
          </time>
          <span>Latest eligible audit per URL · equal scores share a rank</span>
        </div>
      )}
      {methodology && <MethodologyDetails method={methodology} />}
    </section>
  );
}

type OwnedState = {
  ownerId: string | null;
  sites: OwnedSite[];
  loading: boolean;
  error: string;
};

/** Publication is an explicit account action; adding a URL is not domain verification. */
export function PublicationControls({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id ?? null;
  const [state, setState] = useState<OwnedState>({
    ownerId: null,
    sites: [],
    loading: true,
    error: "",
  });
  const [revision, setRevision] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publicationError, setPublicationError] = useState("");
  const [message, setMessage] = useState("");
  const mutation = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusyId(null);
    setPublicationError("");
    setMessage("");
    setState({
      ownerId: userId,
      sites: [],
      loading: Boolean(userId),
      error: "",
    });
    if (userId) {
      void (async () => {
        try {
          const response = await fetch("/api/sites", {
            cache: "no-store",
            signal: controller.signal,
          });
          const payload = await response.json();
          if (!response.ok)
            throw new Error(
              errorMessage(payload, "Your saved pages could not be loaded."),
            );
          if (
            !Array.isArray(payload.sites) ||
            !payload.sites.every(isOwnedSite)
          )
            throw new Error("The saved pages response could not be read.");
          if (!controller.signal.aborted)
            setState({
              ownerId: userId,
              sites: payload.sites,
              loading: false,
              error: "",
            });
        } catch (cause) {
          if (!controller.signal.aborted)
            setState({
              ownerId: userId,
              sites: [],
              loading: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Your saved pages could not be loaded.",
            });
        }
      })();
    }
    return () => {
      controller.abort();
      mutation.current?.abort();
    };
  }, [userId, revision]);

  async function setPublication(site: OwnedSite) {
    if (!userId || busyId) return;
    const controller = new AbortController();
    mutation.current = controller;
    const isPublic = !site.isPublic;
    setBusyId(site.id);
    setPublicationError("");
    setMessage("");
    try {
      const response = await fetch("/api/sites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ id: site.id, isPublic }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          errorMessage(payload, "The publication setting could not be saved."),
        );
      if (payload.site?.id !== site.id || payload.site?.isPublic !== isPublic)
        throw new Error(
          "The publication response could not be confirmed. Refresh your pages to check the setting.",
        );
      if (controller.signal.aborted) return;
      // PATCH returns publication fields but no scan metadata; preserve the GET values.
      setState((current) =>
        current.ownerId === userId
          ? {
              ...current,
              sites: current.sites.map((item) =>
                item.id === site.id ? { ...item, isPublic } : item,
              ),
            }
          : current,
      );
      const result = isPublic
        ? `${site.name}: eligible audits are now published.`
        : `${site.name}: your audits have been removed from the public index.`;
      setMessage(result);
      onNotify(result);
    } catch (cause) {
      if (!controller.signal.aborted)
        setPublicationError(
          cause instanceof Error
            ? cause.message
            : "The publication setting could not be saved.",
        );
    } finally {
      if (!controller.signal.aborted) setBusyId(null);
    }
  }

  const loading =
    isPending ||
    (Boolean(userId) && (state.loading || state.ownerId !== userId));

  return (
    <section
      className="panel published-controls"
      aria-labelledby="published-controls-title"
      aria-busy={loading}
    >
      <div className="panel-heading published-heading">
        <div>
          <h2 id="published-controls-title">Choose what you publish.</h2>
          <p>
            Manage public index participation for pages saved in your account.
          </p>
        </div>
        {userId && (
          <button
            type="button"
            className="button secondary published-refresh"
            disabled={loading || Boolean(busyId)}
            onClick={() => setRevision((value) => value + 1)}
            aria-label="Refresh publication settings"
          >
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        )}
      </div>
      {loading ? (
        <div className="published-state" role="status">
          <Loader2 size={21} className="spin" aria-hidden="true" />
          <p>Loading your publication settings…</p>
        </div>
      ) : !userId ? (
        <div className="published-state">
          <h3>Your account, your choice.</h3>
          <p>Sign in to manage publication of your saved page audits.</p>
          <Link href="/login" className="button secondary">
            Sign in to manage publication{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      ) : state.error ? (
        <div className="published-state">
          <p role="alert">{state.error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try loading your pages again
          </button>
        </div>
      ) : (
        <>
          <p className="published-scope" id="published-consent">
            Publishing shares the page URL, name, latest eligible score, and
            audit time. Future eligible audits are included until you remove
            this page. Adding a URL to your account does not verify domain
            ownership.
          </p>
          {state.sites.length === 0 ? (
            <div className="published-state">
              <Globe2 size={26} aria-hidden="true" />
              <h3>No saved pages yet.</h3>
              <p>
                Run an audit to save your first page. Publication is an optional
                next step.
              </p>
            </div>
          ) : (
            <div className="published-site-list">
              {state.sites.map((site) => (
                <div className="published-site-row" key={site.id}>
                  <Globe2
                    size={19}
                    className="published-site-icon"
                    aria-hidden="true"
                  />
                  <div className="published-site-identity">
                    <h3>{site.name || site.url}</h3>
                    <p>{site.url}</p>
                    <small>
                      {site.lastScannedAt
                        ? `Latest saved audit: ${site.seoScore ?? "—"}/100 · ${timestamp(site.lastScannedAt)}`
                        : "Run a saved audit before publishing."}
                    </small>
                  </div>
                  <span
                    className={`status-pill ${site.isPublic ? "pass" : ""}`}
                  >
                    {site.isPublic ? "Publication enabled" : "Not published"}
                  </span>
                  <button
                    type="button"
                    className={`button ${site.isPublic ? "secondary" : "primary"}`}
                    disabled={
                      Boolean(busyId) || (!site.isPublic && !site.lastScannedAt)
                    }
                    aria-describedby="published-consent"
                    aria-label={`${site.isPublic ? "Remove audits from index for" : "Publish audits for"} ${site.name || site.url}`}
                    onClick={() => void setPublication(site)}
                  >
                    {busyId === site.id ? (
                      <>
                        <Loader2
                          size={14}
                          className="spin"
                          aria-hidden="true"
                        />{" "}
                        Saving…
                      </>
                    ) : site.isPublic ? (
                      "Remove from index"
                    ) : (
                      "Publish audits"
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
          {publicationError && (
            <p className="published-action-error" role="alert">
              {publicationError}
            </p>
          )}
          <p className="published-feedback" role="status" aria-live="polite">
            {message}
          </p>
          <div className="published-controls-footer">
            <span>
              Only scans using the current public rubric are eligible. Another
              account may also have published an audit of the same URL.
            </span>
            <Link href="/leaderboard">
              View public index <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
