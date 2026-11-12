import { selectValue } from "./select-helpers";
import { expect, test, type Page } from "@playwright/test";

const at = "2026-11-11T05:10:00.000Z";
const sites = [
  { id: "site-manus", name: "manus.im", url: "https://manus.im/", createdAt: at, isPublic: false, seoScore: null, lastScannedAt: null },
  { id: "site-folio", name: "usefolio.site", url: "https://usefolio.site/", createdAt: at, isPublic: false, seoScore: null, lastScannedAt: null },
];
const value = (n: number) => ({ state: "value", value: n }), none = { state: "none", value: null };
const search = (keyword: string, position: number, band: string, searchVolume: number, landingPage: string, brand = false) =>
  ({ keyword, position, band, searchVolume, estimatedTraffic: 100, landingPage: `https://manus.im${landingPage}`, brand });
// Illustrative report in the shape folio_website_gaps returns, modelled on saved manus.im data.
const manus = {
  website: { id: "site-manus", name: "manus.im", url: "https://manus.im/", domain: "manus.im" }, generatedAt: at,
  summary: "Google sends manus.im most of its search visits through searches for its own name, and it’s on page 2 or 3 for big searches like “ai image generator” (#20). 14,634 websites link to it. Folio’s index has 100 questions that mention it, but none has been answered yet, so its place in AI answers is still unmeasured.",
  search: { state: "measured", reportId: "seo", fetchedAt: at, backlinks: value(1474900), referringDomains: value(14634), brokenBacklinks: 1099, rankingKeywords: value(10584), estimatedMonthlyVisits: value(62748) },
  google: { state: "tracked", capturedAt: "2026-11-07T03:08:49.653Z", tracked: 50, bands: { top3: 2, page1: 5, page2: 9, deeper: 34 }, brandTerms: ["manus"], brandTrafficShare: 0.649,
    searches: [search("manus", 1, "top3", 110000, "/", true), search("manus ai", 1, "top3", 90500, "/", true), search("ai image generator", 20, "page2", 823000, "/tools/ai-image-generator"),
      search("ai video generator", 22, "deeper", 246000, "/playbook/video-generator"), ...Array.from({ length: 6 }, (_, i) => search(`extra search ${i}`, 30 + i, "deeper", 1000, "/x"))] },
  aiAnswers: { source: "live-published-data", publishedQuestions: 291, namedIn: 0, citedIn: 0, bestPosition: null, answers: [],
    related: { total: 100, published: 0, matchedTerms: ["manus"], categories: [{ category: "AI assistants", total: 100, published: 0 }], items: [{ queryId: "ai-assistants-v1", query: "How should I compare ChatGPT, Claude and Manus?", category: "AI assistants", published: false, page: "/overview?query=ai-assistants-v1" }] },
    yourQuestions: { completed: 0, named: 0 } },
  crawl: { state: "in_index", pagesCrawled: 31, inventoryPages: 3970, lastFetchedAt: "2026-11-07T15:57:58.118Z", topSections: [{ path: "/ar", pages: 427 }, { path: "/de", pages: 427 }] },
  gaps: [
    { id: "google-near-page-one", area: "google", severity: "high", title: "Just off page one for big searches", finding: "Google shows manus.im on page 2 or 3 for “ai image generator” (823K searches a month, #20).", nextStep: "Strengthen the pages Google already picks for these searches.", evidence: [{ label: "/tools/ai-image-generator · “ai image generator” #20", url: "https://manus.im/tools/ai-image-generator" }] },
    { id: "google-brand-dependence", area: "google", severity: "medium", title: "Most Google visits come from its own name", finding: "65% of the estimated visits come from people already searching for “manus”.", nextStep: "Grow pages for tasks people search for.", evidence: [] },
    { id: "links-broken", area: "links", severity: "medium", title: "1,099 links point at broken pages", finding: "Other websites link to pages that no longer load.", nextStep: "Redirect each broken URL.", evidence: [] },
  ],
  notChecked: [{ id: "ai-answers", area: "ai_answers", title: "100 questions about it are waiting for answers", detail: "None has a published answer yet. That is unmeasured, not absent.", nextStep: "Collect answers for those questions.", link: { label: "See the questions", url: "/overview?query=ai-assistants-v1" } }],
  sources: [
    { id: "search_console", label: "Clicks from Google", provider: "Google Search Console", kind: "google", asOf: "2026-11-08", detail: "Google’s own count of clicks and impressions for this property." },
    { id: "visits_estimate", label: "Search visits and ranking searches", provider: "Search data provider", kind: "estimate", asOf: at, detail: "Estimated from searches a month and the share of clicks expected at each position." },
  ],
  googleCheck: { state: "compared", searchConsole: { reportId: "gsc", property: "sc-domain:manus.im", startDate: "2026-10-12", endDate: "2026-11-08", scope: "united_states", clicks: 50000, monthlyClicks: 53571 },
    estimate: { monthlyVisits: 62748, fetchedAt: at }, ratio: 0.854, finding: "Google counted 50,000 clicks from US searches in the 28 days to Nov 8, 2026 (about 53,571 a month). The third-party estimate is 62,748 a month, 17% above Google’s own count.",
    caveat: { text: "Search visits are an estimate. Ahrefs reports a median difference of 50% from Google Search Console.", sourceUrl: "https://ahrefs.com/blog/traffic-estimations-accuracy/" } },
  howToRead: "Built from saved data only.",
};
const folio = { ...manus, website: { id: "site-folio", name: "usefolio.site", url: "https://usefolio.site/", domain: "usefolio.site" },
  summary: "Google doesn’t show usefolio.site for any US search yet. Only 3 websites link to it.",
  search: { ...manus.search, rankingKeywords: none, estimatedMonthlyVisits: none, referringDomains: value(3), backlinks: value(3), brokenBacklinks: 0 },
  google: { ...manus.google, state: "none_tracked", tracked: 0, capturedAt: null, bands: { top3: 0, page1: 0, page2: 0, deeper: 0 }, brandTrafficShare: null, searches: [] },
  aiAnswers: { ...manus.aiAnswers, related: { total: 0, published: 0, matchedTerms: [], categories: [], items: [] } },
  crawl: { state: "not_in_index", pagesCrawled: 0, inventoryPages: null, lastFetchedAt: null, topSections: [] },
  gaps: [{ id: "links-few", area: "links", severity: "high", title: "Only 3 websites link to it", finding: "Links matter.", nextStep: "Get listed.", evidence: [] }], notChecked: [], sources: [],
  googleCheck: { ...manus.googleCheck, state: "estimate_only", searchConsole: null, estimate: { monthlyVisits: 0, fetchedAt: at }, ratio: null,
    finding: "The search visits here are a third-party estimate. Import this website’s Google Search Console property to see Google’s own count of clicks next to it." } };

