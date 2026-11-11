"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Bot } from "lucide-react";
import type { GoogleBand, WebsiteGapsReport } from "@/lib/website-gaps";
import "./website-visibility.css";

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const count = (value: number) => value >= 100_000 ? compact.format(value) : plain.format(value);
const day = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : null;
const path = (url: string | null) => { if (!url) return null; try { const parsed = new URL(url); return `${parsed.pathname}${parsed.search}` || "/"; } catch { return null; } };
const BANDS: { id: GoogleBand; label: string }[] = [{ id: "top3", label: "Top 3" }, { id: "page1", label: "Rest of page 1" }, { id: "page2", label: "Page 2" }, { id: "deeper", label: "Page 3 or later" }];
const SEVERITY = { high: "High priority", medium: "Worth fixing", low: "Minor" } as const;

function Destination({ url, label }: { url: string; label: string }) {
  return url.startsWith("/") ? <Link href={url}>{label}<ArrowUpRight size={13} aria-hidden="true" /></Link>
    : <a href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}

/** Saved data only: opening or refreshing this panel never starts a lookup or a run. */
export function WebsiteVisibility({ websiteId, refresh = 0 }: { websiteId: string; refresh?: number }) {
  const [state, setState] = useState<{ key: string; report: WebsiteGapsReport | null; error: string | null }>({ key: "", report: null, error: null });
  const [allSearches, setAllSearches] = useState(false);
  const key = `${websiteId}:${refresh}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sites/${encodeURIComponent(websiteId)}/visibility`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json() as { report?: WebsiteGapsReport };
      if (!response.ok || !payload.report || payload.report.website.id !== websiteId) throw new Error("Invalid report");
      if (!controller.signal.aborted) setState({ key, report: payload.report, error: null });
    }).catch(() => { if (!controller.signal.aborted) setState({ key, report: null, error: "Where this website shows up couldn’t be loaded. Refresh the page to try again." }); });
    return () => controller.abort();
  }, [key, websiteId]);
  const report = state.key === key ? state.report : state.report?.website.id === websiteId ? state.report : null;
  const error = state.key === key ? state.error : null;
  if (!report) return <section className="panel website-visibility" aria-label="Where this website shows up">
    <h2>Where it shows up</h2>{error ? <p role="alert">{error}</p> : <p role="status">Loading where this website shows up…</p>}
  </section>;

  const { google, aiAnswers, crawl, website } = report;
  const searches = allSearches ? google.searches : google.searches.slice(0, 7);
  const maxVolume = Math.max(1, ...google.searches.map(item => item.searchVolume ?? 0));
  const read = crawl.pagesCrawled !== null && crawl.inventoryPages ? Math.min(1, crawl.pagesCrawled / crawl.inventoryPages) : null;
  const maxSection = Math.max(1, ...crawl.topSections.map(item => item.pages));
  return <section className="panel website-visibility" aria-label={`Where ${website.domain} shows up`}>
    <header className="wv-head">
      <h2>Where it shows up</h2>
      {website.access === "organization" && <p className="wv-shared">Shared with you through {website.organizations.map(item => item.name).join(", ")}. Reports are the sharing member’s saved data.</p>}
      <p className="wv-summary">{report.summary}</p>
    </header>

    <div className="wv-lanes">
      <section className="wv-lane" aria-labelledby="wv-google-title">
        <h3 id="wv-google-title">Google search</h3>
        {google.state === "tracked" ? <>
          <p className="wv-meta">{google.tracked} searches tracked{day(google.capturedAt) ? ` · ${day(google.capturedAt)}` : ""} · US</p>
          <div className="wv-bands" role="img" aria-label={BANDS.map(item => `${google.bands[item.id]} ${item.label.toLowerCase()}`).join(", ")}>
            {BANDS.map(item => google.bands[item.id] > 0 && <span key={item.id} className={`wv-band is-${item.id}`} style={{ flexGrow: google.bands[item.id] }} />)}
          </div>
          <ul className="wv-legend">{BANDS.map(item => <li key={item.id}><span className={`wv-dot is-${item.id}`} aria-hidden="true" />{item.label} <b>{google.bands[item.id]}</b></li>)}</ul>
          <ol className="wv-searches" aria-label="Searches that show it, by estimated visits">
            {searches.map(item => <li key={item.keyword}>
              <span className={`wv-position is-${item.band}`} title={`Position ${item.position}`}>#{item.position}</span>
              <div className="wv-search">
                <span className="wv-keyword">{item.keyword}{item.brand && <em className="wv-tag">its name</em>}</span>
                {item.searchVolume !== null && <span className="wv-volume" aria-hidden="true"><span style={{ width: `${Math.max(3, 100 * item.searchVolume / maxVolume)}%` }} /></span>}
                {path(item.landingPage) && <span className="wv-page">{path(item.landingPage)}</span>}
              </div>
              <span className="wv-searches-count">{item.searchVolume === null ? "—" : `${count(item.searchVolume)}/mo`}</span>
            </li>)}
          </ol>
          {google.searches.length > 7 && <button type="button" className="text-link wv-more" onClick={() => setAllSearches(value => !value)}>
            {allSearches ? "Show fewer" : `Show the top ${google.searches.length}`}</button>}
        </> : <p className="wv-empty">{report.search.rankingKeywords.state === "none" ? "Google doesn’t show it for any US search yet."
          : report.search.rankingKeywords.state === "value" ? `The saved report counts ${count(report.search.rankingKeywords.value ?? 0)} searches, but Folio hasn’t recorded which ones.`
          : google.state === "unavailable" ? "Recorded Google positions couldn’t be read right now." : "Folio hasn’t recorded any Google positions for it."}</p>}
      </section>

      <section className="wv-lane" aria-labelledby="wv-ai-title">
        <h3 id="wv-ai-title">AI answers</h3>
        <p className="wv-meta">Folio’s published index{aiAnswers.publishedQuestions !== null ? ` · ${count(aiAnswers.publishedQuestions)} answers` : ""}</p>
        <div className="wv-stat"><strong>{aiAnswers.namedIn}</strong><span>published answer{aiAnswers.namedIn === 1 ? "" : "s"} name it{aiAnswers.citedIn ? ` · cited in ${aiAnswers.citedIn}` : ""}</span></div>
        {aiAnswers.answers.length > 0 && <ol className="wv-answers">{aiAnswers.answers.map(item => <li key={item.queryId}>
          <span className="wv-position is-page1">{item.position === null ? "cited" : `#${item.position}`}</span><Link href={item.page}>{item.query}</Link></li>)}</ol>}
        {aiAnswers.related.total > 0 && <div className="wv-related">
          <p><b>{count(aiAnswers.related.total)} indexed question{aiAnswers.related.total === 1 ? "" : "s"}</b> mention {aiAnswers.related.matchedTerms.slice(0, 3).map(term => `“${term}”`).join(", ")}.
            {" "}{aiAnswers.related.published === 0 ? "None has been answered yet." : `${aiAnswers.related.published} answered.`}</p>
          <ul className="wv-chips">{aiAnswers.related.categories.map(item => <li key={item.category}>{item.category}<span>{item.published}/{item.total} answered</span></li>)}</ul>
          {aiAnswers.related.items[0] && <Link className="wv-inline-link" href={aiAnswers.related.items[0].page}>See an example question<ArrowUpRight size={13} aria-hidden="true" /></Link>}
        </div>}
        <p className="wv-yours">{aiAnswers.yourQuestions === null ? "Saved questions for it couldn’t be read." : aiAnswers.yourQuestions.completed === 0
          ? "No saved question for it has an answer yet." : `Saved questions: named in ${aiAnswers.yourQuestions.named} of ${aiAnswers.yourQuestions.completed} answers.`}</p>
      </section>

      <section className="wv-lane" aria-labelledby="wv-crawl-title">
        <h3 id="wv-crawl-title">What Folio has read</h3>
        {crawl.state === "in_index" ? <>
          <p className="wv-meta">Pages saved from the site{day(crawl.lastFetchedAt) ? ` · last read ${day(crawl.lastFetchedAt)}` : ""}</p>
          <div className="wv-stat"><strong>{count(crawl.pagesCrawled ?? 0)}</strong><span>{crawl.inventoryPages ? `of ${count(crawl.inventoryPages)} pages in its sitemaps` : "pages read"}</span></div>
          {read !== null && <div className="wv-progress" role="img" aria-label={`${Math.round(read * 1000) / 10}% of its pages read`}><span style={{ width: `${Math.max(1, read * 100)}%` }} /></div>}
          {crawl.topSections.length > 0 && <><p className="wv-subhead">Largest sections in its sitemaps</p>
            <ul className="wv-sections">{crawl.topSections.map(item => <li key={item.path}><span className="wv-page">{item.path}</span>
              <span className="wv-bar" aria-hidden="true"><span style={{ width: `${100 * item.pages / maxSection}%` }} /></span><span>{count(item.pages)}</span></li>)}</ul></>}
        </> : <p className="wv-empty">{crawl.state === "unavailable" ? "Folio’s crawl couldn’t be read right now." : "Folio hasn’t read this website yet."}</p>}
      </section>
    </div>

    <section className="wv-gaps" aria-labelledby="wv-gaps-title">
      <h3 id="wv-gaps-title">What it’s missing <span className="wv-count">{report.gaps.length}</span></h3>
      {report.gaps.length ? <ol>{report.gaps.map(gap => <li key={gap.id} className={`wv-gap is-${gap.severity}`} data-gap-id={gap.id}>
        <div className="wv-gap-title"><span className="wv-severity">{SEVERITY[gap.severity]}</span><strong>{gap.title}</strong></div>
        <p>{gap.finding}</p>
        <p className="wv-next"><b>Next step</b>{gap.nextStep}</p>
        {gap.evidence.length > 0 && <ul className="wv-evidence">{gap.evidence.map(item => <li key={item.url}><Destination url={item.url} label={item.label} /></li>)}</ul>}
      </li>)}</ol> : <p className="wv-empty">Nothing stands out in the saved data. Check the “not checked yet” items below before treating that as good news.</p>}
    </section>

    {report.notChecked.length > 0 && <section className="wv-unknowns" aria-labelledby="wv-unknowns-title">
      <h3 id="wv-unknowns-title">Not checked yet</h3>
      <ul>{report.notChecked.map(item => <li key={item.id} data-unknown-id={item.id}>
        <strong>{item.title}</strong><p>{item.detail}</p><p className="wv-next"><b>To find out</b>{item.nextStep}</p>
        {item.link && <Destination url={item.link.url} label={item.link.label} />}
      </li>)}</ul>
    </section>}

    <footer className="wv-foot"><Bot size={16} aria-hidden="true" />
      <p>Agents with a Folio key read this same report with <code>folio_website_gaps</code>. Nothing on this panel starts paid work. <Link href="/agents#connect">Connect an agent</Link></p>
    </footer>
  </section>;
}
