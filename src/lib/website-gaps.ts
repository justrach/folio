import "server-only";
import type { D1Database } from "@cloudflare/workers-types";
import { AgentApiError } from "./agent-api-key-store";
import { indexWebsite, publishedIndex, type IndexSource } from "./index-answers";
import { crawlWebsite } from "./index-pages";
import { registrableDomain } from "./index-stats";
import { getOwnedSeoReport, listOwnedSeoReports } from "./seo-store";
import { readableWebsite } from "./organizations";
import { withLimit } from "./sequential";
import READ_PLAN from "../data/read-plan.json";
import { savedVisibility, visibilityFilters } from "./visibility-service";
import { listSavedSearchConsoleReports } from "./search-console-store";

/**
 * One owned website's visibility in one read, for the owner's page and for agents
 * (`folio_website_gaps`): which Google searches show it, its saved search and backlink
 * counts, whether published AI answers name it, how much of it Folio has read, and
 * what it is missing. Saved data only: no provider call, no paid work, no writes.
 */
export const WEBSITE_GAPS_HOW_TO_READ = "Built from saved data only. Google positions are the latest recorded US results for the searches Folio tracks, not every search. Search and backlink counts come from the latest saved lookup with data. AI answers are Folio's published answers plus your own saved questions for this website; a website not named there was not measured as absent elsewhere. Gaps are rules applied to these numbers, not verified causes; \"not checked\" items are unknowns, not findings.";

export type Measure = { state: "value" | "none" | "missing"; value: number | null };
export type GoogleBand = "top3" | "page1" | "page2" | "deeper";
export type GoogleSearch = { keyword: string; position: number; band: GoogleBand; searchVolume: number | null; estimatedTraffic: number | null; landingPage: string | null; brand: boolean };
export type GapArea = "google" | "links" | "ai_answers" | "coverage";
export type WebsiteGap = { id: string; area: GapArea; severity: "high" | "medium" | "low"; title: string; finding: string; nextStep: string; evidence: { label: string; url: string }[] };
export type WebsiteBlindSpot = { id: string; area: GapArea; title: string; detail: string; nextStep: string; link: { label: string; url: string } | null };
export type WebsiteSearchSummary = { state: "measured" | "failed" | "not_measured"; reportId: string | null; fetchedAt: string | null;
  backlinks: Measure; referringDomains: Measure; brokenBacklinks: number | null; rankingKeywords: Measure; estimatedMonthlyVisits: Measure };
type IndexAnswerRow = { queryId: string; query: string; category: string; position: number | null; cited: boolean; page: string };
type IndexQuestionRow = { queryId: string; query: string; category: string; published: boolean; page: string };

export type WebsiteAccess = { access: "owner" | "organization"; organizations: { id: string; name: string }[] };
/** `google`: Google's own count. `estimate`: a third party's model. `third_party`: a third party's own record or crawl. `folio`: recorded by Folio. */
export type DataSourceKind = "google" | "estimate" | "third_party" | "folio";
/** Where one kind of number in this report comes from: whose data, how it is made, and when. */
export type DataSource = { id: "google_positions" | "search_volumes" | "visits_estimate" | "backlinks" | "ai_answers" | "crawl" | "search_console";
  label: string; provider: string; kind: DataSourceKind; asOf: string | null; detail: string };
/** The search-visits estimate next to Google's own count of clicks, from the owner's Search Console. */
export type GoogleCheck = {
  state: "compared" | "google_only" | "estimate_only" | "neither" | "owner_only";
  searchConsole: { reportId: string; property: string; startDate: string; endDate: string; scope: "united_states" | "all_countries"; clicks: number; monthlyClicks: number } | null;
  estimate: { monthlyVisits: number; fetchedAt: string | null } | null;
  /** Google's monthly clicks divided by the estimate; null without both or when the estimate is zero. */
  ratio: number | null;
  finding: string;
  caveat: { text: string; sourceUrl: string };
};
export type WebsiteGapsReport = {
  /** `organization`: shared with the reader; the saved data is the sharing member's. */
  website: { id: string; name: string; url: string; domain: string } & WebsiteAccess;
  generatedAt: string;
  summary: string;
  search: WebsiteSearchSummary;
  google: { state: "tracked" | "none_tracked" | "unavailable"; capturedAt: string | null; tracked: number;
    bands: Record<GoogleBand, number>; brandTerms: string[]; brandTrafficShare: number | null; searches: GoogleSearch[] };
  aiAnswers: { source: IndexSource | null; publishedQuestions: number | null; namedIn: number; citedIn: number; bestPosition: number | null; answers: IndexAnswerRow[];
    related: { total: number; published: number; matchedTerms: string[]; categories: { category: string; total: number; published: number }[]; items: IndexQuestionRow[] };
    yourQuestions: { completed: number; named: number } | null };
  crawl: { state: "in_index" | "not_in_index" | "unavailable"; pagesCrawled: number | null; inventoryPages: number | null; lastFetchedAt: string | null; topSections: { path: string; pages: number }[] };
  gaps: WebsiteGap[];
  notChecked: WebsiteBlindSpot[];
  sources: DataSource[];
  googleCheck: GoogleCheck;
  howToRead: string;
};