async function setup(page: Page, options: { failVisibility?: boolean } = {}) {
  const state = { mutations: 0, reads: [] as string[] };
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname, method = route.request().method();
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: { user: { id: "owner", name: "Owner", email: "owner@example.test", emailVerified: true }, session: { id: "s", userId: "owner", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (method !== "GET") { state.mutations++; return route.fulfill({ status: 403, json: { error: "Unplanned mutations are blocked in browser fixtures." } }); }
    const visibility = pathname.match(/^\/api\/sites\/([^/]+)\/visibility$/);
    if (visibility) { state.reads.push(visibility[1]); return options.failVisibility ? route.fulfill({ status: 503, json: { error: { code: "unavailable" } } }) : route.fulfill({ json: { report: visibility[1] === "site-folio" ? folio : manus } }); }
    if (pathname === "/api/sites") return route.fulfill({ json: { sites } });
    if (pathname === "/api/seo-data") return route.fulfill({ json: { configured: true, authorized: true } });
    if (pathname === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    if (pathname === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (pathname === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (pathname === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, status: "disconnected", model: "gpt-6-luna", message: "Fixture" } });
    if (pathname === "/api/search-console/status") return route.fulfill({ json: { configured: false, connected: false } });
    if (pathname === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ json: {} });
  });
  return state;
}

