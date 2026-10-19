import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const site = { id: "meaning-site", name: "Fixture business", url: "https://meaning-fixture.dev/" };
const other = "https://other-fixture.dev/";
const suite: KeywordBenchmarkSuite = { id: "meaning-suite", name: "Saved customer question", description: "Browser fixture only", createdAt: at,
  cases: [{ id: "meaning-question", suiteId: "meaning-suite", query: "Which service explains a codebase?", targetUrl: site.url, searchMode: "open-web", revision: 0,
    createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture" }] };
const scenarios = ["recommended-and-cited", "cited-only", "not-listed", "unknown", "no-citations"] as const;
type Scenario = typeof scenarios[number];
function result(scenario: Scenario): KeywordBenchmarkRun {
  const recommended = scenario === "recommended-and-cited" || scenario === "no-citations";
  const cited = scenario === "recommended-and-cited" || scenario === "cited-only";
  return { id: "meaning-run", suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "gpt-6-luna", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture",
    status: "completed", sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [],
    createdAt: at, updatedAt: at, revision: 1, usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null,
    answer: { text: "Fixture recorded answer. Read the returned sources before changing your website.",
      mentions: [{ name: recommended ? "Fixture business" : scenario === "unknown" ? "Unmatched business" : "Other fixture business",
        url: scenario === "unknown" ? null : recommended ? site.url : other,
        reason: "A returned explanation, not independently verified.", citationUrls: scenario === "no-citations" ? [] : [cited ? site.url : other] }],
      citations: scenario === "no-citations" ? [] : [{ url: scenario === "unknown" ? "unavailable-source" : cited ? site.url : other, title: "Fixture returned source", quote: "A recorded source excerpt." }],
      limitations: ["Illustrative fixture. Source support has not been independently verified."] } };
}
async function fixture(page: Page, scenario: Scenario) {
  const run = result(scenario);
  const state = { writes: [] as string[], reads: [] as string[] };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      state.writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409, json: { error: "Fixture prohibits all writes and paid starts" } });
    }
    state.reads.push(path);
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "meaning-owner", email: "fixture@example.test", name: "Fixture owner", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "meaning-session", userId: "meaning-owner", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: [site] } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: [{ ...suite, cases: undefined, caseCount: 1 }], templates: [],
      access: { configured: true, authorized: true, canRun: true, maxRunsPerDay: 3, maxActiveRuns: 1 },
      usage: { attemptsLast24Hours: 1, remainingRuns: 2, activeRuns: 0, remainingActiveRuns: 1 } } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") return route.fulfill({ json: { runs: [{ ...run, answer: undefined, answerCharacters: run.answer!.text.length,
      mentionCount: run.answer!.mentions.length, citationCount: run.answer!.citations.length }] } });
    if (path === `/api/benchmarks/runs/${run.id}`) return route.fulfill({ json: { run } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/onboarding") return route.fulfill({ json: { profile: null } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    return route.fulfill({ status: 404, json: { error: "Fixture has no other API" } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  await page.context().route("https://meaning-fixture.dev/**", route => route.fulfill({ contentType: "text/html", body: "<title>Fixture page</title><h1>Fixture page</h1>" }));
  await page.context().route("https://other-fixture.dev/**", route => route.fulfill({ contentType: "text/html", body: "<title>Fixture source</title><h1>Fixture source</h1>" }));
  return state;
}
const href = `/evaluations?view=search&suite=${suite.id}&run=meaning-run&website=${site.id}`;
const report = (page: Page) => page.getByRole("region", { name: "Keyword observation", exact: true });

for (const scenario of scenarios) test(`guided result explains ${scenario} without spending on the next action`, async ({ page }, info) => {
  const state = await fixture(page, scenario);
  await page.goto(href);
  const saved = report(page);
  await expect(saved).toBeVisible();
  const meaning = saved.getByRole("region", { name: "What this answer means", exact: true });
  const expectedHeading = scenario === "recommended-and-cited" || scenario === "no-citations" ? "Your site was recommended in this answer"
    : scenario === "cited-only" ? "Your site was cited, but wasn’t recommended"
    : scenario === "unknown" ? "Your site’s recommendation status is unclear" : "Your site wasn’t listed as a recommendation";
  await expect(meaning.getByRole("heading", { name: expectedHeading, exact: true })).toBeVisible();
  await expect(meaning).toContainText("It does not measure Google rank, website quality, or visibility in consumer chat apps.");
  await expect(meaning.getByRole("heading", { name: "What to do next", exact: true })).toBeVisible();
  await expect(meaning).toContainText("Opening this link does not start another paid run.");
  if (scenario === "unknown") await expect(meaning).toContainText("An unknown match does not mean your site was absent.");
  if (scenario === "cited-only") await expect(meaning).toContainText("A source citation is separate from a recommendation.");
  if (scenario === "no-citations" || scenario === "unknown") await expect(meaning).toContainText("No valid source links were recorded.");
  const next = meaning.getByRole("link", { name: scenario === "recommended-and-cited" ? "Review a returned source" : "Review your page", exact: false });
  await expect(next).toHaveAttribute("href", site.url);
  const answer = saved.getByRole("region", { name: "Recorded answer", exact: true });
  await expect(answer).toContainText("Fixture recorded answer.");
  await expect(answer.getByRole("heading", { name: "Answer to your question", exact: true })).toBeVisible();
  const presence = saved.getByRole("region", { name: "Target presence", exact: true });
  await expect(presence).toContainText(scenario === "unknown" ? "Unknown" : scenario === "recommended-and-cited" || scenario === "no-citations" ? "Yes" : "Not listed");
  const sources = saved.getByRole("complementary", { name: "Returned citations", exact: true });
  if (scenario === "no-citations") await expect(sources).toContainText("No citations were returned");
  else if (scenario !== "unknown") await expect(sources.getByRole("link", { name: "Fixture returned source", exact: false })).toHaveAttribute("href", scenario === "recommended-and-cited" || scenario === "cited-only" ? site.url : other);
  await page.screenshot({ path: info.outputPath(`${scenario}.png`), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const popup = page.waitForEvent("popup");
  await next.focus(); await page.keyboard.press("Enter");
  const sourcePage = await popup;
  await expect(sourcePage).toHaveURL(site.url); await sourcePage.close();
  await expect(saved.getByRole("button", { name: "Download private observation", exact: true })).not.toBeVisible();
  await saved.getByRole("button", { name: "Prepare another observation", exact: true }).click();
  await expect(page.getByText("Questions and run settings", { exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("completed report keeps consistent content insets at320,390 and1440 pixels including scrolled sections", async ({ page }, info) => {
  const state = await fixture(page, "recommended-and-cited");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(href);
    const saved = report(page); await expect(saved).toBeVisible();
    // Content anchors, rather than section border boxes, reveal flush-edge regressions.
    const anchors = [
      saved.locator(".benchmark-report-heading h2"),
      saved.locator(".benchmark-guided-status"),
      saved.getByRole("region", { name: "What this answer means", exact: true }).getByRole("heading", { level: 3 }),
      saved.getByRole("region", { name: "What this answer means", exact: true }).getByRole("heading", { name: "What to do next", exact: true }),
      saved.getByRole("region", { name: "Recorded answer", exact: true }).getByRole("heading"),
      saved.getByRole("region", { name: "Target presence", exact: true }).getByRole("heading"),
      saved.getByRole("region", { name: "Returned recommendations", exact: true }).getByRole("heading"),
      saved.getByRole("complementary", { name: "Returned citations", exact: true }).getByRole("heading"),
      saved.getByRole("button", { name: "Prepare another observation", exact: true }),
      saved.getByText("Run details", { exact: true }),
    ];
    const bounds = await saved.boundingBox(); expect(bounds).not.toBeNull();
    let expectedInset: number | null = null;
    for (const anchor of anchors) {
      await anchor.scrollIntoViewIfNeeded();
      const box = await anchor.evaluate(element => {
        const rect = element.getBoundingClientRect();
        // This paragraph owns the gutter padding; measure its text, not its outer border box.
        if (element.classList.contains("benchmark-guided-status")) {
          const range = document.createRange(); range.selectNodeContents(element);
          const text = range.getBoundingClientRect();
          return { x: text.x, width: text.width };
        }
        return { x: rect.x, width: rect.width };
      });
      const inset = box!.x - bounds!.x;
      expect(inset).toBeGreaterThanOrEqual(width <= 390 ? 15 : 23);
      if (expectedInset === null) expectedInset = inset;
      expect(Math.abs(inset - expectedInset)).toBeLessThanOrEqual(2);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width - (width <= 390 ? 15 : 23));
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`report-insets-${width}.png`), fullPage: true, animations: "disabled" });
  }
  expect(state.writes).toEqual([]);
});