export type WebsiteGapsInput = {
  website: { id: string; name: string; url: string } & Partial<WebsiteAccess>;
  now: Date;
  search: WebsiteSearchSummary;
  rankings: { available: boolean; rows: { keyword: string; position: number; searchVolume: number | null; estimatedTraffic: number | null; landingPage: string | null; capturedAt: string | null }[] };
  index: { available: boolean; source: IndexSource | null; publishedQuestions: number | null; namedIn: number; citedIn: number; bestPosition: number | null; answers: IndexAnswerRow[]; questions: IndexQuestionRow[] };
  yourQuestions: { completed: number; named: number } | null;
  crawl: { state: "in_index" | "not_in_index" | "unavailable"; pagesCrawled: number | null; inventoryPages: number | null; lastFetchedAt: string | null; profileName: string | null; topSections: { path: string; pages: number }[] };
  /** The owner's latest Search Console snapshot covering the whole domain; omitted for readers who don't own the website. */
  searchConsole?: { reportId: string; property: string; startDate: string; endDate: string; totals: { clicks: number } | null; unitedStatesTotals: { clicks: number } | null } | null;
};

/** Shown wherever the visits estimate is: how it is made, and the published measure of how far such estimates miss. */
export const ESTIMATE_CAVEAT = {
  text: "Search visits are an estimate: searches a month × the share of clicks expected at each position, summed over the US searches a website ranks for. Ahrefs makes its estimate the same way and reports that, across 1,635 websites, its estimates differed from Google Search Console by a median of 50%.",
  sourceUrl: "https://ahrefs.com/blog/traffic-estimations-accuracy/",
} as const;

const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
/** Exact below 100,000; "823K" / "1.5M" above. */
export const formatCount = (value: number) => value >= 100_000 ? compact.format(value) : plain.format(value);
const plural = (count: number, word: string, many = `${word}s`) => `${formatCount(count)} ${count === 1 ? word : many}`;
const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
const pathOf = (url: string | null) => { if (!url) return null; try { const parsed = new URL(url); return `${parsed.pathname}${parsed.search}` || "/"; } catch { return null; } };
const band = (position: number): GoogleBand => position <= 3 ? "top3" : position <= 10 ? "page1" : position <= 20 ? "page2" : "deeper";
const quoteList = (items: string[]) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const phraseIn = (phrase: string, text: string) => new RegExp(`(^|[^a-z0-9])${escape(phrase)}([^a-z0-9]|$)`).test(text);

/** The brand is the domain's first label plus the first word of its crawl profile name, e.g. "manus". */
function brandTerms(domain: string, profileName: string | null): string[] {
  const terms = new Set<string>();
  const label = registrableDomain(domain).split(".")[0];
  if (label.length >= 3) terms.add(label);
  const first = profileName?.toLowerCase().split(/[^a-z0-9]+/).find(Boolean);
  if (first && first.length >= 3) terms.add(first);
  return [...terms];
}