test("a website shows where it comes up, what it's missing and what hasn't been checked, without starting work", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/websites");
  const panel = page.getByRole("region", { name: "Where manus.im shows up" });
  await expect(panel).toContainText("most of its search visits through searches for its own name");
  const google = panel.getByRole("region", { name: "Google search" });
  await expect(google).toContainText("50 searches tracked");
  await expect(google.getByRole("list", { name: "Searches that show it, by estimated visits" }).locator("li")).toHaveCount(7);
  await expect(google).toContainText("ai image generator");
  await expect(google).toContainText("823K/mo");
  await expect(google.locator(".wv-position").filter({ hasText: "#20" })).toHaveClass(/is-page2/);
  await google.getByRole("button", { name: "Show the top 10" }).click();
  await expect(google.getByRole("list", { name: "Searches that show it, by estimated visits" }).locator("li")).toHaveCount(10);
  const ai = panel.getByRole("region", { name: "AI answers" });
  await expect(ai).toContainText("100 indexed questions");
  await expect(ai).toContainText("None has been answered yet.");
  await expect(ai).toContainText("AI assistants0/100 answered");
  await expect(panel.getByRole("region", { name: "What Folio has read" })).toContainText("of 3,970 pages in its sitemaps");
  const gaps = panel.getByRole("region", { name: /What it’s missing/ });
  await expect(gaps.locator("[data-gap-id]")).toHaveCount(3);
  await expect(gaps.locator("[data-gap-id='google-near-page-one']")).toContainText("High priority");
  const evidence = gaps.getByRole("link", { name: /ai-image-generator/ });
  await expect(evidence).toHaveAttribute("href", "https://manus.im/tools/ai-image-generator");
  await expect(evidence).toHaveAttribute("target", "_blank");
  const unknowns = panel.getByRole("region", { name: "Not checked yet" });
  await expect(unknowns).toContainText("unmeasured, not absent");
  await expect(unknowns.getByRole("link", { name: "See the questions" })).toHaveAttribute("href", "/overview?query=ai-assistants-v1");
  await expect(panel).toContainText("folio_website_gaps");
  // Each number says where it comes from; the estimate sits beside Google's own count, with the published error rate.
  const sources = panel.getByRole("region", { name: "Where these numbers come from" });
  await expect(sources).toContainText("The estimate beside Google’s own count");
  await expect(sources.locator(".wv-check-bars")).toContainText("53,571/mo");
  await expect(sources.locator(".wv-check-bars")).toContainText("62,748/mo");
  await expect(sources.locator(".wv-check-bars")).toContainText("US clicks");
  await expect(sources.locator("[data-source-id='search_console']")).toContainText("Google’s own count");
  await expect(sources.locator("[data-source-id='visits_estimate']")).toContainText("Estimate");
  await expect(sources).not.toContainText("DataForSEO");
  await expect(sources.getByRole("link", { name: /Ahrefs’s study/ })).toHaveAttribute("href", "https://ahrefs.com/blog/traffic-estimations-accuracy/");
  expect(state.mutations).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("switching websites reads the other website's report; a failed read says so", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/websites");
  await expect(page.getByRole("region", { name: "Where manus.im shows up" })).toBeVisible();
  await selectValue(page.getByLabel("Selected website", { exact: true }), "site-folio");
  const panel = page.getByRole("region", { name: "Where usefolio.site shows up" });
  await expect(panel).toContainText("Google doesn’t show usefolio.site for any US search yet.");
  await expect(panel.getByRole("region", { name: "Google search" })).toContainText("Google doesn’t show it for any US search yet.");
  await expect(panel.getByRole("region", { name: "What Folio has read" })).toContainText("Folio hasn’t read this website yet.");
  await expect(panel).not.toContainText("ai image generator");
  // Without Search Console the visits figure is called an estimate, with the way to see Google's own count.
  const sources = panel.getByRole("region", { name: "Where these numbers come from" });
  await expect(sources).toContainText("third-party estimate");
  await expect(sources.getByRole("link", { name: "Import from Search Console" })).toHaveAttribute("href", "/search-console");
  expect(state.reads).toContain("site-folio");
  expect(state.mutations).toBe(0);

  const failing = await page.context().newPage();
  await setup(failing, { failVisibility: true });
  await failing.goto("/websites");
  await expect(failing.getByRole("region", { name: "Where this website shows up" }).getByRole("alert")).toContainText("couldn’t be loaded");
  await failing.close();
});
