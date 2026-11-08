import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

// ILLUSTRATIVE BROWSER FIXTURE: every API is intercepted; no account, provider or D1 data is read.
const site = { id: "site-example", name: "Example fixture", url: "https://example-fixture.dev/" };
const base = Date.parse("2026-11-06T08:00:00.000Z");
const iso = (daysAgo: number, hour = 0) => new Date(base - daysAgo * 86_400_000 + hour * 3_600_000).toISOString();
const queries = ["Which tool explains a codebase?", "Best code search for monorepos", "How do I map service dependencies?", "Tools to find function callers", "Codebase onboarding for new engineers", "Open source code intelligence tools"];
const suite: KeywordBenchmarkSuite = { id: "suite-viz", name: "Fixture questions", description: "Browser fixture only", createdAt: iso(80),
  cases: queries.map((query, index) => ({ id: `q-${index}`, query, targetUrl: site.url, searchMode: "open-web" as const, suiteId: "suite-viz", revision: 0,
    createdAt: iso(80), updatedAt: iso(80), language: "en", locale: "US", rubricVersion: "fixture" })) };
const sources = ["https://docs.alpha-fixture.dev/a", "https://beta-fixture.dev/b", "https://gamma-fixture.dev/c", "https://alpha-fixture.dev/d"];
function run(id: string, index: number, daysAgo: number, present: boolean | null, status: KeywordBenchmarkRun["status"] = "completed"): KeywordBenchmarkRun {
  const item = suite.cases[index]; const time = iso(daysAgo, index);
  const cites = [sources[index % 4], sources[(index + 1) % 4], ...(present ? [item.targetUrl!] : [])];
  return { id, suiteId: suite.id, caseId: item.id, case: item, kind: "baseline", baselineRunId: null, surface: "openai-managed-agents", publication: "private",
    model: "fixture-model", harnessVersion: "fixture-harness", environmentType: "none", environmentFingerprint: "fixture-settings", status,
    sessionId: "fixture-session", createAttemptAt: time, deadlineAt: time, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [],
    createdAt: time, updatedAt: time, revision: 1,
    answer: status !== "completed" ? null : { text: "Fixture answer", mentions: [{ name: "Other fixture", url: "https://beta-fixture.dev/" },
      ...(present === null ? [{ name: "Unlinked fixture", url: "" }] : present ? [{ name: "Target fixture", url: item.targetUrl! }] : [])],
      citations: cites.map(url => ({ url, title: "Fixture source" })), limitations: ["Illustrative test data"] },
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null };
}
const runs: KeywordBenchmarkRun[] = [
  run("r0", 0, 1, true), run("r1", 1, 2, false), run("r2", 2, 3, true), run("r3", 3, 9, null),
  run("r4", 4, 0, null, "failed"), run("r4-old", 4, 12, false),
  ...Array.from({ length: 14 }, (_, i) => run(`h${i}`, i % 4, 14 + i * 4, i % 2 === 0)),
];
const scans = [[40, 61], [26, 66], [12, 72], [2, 69]].map(([daysAgo, seoScore], i) => ({ id: `scan-${i}`, url: site.url, createdAt: iso(daysAgo), seoScore, checks: [], patches: [], title: "Fixture", description: "Fixture", wordCount: 10 }));

async function fixture(page: Page, options: { failRuns?: boolean } = {}) {
  await page.clock.setFixedTime(new Date(base));
  await page.route("**/api/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path === "/api/auth/get-session") return route.fulfill({ json: { user: { id: "fixture", name: "Fixture owner", email: "owner@example.test", emailVerified: true, createdAt: iso(90), updatedAt: iso(90) }, session: { id: "s", userId: "fixture", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (req.method() !== "GET") return route.fulfill({ status: 409, json: { error: "Fixture prohibits writes" } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: [site] } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: [{ ...suite, cases: undefined, caseCount: suite.cases.length }] } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") {
      if (options.failRuns) return route.fulfill({ status: 503, json: { error: "Fixture failure" } });
      const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return route.fulfill({ json: { runs: sorted.map(({ answer, ...value }) => ({ ...value, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0, answerCharacters: 0 })), models: ["fixture-model"], nextCursor: null } });
    }
    if (path.startsWith("/api/benchmarks/runs/")) return route.fulfill({ json: { run: runs.find(item => path.endsWith(`/${item.id}`)) } });
    if (path === "/api/scans") return route.fulfill({ json: { scans } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "Unavailable in browser fixture" } });
  });
}

test("overview chart cards summarise saved records with text equivalents", async ({ page }, info) => {
  await fixture(page);
  await page.goto("/overview?view=workspace&website=site-example");
  const charts = page.getByRole("region", { name: "Overview charts" });
  const appearance = charts.getByRole("article", { name: "Answer appearance" });
  const summary = page.locator(".real-overview-metric-details");
  await expect(summary).not.toHaveAttribute("open");
  await expect(appearance).toBeVisible();
  await summary.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(summary.locator(".real-overview-metrics")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(summary).not.toHaveAttribute("open");
  await expect(appearance.locator(".ovc-total strong")).toHaveText("50%");
  await expect(appearance).toContainText("2 of 4 identified answers named your site.");
  await expect(appearance.getByRole("img", { name: /Named your site 2, Not named 2, Identity unknown 1/ })).toBeVisible();
  const coverage = charts.getByRole("article", { name: "Question coverage" });
  await expect(coverage.locator(".ovc-total strong")).toHaveText("4 / 6");
  await expect(coverage).toContainText("1 need review");
  await expect(coverage).toContainText("Not run");
  const sources = charts.getByRole("article", { name: "Most-cited sources" });
  await expect(sources.locator("li[data-target]")).toContainText("Your siteexample-fixture.dev");
  const activity = charts.getByRole("article", { name: "Search activity" });
  await expect(activity.getByRole("img")).toHaveAttribute("aria-label", /saved attempts on \d+ days over 12 weeks/);
  const readiness = charts.getByRole("article", { name: "Technical readiness" });
  await expect(readiness.locator(".ovc-total strong")).toHaveText("69/100");
  await expect(readiness).toContainText("▼ -3 vs previous");
  await expect(readiness).toContainText("Below 70");
  await expect(readiness.getByRole("slider", { name: "Technical readiness audits" })).toHaveAttribute("aria-valuetext", /^69 out of 100 on .+, audit 4 of 4$/);
  await expect(page.getByRole("link", { name: "Open search questions" })).toBeVisible();
  if (process.env.OVERVIEW_SHOTS) {
    await page.screenshot({ path: `${process.env.OVERVIEW_SHOTS}/overview-${info.project.name}.png`, fullPage: true });
    await charts.screenshot({ path: `${process.env.OVERVIEW_SHOTS}/charts-${info.project.name}.png` });
  }
});

test("overview chart cards show a truthful unavailable state when history fails", async ({ page }) => {
  await fixture(page, { failRuns: true });
  await page.goto("/overview?view=workspace&website=site-example");
  await expect(page.getByText("Saved keyword history could not be loaded. No search metrics are available.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Overview charts" })).toHaveCount(0);
});