/** Pure: the same input always yields the same report. Rules, thresholds and wording live here. */
export function buildWebsiteGaps(input: WebsiteGapsInput): WebsiteGapsReport {
  const domain = hostOf(input.website.url), siteId = input.website.id;
  const access: WebsiteAccess = { access: input.website.access ?? "owner", organizations: input.website.organizations ?? [] };
  const owner = access.access === "owner";
  const brands = brandTerms(domain, input.crawl.profileName);
  const isBrand = (keyword: string) => brands.some(term => keyword.toLowerCase().includes(term));
  const rows = input.rankings.rows.filter(row => row.keyword.trim() && Number.isFinite(row.position) && row.position >= 1)
    .map(row => ({ keyword: row.keyword.trim().toLowerCase(), position: Math.round(row.position), band: band(row.position), searchVolume: row.searchVolume, estimatedTraffic: row.estimatedTraffic,
      landingPage: row.landingPage, brand: isBrand(row.keyword) }))
    .sort((a, b) => (b.estimatedTraffic ?? -1) - (a.estimatedTraffic ?? -1) || (b.searchVolume ?? -1) - (a.searchVolume ?? -1) || a.keyword.localeCompare(b.keyword));
  const bands: Record<GoogleBand, number> = { top3: 0, page1: 0, page2: 0, deeper: 0 };
  for (const row of rows) bands[row.band]++;
  const traffic = rows.reduce((sum, row) => sum + (row.estimatedTraffic ?? 0), 0);
  const brandTraffic = rows.filter(row => row.brand).reduce((sum, row) => sum + (row.estimatedTraffic ?? 0), 0);
  const brandTrafficShare = traffic > 0 ? Math.round(1000 * brandTraffic / traffic) / 1000 : null;
  const capturedAt = rows.length ? input.rankings.rows.map(row => row.capturedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null : null;
  const google: WebsiteGapsReport["google"] = { state: !input.rankings.available ? "unavailable" : rows.length ? "tracked" : "none_tracked", capturedAt, tracked: rows.length,
    bands, brandTerms: brands, brandTrafficShare, searches: rows.slice(0, 15) };

  // Questions in the index that mention the brand or a phrase the site ranks for on Google.
  const phrases = [...new Set([...brands, ...rows.filter(row => !row.brand).sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)).slice(0, 15).map(row => row.keyword)])]
    .filter(phrase => phrase.length >= 4);
  const matched = new Set<string>();
  const related = input.index.questions.filter(question => {
    const text = question.query.toLowerCase();
    const hits = phrases.filter(phrase => phraseIn(phrase, text));
    hits.forEach(hit => matched.add(hit));
    return hits.length > 0;
  }).sort((a, b) => Number(b.published) - Number(a.published) || a.queryId.localeCompare(b.queryId));
  const relatedPublished = related.filter(item => item.published);
  const categories = new Map<string, { category: string; total: number; published: number }>();
  for (const item of related) {
    const entry = categories.get(item.category) ?? { category: item.category, total: 0, published: 0 };
    entry.total++; if (item.published) entry.published++; categories.set(item.category, entry);
  }
  const aiAnswers: WebsiteGapsReport["aiAnswers"] = { source: input.index.source, publishedQuestions: input.index.publishedQuestions, namedIn: input.index.namedIn, citedIn: input.index.citedIn,
    bestPosition: input.index.bestPosition, answers: input.index.answers.slice(0, 5),
    related: { total: related.length, published: relatedPublished.length, matchedTerms: [...matched].slice(0, 10),
      categories: [...categories.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category)).slice(0, 5), items: related.slice(0, 5) },
    yourQuestions: input.yourQuestions };
  const waiting = related.length - relatedPublished.length;
  const topCategory = aiAnswers.related.categories[0]?.category ?? null;

  const { search } = input, gaps: WebsiteGap[] = [], notChecked: WebsiteBlindSpot[] = [];
  const nonBrand = rows.filter(row => !row.brand);
  const nearPageOne = nonBrand.filter(row => row.position >= 11 && row.position <= 30 && (row.searchVolume ?? 0) >= 1_000)
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0)).slice(0, 3);
  const brandHeavy = brandTrafficShare !== null && brandTrafficShare >= 0.5 && rows.length >= 5;
  const refs = search.referringDomains;

  // Google
  if (search.rankingKeywords.state === "none" && !rows.length)
    gaps.push({ id: "google-no-rankings", area: "google", severity: "high", title: "Google doesn’t show it for any search yet",
      finding: `The saved search report finds no US Google search that shows ${domain}. People who search for what it does won’t find it there.`,
      nextStep: "Publish pages that each answer one specific question your buyers search for, and link them from the homepage.", evidence: [] });
  if (nearPageOne.length) {
    const described = nearPageOne.map(row => `“${row.keyword}” (${row.searchVolume ? `${formatCount(row.searchVolume)} searches a month, ` : ""}#${row.position})`);
    const pages = [...new Map(nearPageOne.filter(row => row.landingPage).map(row => [row.landingPage!, row])).values()];
    gaps.push({ id: "google-near-page-one", area: "google", severity: (nearPageOne[0].searchVolume ?? 0) >= 100_000 ? "high" : "medium",
      title: "Just off page one for big searches",
      finding: `Google shows ${domain} on page 2 or 3 for ${quoteList(described)}. Most clicks go to the first ten results.`,
      nextStep: pages.length ? `Strengthen the pages Google already picks for these searches (${quoteList(pages.map(row => pathOf(row.landingPage) ?? row.landingPage!))}): answer the search directly near the top, and compare each with the pages ranked above it.`
        : "Publish a page that answers each of these searches directly, and compare it with the pages ranked above it.",
      evidence: pages.map(row => ({ label: `${pathOf(row.landingPage)} · “${row.keyword}” #${row.position}`, url: row.landingPage! })) });
  }
  if (brandHeavy) {
    const named = brands[0] ?? domain;
    gaps.push({ id: "google-brand-dependence", area: "google", severity: "medium", title: "Most Google visits come from its own name",
      finding: `${Math.round(brandTrafficShare! * 100)}% of the estimated visits from the ${plural(rows.length, "search", "searches")} Folio tracks come from people already searching for “${named}”. They already know it; new people find it through the other searches.`,
      nextStep: "Grow the pages that answer tasks people search for without knowing the name, starting with the searches it is close to winning.", evidence: [] });
  }
  // Links
  if ((refs.state === "value" && refs.value! < 10) || refs.state === "none") {
    const count = refs.value ?? 0;
    gaps.push({ id: "links-few", area: "links", severity: "high", title: count ? `Only ${plural(count, "website")} link${count === 1 ? "s" : ""} to it` : "No website links to it yet",
      finding: "Links from other websites are how search engines, and AI assistants that search the web, discover a site and decide to trust it.",
      nextStep: "Get listed where buyers compare options: relevant directories, launch and review sites, comparison articles and partner pages.", evidence: [] });
  }
  if (search.brokenBacklinks !== null && search.brokenBacklinks >= 10)
    gaps.push({ id: "links-broken", area: "links", severity: search.brokenBacklinks >= 100 ? "medium" : "low", title: `${plural(search.brokenBacklinks, "link")} point at broken pages`,
      finding: `Other websites link to pages on ${domain} that no longer load, so those links send visitors and trust nowhere.`,
      nextStep: "Find the broken URLs in the server’s 404 logs or a backlink tool, and redirect each to the closest live page.", evidence: [] });
  // AI answers
  const yours = input.yourQuestions;
  if (yours && yours.completed > 0 && yours.named < yours.completed)
    gaps.push({ id: "ai-answers-your-questions", area: "ai_answers", severity: "high", title: `Named in ${yours.named} of ${plural(yours.completed, "answer")} to its saved questions`,
      finding: `In the saved questions for ${domain}, the AI answer left it out ${yours.completed - yours.named} time${yours.completed - yours.named === 1 ? "" : "s"}.`,
      nextStep: "Open each answer that left it out, see which pages were cited instead, and make its own page answer that question as directly.",
      evidence: owner ? [{ label: "Saved questions", url: `/benchmarks?website=${encodeURIComponent(siteId)}` }] : [] });
  if (input.index.namedIn === 0 && relatedPublished.length)
    gaps.push({ id: "ai-answers-left-out", area: "ai_answers", severity: "high", title: `Left out of ${plural(relatedPublished.length, "published answer")} on its topics`,
      finding: `Folio’s index has published AI answers to questions about ${quoteList([...matched].slice(0, 3).map(item => `“${item}”`))}, and none of them names ${domain}.`,
      nextStep: "Read those answers, note which websites were named and why, and make sure its own pages answer the same questions directly.",
      evidence: relatedPublished.slice(0, 5).map(item => ({ label: item.query, url: item.page })) });

  // Not checked yet: unknowns, kept apart from findings.
  if (search.state !== "measured")
    notChecked.push({ id: "search-report", area: "links", title: search.state === "failed" ? "The last search lookup returned nothing" : "No saved search and backlink numbers",
      detail: "Backlinks, linking websites, ranking keywords and estimated visits are unknown until a lookup succeeds.",
      nextStep: "Press “Update website data” on the website page. It runs one paid lookup.", link: { label: "Open reports", url: `/search-data?target=${encodeURIComponent(`https://${domain}/`)}` } });
  if (!rows.length && search.rankingKeywords.state === "value" && (search.rankingKeywords.value ?? 0) > 0)
    notChecked.push({ id: "google-searches", area: "google", title: "Which searches show it isn’t recorded",
      detail: `The saved report counts ${plural(search.rankingKeywords.value!, "ranking search", "ranking searches")}, but Folio hasn’t recorded which ones or at what position.`,
      nextStep: "Collect the keyword rows for the saved report on the search data page.", link: { label: "Open reports", url: `/search-data?target=${encodeURIComponent(`https://${domain}/`)}` } });
  if (!input.index.available)
    notChecked.push({ id: "ai-answers", area: "ai_answers", title: "AI answers couldn’t be read",
      detail: "Folio’s published index couldn’t be read just now, so whether AI answers name it is unknown.", nextStep: "Read this report again later.", link: null });
  else if (input.index.namedIn === 0 && !relatedPublished.length && waiting > 0) {
    const terms = quoteList([...matched].slice(0, 3).map(item => `“${item}”`));
    notChecked.push({ id: "ai-answers", area: "ai_answers", title: `${plural(waiting, "question")} about it ${waiting === 1 ? "is" : "are"} waiting for answers`,
      detail: `Folio’s index has ${plural(waiting, "question")} that mention ${terms}${topCategory ? ` (mostly ${topCategory})` : ""}, but none has a published answer yet. Whether AI answers name ${domain} there is unmeasured, not absent.`,
      nextStep: "Collect answers for those questions, then read where it is named and which websites are named instead. Each answer is a paid run that someone starts.",
      link: { label: "See the questions", url: related[0].page } });
  } else if (input.index.namedIn === 0 && !relatedPublished.length && !(yours && yours.completed > 0)) {
    const examples = nonBrand.slice(0, 2).map(row => `“${row.keyword}”`);
    notChecked.push({ id: "ai-answers", area: "ai_answers", title: "No AI answers checked for it yet",
      detail: `None of Folio’s ${input.index.publishedQuestions === null ? "" : `${plural(input.index.publishedQuestions, "published answer")} `}names ${domain}, but none of those questions is about what it does${examples.length ? ` (its Google searches include ${quoteList(examples)})` : ""}. That is unmeasured, not absent. No saved question for it has a completed answer either.`,
      nextStep: `Add 5–10 questions people ask before choosing a product like it${examples.length ? " (its Google searches are a good start)" : ""} and run them. Each run is a paid step someone starts.`,
      link: owner ? { label: "Add questions", url: `/benchmarks?website=${encodeURIComponent(siteId)}` } : null });
  }
  const { crawl } = input;
  if (crawl.state === "not_in_index")
    notChecked.push({ id: "crawl", area: "coverage", title: "Folio hasn’t read this website yet",
      detail: "Agents can’t compare AI answers with its pages until Folio has read them.", nextStep: "Treat its page content as unknown for now.", link: null });
  else if (crawl.state === "in_index" && crawl.inventoryPages && crawl.pagesCrawled !== null && crawl.pagesCrawled < crawl.inventoryPages * 0.25)
    notChecked.push({ id: "crawl", area: "coverage", title: `Folio has read ${plural(crawl.pagesCrawled, "page")} of ${formatCount(crawl.inventoryPages)}`,
      detail: `Its sitemaps list ${plural(crawl.inventoryPages, "page")}. Agents can only check answers against the pages Folio has read; the rest is unchecked.`,
      nextStep: "Search what Folio has read with folio_index_pages, and treat other pages as unknown.", link: null });

  const order = { high: 0, medium: 1, low: 2 };
  gaps.sort((a, b) => order[a.severity] - order[b.severity]);

  // One plain-English sentence per source.
  const sentences: string[] = [];
  if (rows.length && brandHeavy && nearPageOne.length)
    sentences.push(`Google sends ${domain} most of its search visits through searches for its own name, and it’s on page 2 or 3 for big searches like “${nearPageOne[0].keyword}” (#${nearPageOne[0].position}).`);
  else if (rows.length && nearPageOne.length) sentences.push(`${domain} is just off Google’s first page for big searches like “${nearPageOne[0].keyword}” (#${nearPageOne[0].position}).`);
  else if (search.rankingKeywords.state === "value" && (search.rankingKeywords.value ?? 0) > 0) sentences.push(`Google shows ${domain} in ${plural(search.rankingKeywords.value!, "US search", "US searches")}.`);
  else if (search.rankingKeywords.state === "none" && !rows.length) sentences.push(`Google doesn’t show ${domain} for any US search yet.`);
  if (refs.state === "value" && refs.value! >= 10) sentences.push(`${formatCount(refs.value!)} websites link to it.`);
  else if (refs.state === "value" && refs.value! > 0) sentences.push(`Only ${plural(refs.value!, "website")} link${refs.value === 1 ? "s" : ""} to it.`);
  else if (refs.state === "value" || refs.state === "none") sentences.push("No other website links to it yet.");
  if (input.index.namedIn > 0) sentences.push(`Folio’s published AI answers name it in ${input.index.namedIn} of ${plural(input.index.publishedQuestions ?? 0, "answer")}.`);
  else if (relatedPublished.length) sentences.push(`No AI answer in Folio’s index names it, including ${plural(relatedPublished.length, "answer")} on its topics.`);
  else if (waiting > 0) sentences.push(`Folio’s index has ${plural(waiting, "question")} that mention it, but none has been answered yet, so its place in AI answers is still unmeasured.`);
  else if (input.index.available) sentences.push("No AI answer in Folio’s index names it yet, and none of the indexed questions is about what it does.");

  const googleCheck = checkAgainstGoogle(search, owner ? input.searchConsole ?? null : undefined);
  return { website: { id: input.website.id, name: input.website.name, url: input.website.url, domain, ...access }, generatedAt: input.now.toISOString(), summary: sentences.join(" ") || `Folio has no usable saved data about ${domain} yet.`,
    search, google, aiAnswers, crawl: { state: crawl.state, pagesCrawled: crawl.pagesCrawled, inventoryPages: crawl.inventoryPages, lastFetchedAt: crawl.lastFetchedAt, topSections: crawl.topSections.slice(0, 6) },
    gaps, notChecked, sources: dataSources(search, google, input.index.available, crawl, googleCheck), googleCheck, howToRead: WEBSITE_GAPS_HOW_TO_READ };
}

const utcDay = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
const roughly = (ratio: number) => ratio < 10 ? String(Math.round(ratio * 10) / 10) : formatCount(Number(ratio.toPrecision(2)));

/**
 * The visits estimate next to Google's own count, when the owner has imported Search Console for the whole domain.
 * `searchConsole` undefined means the reader isn't the owner, who alone sees their Google data.
 */
function checkAgainstGoogle(search: WebsiteSearchSummary, searchConsole: WebsiteGapsInput["searchConsole"] | undefined): GoogleCheck {
  const visits = search.estimatedMonthlyVisits;
  const estimate = visits.state === "value" ? { monthlyVisits: visits.value!, fetchedAt: search.fetchedAt } : visits.state === "none" ? { monthlyVisits: 0, fetchedAt: search.fetchedAt } : null;
  const base = { estimate, ratio: null, caveat: ESTIMATE_CAVEAT };
  if (searchConsole === undefined) return { ...base, state: "owner_only", searchConsole: null,
    finding: "Only the website’s owner sees Google’s own numbers for it. The search visits here are a third-party estimate." };
  const counted = searchConsole?.unitedStatesTotals ? { scope: "united_states" as const, clicks: searchConsole.unitedStatesTotals.clicks }
    : searchConsole?.totals ? { scope: "all_countries" as const, clicks: searchConsole.totals.clicks } : null;
  const days = searchConsole ? Math.round((Date.parse(searchConsole.endDate) - Date.parse(searchConsole.startDate)) / 86_400_000) + 1 : 0;
  const google = searchConsole && counted && days > 0 ? { reportId: searchConsole.reportId, property: searchConsole.property, startDate: searchConsole.startDate, endDate: searchConsole.endDate,
    ...counted, monthlyClicks: Math.round(counted.clicks * 30 / days) } : null;
  if (!google) return { ...base, state: estimate ? "estimate_only" : "neither", searchConsole: null,
    finding: estimate ? "The search visits here are a third-party estimate. Import this website’s Google Search Console property to see Google’s own count of clicks next to it."
      : "Folio has neither Google’s own count nor an estimate of this website’s search visits yet." };
  const where = google.scope === "united_states" ? "US searches" : "searches in all countries";
  const counts = `Google counted ${plural(google.clicks, "click")} from ${where} in the ${days} days to ${utcDay(google.endDate)} (about ${formatCount(google.monthlyClicks)} a month).`;
  if (!estimate) return { ...base, state: "google_only", searchConsole: google, finding: `${counts} No third-party estimate is saved to compare with it.` };
  const ratio = estimate.monthlyVisits > 0 ? google.monthlyClicks / estimate.monthlyVisits : null;
  const estimated = estimate.monthlyVisits === 0 ? "The third-party source had no search data for it at all."
    : `The third-party estimate is ${estimate.monthlyVisits < 1 ? "under 1" : formatCount(Math.round(estimate.monthlyVisits))} a month${
      google.monthlyClicks === 0 ? ", but Google counted no clicks."
        : ratio! >= 2 ? `: Google’s own count is about ${roughly(ratio!)} times higher.`
        : ratio! <= 0.5 ? `: about ${roughly(1 / ratio!)} times Google’s own count.`
        : `, ${Math.abs(Math.round(100 * (estimate.monthlyVisits - google.monthlyClicks) / google.monthlyClicks))}% ${estimate.monthlyVisits >= google.monthlyClicks ? "above" : "below"} Google’s own count.`}`;
  const scope = google.scope === "all_countries" ? " The estimate covers US searches only, so part of the difference is searches from other countries; importing Search Console again records US clicks to compare like with like." : "";
  const apart = estimate.fetchedAt ? Math.round(Math.abs(Date.parse(estimate.fetchedAt) - Date.parse(google.endDate)) / 86_400_000) : 0;
  return { ...base, state: "compared", searchConsole: google, ratio: ratio === null ? null : Math.round(ratio * 1000) / 1000,
    finding: `${counts} ${estimated}${scope}${apart > 45 ? ` The two were measured ${apart} days apart.` : ""}` };
}

/** One line per kind of number shown, in the order the report shows them. */
function dataSources(search: WebsiteSearchSummary, google: WebsiteGapsReport["google"], index: boolean, crawl: WebsiteGapsInput["crawl"], check: GoogleCheck): DataSource[] {
  const sources: DataSource[] = [];
  if (check.searchConsole) sources.push({ id: "search_console", label: "Clicks from Google", provider: "Google Search Console", kind: "google", asOf: check.searchConsole.endDate,
    detail: "Google’s own count of clicks and impressions for this property, imported from the owner’s Search Console account." });
  if (google.state === "tracked") sources.push(
    { id: "google_positions", label: "Google positions", provider: "Search data provider", kind: "third_party", asOf: google.capturedAt,
      detail: "A third-party provider’s record of Google’s US results for each search on the day it checked. Positions move daily, so a check on another day, or by another tool, can differ." },
    { id: "search_volumes", label: "Searches a month", provider: "Search data provider", kind: "estimate", asOf: google.capturedAt,
      detail: "A third-party provider’s estimate of monthly US searches for each phrase. Every tool estimates these; only Google has the exact counts." });
  const has = (measure: Measure) => measure.state !== "missing";
  if (search.state === "measured" && (has(search.estimatedMonthlyVisits) || has(search.rankingKeywords)))
    sources.push({ id: "visits_estimate", label: "Search visits and ranking searches", provider: "Search data provider", kind: "estimate", asOf: search.fetchedAt,
      detail: "Estimated from searches a month and the share of clicks expected at each position, summed over the US searches it ranks for." });
  if (search.state === "measured" && (has(search.backlinks) || has(search.referringDomains)))
    sources.push({ id: "backlinks", label: "Links and linking websites", provider: "Link data provider", kind: "third_party", asOf: search.fetchedAt,
      detail: "Counted from a third-party provider’s crawl of the web. Each tool’s crawler finds a different share of the web, so link counts differ between tools." });
  if (index) sources.push({ id: "ai_answers", label: "AI answers", provider: "Folio", kind: "folio", asOf: null,
    detail: "Folio asks AI models buyer questions with web search on and saves each full answer with its citations, so every answer counted here can be opened and checked." });
  if (crawl.state === "in_index") sources.push({ id: "crawl", label: "Pages read", provider: "Folio", kind: "folio", asOf: crawl.lastFetchedAt,
    detail: "Pages Folio’s own crawler fetched from the website, counted against the pages its sitemaps list." });
  return sources;
}

const MISSING: Measure = { state: "missing", value: null };
const nonNegative = (value: unknown): number | null => { const number = Number(value); return value === null || value === undefined || value === "" || !Number.isFinite(number) || number < 0 ? null : number; };
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function measure(part: Record<string, unknown> | null, field: string): Measure {
  if (part?.status === "empty") return { state: "none", value: null };
  const value = part?.status === "success" ? nonNegative(record(part.data)?.[field]) : null;
  return value === null ? MISSING : { state: "value", value };
}
/** Latest saved lookup with any data; a newer lookup that returned nothing does not hide an older one. */
async function savedSearch(db: D1Database, ownerId: string, domain: string): Promise<WebsiteSearchSummary> {
  const empty: WebsiteSearchSummary = { state: "not_measured", reportId: null, fetchedAt: null, backlinks: MISSING, referringDomains: MISSING, brokenBacklinks: null, rankingKeywords: MISSING, estimatedMonthlyVisits: MISSING };
  const reports = (await listOwnedSeoReports(db, ownerId)).filter(report => report.state === "complete" && report.domain.toLowerCase().replace(/^www\./, "") === domain)
    .sort((a, b) => Date.parse(b.retrievedAt ?? b.createdAt) - Date.parse(a.retrievedAt ?? a.createdAt)).slice(0, 3);
  for (const summary of reports) {
    const result = record((await getOwnedSeoReport(db, ownerId, summary.id))?.result);
    const organic = record(result?.organic), backlinks = record(result?.backlinks);
    const values = { backlinks: measure(backlinks, "backlinks"), referringDomains: measure(backlinks, "referringDomains"),
      rankingKeywords: measure(organic, "organicKeywords"), estimatedMonthlyVisits: measure(organic, "estimatedMonthlyTraffic") };
    if (Object.values(values).some(item => item.state !== "missing"))
      return { state: "measured", reportId: summary.id, fetchedAt: typeof result?.fetchedAt === "string" ? result.fetchedAt : summary.retrievedAt ?? summary.createdAt,
        ...values, brokenBacklinks: backlinks?.status === "success" ? nonNegative(record(backlinks.data)?.brokenBacklinks) : null };
  }
  return reports.length ? { ...empty, state: "failed", reportId: reports[0].id, fetchedAt: reports[0].retrievedAt ?? reports[0].createdAt } : empty;
}
/** Latest recorded US Google positions from Folio's research data (Postgres `research` schema). */
async function googleRankings(db: D1Database, domain: string): Promise<WebsiteGapsInput["rankings"]> {
  try {
    const { results } = await db.prepare(`SELECT keyword, position, search_volume, estimated_traffic, landing_page, captured_at FROM research.rankings_latest
      WHERE domain IN (?, ?) ORDER BY estimated_traffic DESC NULLS LAST, search_volume DESC NULLS LAST, keyword LIMIT 50`)
      .bind(domain, registrableDomain(domain)).all<{ keyword: string; position: unknown; search_volume: unknown; estimated_traffic: unknown; landing_page: string | null; captured_at: unknown }>();
    return { available: true, rows: results.flatMap(row => {
      const position = nonNegative(row.position);
      if (typeof row.keyword !== "string" || position === null) return [];
      const captured = row.captured_at instanceof Date ? row.captured_at : row.captured_at ? new Date(String(row.captured_at)) : null;
      return [{ keyword: row.keyword.slice(0, 200), position, searchVolume: nonNegative(row.search_volume), estimatedTraffic: nonNegative(row.estimated_traffic),
        landingPage: typeof row.landing_page === "string" && /^https:\/\//.test(row.landing_page) ? row.landing_page.slice(0, 2000) : null,
        capturedAt: captured && Number.isFinite(captured.getTime()) ? captured.toISOString() : null }];
    }) };
  } catch { return { available: false, rows: [] }; }
}

/** The owner's newest Search Console snapshot for the whole domain: a domain property, or a URL-prefix property at its root. */
async function domainSearchConsole(db: D1Database, ownerId: string, domain: string): Promise<WebsiteGapsInput["searchConsole"]> {
  const covers = (property: string) => {
    if (property.startsWith("sc-domain:")) return property.slice(10).toLowerCase().replace(/^www\./, "") === domain;
    try { const url = new URL(property); return url.pathname === "/" && url.hostname.toLowerCase().replace(/^www\./, "") === domain; } catch { return false; }
  };
  const match = (await listSavedSearchConsoleReports(db, ownerId)).filter(report => covers(report.property) && (report.totals || report.unitedStatesTotals))
    .sort((a, b) => b.endDate.localeCompare(a.endDate) || Number(b.property.startsWith("sc-domain:")) - Number(a.property.startsWith("sc-domain:")))[0];
  return match ? { reportId: match.id, property: match.property, startDate: match.startDate, endDate: match.endDate, totals: match.totals, unitedStatesTotals: match.unitedStatesTotals ?? null } : null;
}

/**
 * For a website the reader owns or that is shared with one of their organizations. A shared
 * website shows the saved reports of the member who saved it. Reads only; never spends.
 */
export async function loadWebsiteGaps(db: D1Database, readerId: string, websiteId: string, now = new Date(), allowed: string[] | null = null): Promise<WebsiteGapsReport> {
  if (!readerId) throw new AgentApiError("Authentication required.", 401, "unauthorized");
  const readable = await readableWebsite(db, readerId, websiteId, allowed);
  if (!readable) throw new AgentApiError("Website not found. List your websites with folio_targets, or shared ones with folio_organizations.", 404, "not_found");
  const { site, ownerId } = readable, domain = hostOf(site.url);
  // Independent reads, a few at a time: each in-flight query can hold one of the database's few connections,
  // so the limit comes from the connection budget in read-plan.json (proved to fit in proofs/Folio/ReadPlan.lean).
  const [search, rankings, published, crawl, yourQuestions, searchConsole] = await withLimit(READ_PLAN.readLimit, [
    () => savedSearch(db, ownerId, domain).catch(() => null),
    () => googleRankings(db, domain),
    () => publishedIndex(db).catch(() => null),
    () => crawlWebsite(db, domain),
    () => savedVisibility(db, ownerId, visibilityFilters(new URLSearchParams({ websiteId: site.id })))
      .then(report => ({ completed: report.current.completedQuestions, named: report.current.mentionedQuestions })).catch(() => null),
    // Google's own numbers are the owner's: a teammate reading a shared website doesn't get them.
    () => readable.access === "owner" ? domainSearchConsole(db, ownerId, domain).catch(() => null) : Promise.resolve(undefined),
  ] as const);
  let index: WebsiteGapsInput["index"] = { available: false, source: null, publishedQuestions: null, namedIn: 0, citedIn: 0, bestPosition: null, answers: [], questions: [] };
  if (published) {
    try {
      const found = indexWebsite(published.data, { domain, limit: 5 }, published.source);
      index = { available: true, source: published.source, publishedQuestions: found.publishedQuestions, namedIn: found.namedIn, citedIn: found.citedIn, bestPosition: found.bestPosition,
        answers: found.answers.items.map(item => ({ queryId: item.queryId, query: item.query, category: item.category, position: item.position, cited: item.cited, page: item.page })),
        questions: published.data.queries.map(query => ({ queryId: query.id, query: query.query, category: query.category, published: query.resultStatus === "published" && Boolean(query.latestObservation),
          page: `/overview?query=${encodeURIComponent(query.id)}${query.latestObservation ? `&model=${encodeURIComponent(query.latestObservation.model)}` : ""}` })) };
    } catch { /* A private or unusual host cannot be matched against the public index. */ }
  }
  return buildWebsiteGaps({ website: { ...site, access: readable.access, organizations: readable.organizations }, now, rankings, index, yourQuestions, searchConsole,
    search: search ?? { state: "not_measured", reportId: null, fetchedAt: null, backlinks: MISSING, referringDomains: MISSING, brokenBacklinks: null, rankingKeywords: MISSING, estimatedMonthlyVisits: MISSING },
    crawl: { state: crawl.available ? crawl.state === "in_index" ? "in_index" : "not_in_index" : "unavailable", pagesCrawled: crawl.pagesCrawled, inventoryPages: crawl.profile?.inventoryPages ?? null,
      lastFetchedAt: crawl.lastFetchedAt, profileName: crawl.profile?.name ?? null, topSections: crawl.topSections.map(item => ({ path: item.path, pages: item.pages })) } });
}
