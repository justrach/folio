import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const site = { id: "site-next-step", name: "Private fixture business", url: "https://next-step.example/" };
const question = "Which service helps a small team understand a codebase?";
const suite: KeywordBenchmarkSuite = {
  id: "suite-next-step", name: "Reviewed customer questions", description: "Browser fixtures only", createdAt: at,
  cases: [
    { id: "question-unrelated", query: "An unrelated saved question", targetUrl: "https://other.example/", searchMode: "open-web" as const },
    { id: "question-next-step", query: question, targetUrl: site.url, searchMode: "open-web" as const },
  ].map(item => ({ ...item, suiteId: "suite-next-step", revision: 0, createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture" })),
};

async function fixture(page: Page) {
  const state = { sites: [site], suites: [suite], writes: [] as string[], failHistory: false, failReports: false };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      state.writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409, json: { error: "This fixture prohibits new work." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "next-step-owner", email: "fixture@example.test", name: "Fixture owner", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "next-step-session", userId: "next-step-owner", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: state.sites } });
    if (path === "/api/onboarding") return route.fulfill({ json: { profile: null } });
    if (path === "/api/benchmarks") return route.fulfill({ json: {
      suites: state.suites.map(value => ({ ...value, cases: undefined, caseCount: value.cases.length })), templates: [],
      access: { configured: false, authorized: false, canRun: false, maxRunsPerDay: 1, maxActiveRuns: 1 },
      usage: { attemptsLast24Hours: 0, remainingRuns: 1, activeRuns: 0, remainingActiveRuns: 1 },
    } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") return route.fulfill(state.failHistory
      ? { status: 503, json: { error: "Fixture history unavailable" } }
      : { json: { runs: [], models: [], nextCursor: null } });
    if (path === "/api/benchmarks/comparison") return route.fulfill({ json: { snapshots: [], failedReads: 0 } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture only" } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill(state.failReports
      ? { status: 503, json: { error: "Fixture reports unavailable" } } : { json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "No other API is enabled by this fixture" } });
  });
  await page.route("https://api.openai.com/**", route => route.abort("blockedbyclient"));
  return state;
}

const nextStep = (page: Page) => page.getByRole("region", { name: "Your next step", exact: true });

test("an empty workspace has one review step, preserving the exact owned question without starting work", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto(`/overview?view=workspace&website=${site.id}`);
  const next = nextStep(page);
  await expect(next).toBeVisible();
  const review = next.getByRole("link");
  await expect(review).toHaveCount(1);
  await expect(review).toHaveText("Review this question");
  await expect(review).toHaveAttribute("href", `/evaluations?view=search&suite=${suite.id}&case=question-next-step&website=${site.id}`);
  await expect(page.locator(".real-overview-metrics, .real-overview-history, .real-recommendations")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Separate website evidence", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Workspace evaluations", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("workspace-next-step.png"), fullPage: true, animations: "disabled" });
  await page.reload();
  await expect(nextStep(page)).toBeVisible();
  await nextStep(page).getByRole("link").click();
  await expect(page).toHaveURL(/\/evaluations\?.*view=search/);
  await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
  await expect(page.locator(".guided-run-question")).toHaveText(question);
  await page.reload();
  await expect(page.locator(".guided-run-question")).toHaveText(question);
  await page.goBack();
  await expect(nextStep(page)).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("without a website the workspace offers one setup action", async ({ page }) => {
  const state = await fixture(page); state.sites = []; state.suites = [];
  await page.goto("/overview?view=workspace");
  await expect(page.getByRole("link", { name: "Set up your business", exact: true })).toHaveAttribute("href", "/onboarding");
  await expect(page.locator(".real-overview .button.primary")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Get started", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("a saved website without questions prepares questions without an empty report", async ({ page }) => {
  const state = await fixture(page); state.suites = [];
  await page.goto(`/overview?view=workspace&website=${site.id}`);
  const prepare = nextStep(page).getByRole("link", { name: "Prepare your questions", exact: true });
  await expect(prepare).toHaveAttribute("href", `/evaluations?view=search&website=${site.id}`);
  await expect(nextStep(page).getByRole("link")).toHaveCount(1);
  await expect(page.locator(".real-overview-metrics")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("history errors and explicitly filtered empty views do not claim a first observation", async ({ page }) => {
  const state = await fixture(page); state.failHistory = true;
  await page.goto(`/overview?view=workspace&website=${site.id}`);
  await expect(page.getByRole("alert").filter({ hasText: "No search metrics" })).toBeVisible();
  await expect(nextStep(page)).toHaveCount(0);
  state.failHistory = false;
  for (const suffix of ["&model=unrun-model", "&scope=reviewed-domains"]) {
    await page.goto(`/overview?view=workspace&website=${site.id}${suffix}`);
    await expect(page.getByRole("region", { name: "Saved search overview", exact: true })).toBeVisible();
    await expect(page.getByLabel("Search scope", { exact: true })).toBeVisible();
    await expect(nextStep(page)).toHaveCount(0);
  }
  expect(state.writes).toEqual([]);
});

test("unavailable report reads retain their recovery surface beside the next step", async ({ page }) => {
  const state = await fixture(page); state.failReports = true;
  await page.goto(`/overview?view=workspace&website=${site.id}`);
  const evidence = page.getByRole("region", { name: "Separate website evidence", exact: true });
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText(/unavailable|could not|couldn’t/i);
  expect(state.writes).toEqual([]);
});
