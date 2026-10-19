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

async function expandControls(page: Page) {
  const advanced = page.locator("details.guided-run-advanced");
  if (await advanced.count() && await advanced.getAttribute("open") === null)
    await advanced.getByText("Advanced workspace controls", { exact: true }).click();
}
const questions = (page: Page) => page.getByRole("region", { name: "Keyword questions", exact: true });
const url = (caseId: string, website = site.id) => `/evaluations?view=search&suite=${suite.id}&website=${website}&case=${caseId}`;

test("case hints select owned matching questions and follow native history without starting work", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(url("question-next-step"));
  await expandControls(page);
  await expect(page.getByRole("region", { name: "Guided first observation", exact: true })).toContainText(question);
  await expandControls(page);
  await page.getByRole("button", { name: "An unrelated saved question", exact: true }).click();
  await expandControls(page);
  await expect(page.getByRole("region", { name: "Guided first observation", exact: true })).toContainText("An unrelated saved question");
  await page.evaluate(next => history.pushState(null, "", next), url("unknown-question"));
  await expandControls(page);
  await expect(questions(page).getByRole("alert")).toContainText("linked question is unavailable");
  await expandControls(page);
  await expect(questions(page).getByRole("button", { name: "Run baseline", exact: true })).toHaveCount(0);
  await page.goBack();
  await expandControls(page);
  await expect(page.getByRole("region", { name: "Guided first observation", exact: true })).toContainText(question);
  await page.reload();
  await expandControls(page);
  await expect(page.getByRole("region", { name: "Guided first observation", exact: true })).toContainText(question);
  expect(state.writes).toEqual([]);
});

test("malformed, duplicate, mismatched and unowned case context never falls back to the first question", async ({ page }) => {
  const state = await fixture(page);
  for (const path of [url("bad%2Fid"), url("question-unrelated"), url("question-next-step", "unknown-site"), `${url("question-next-step")}&case=question-unrelated`]) {
    await page.goto(path);
    await expandControls(page);
    await expect(questions(page).getByRole("alert")).toContainText("linked question is unavailable");
    await expandControls(page);
    await expect(questions(page).getByRole("button", { name: "Run baseline", exact: true })).toHaveCount(0);
    await expandControls(page);
    await expect(questions(page).locator('[aria-pressed="true"]')).toHaveCount(0);
  }
  await page.getByRole("button", { name: question, exact: true }).click();
  await expandControls(page);
  await expect(page.getByRole("region", { name: "Guided first observation", exact: true })).toContainText(question);
  expect(state.writes).toEqual([]);
});

test("login return preserves only one bounded case hint on local search routes", async ({ page }) => {
  const state = await fixture(page);
  await page.route("**/api/auth/sign-in/email", route => route.fulfill({ json: { token: "fixture", redirect: false, user: { id: "next-step-owner" } } }));
  for (const destination of ["/benchmarks", "/evaluations?view=search"]) {
    for (const hint of ["question-next-step", "bad/id", "question-next-step&case=question-unrelated"]) {
      const next = `${destination}${destination.includes("?") ? "&" : "?"}suite=${suite.id}&case=${hint}&website=${site.id}`;
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      await page.getByLabel("Email address", { exact: true }).fill("fixture@example.test");
      await page.getByLabel("Password", { exact: true }).fill("fixture-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${destination.split("?")[0]}\\?`));
      const returned = new URL(page.url());
      expect(returned.searchParams.get("suite")).toBe(suite.id);
      expect(returned.searchParams.get("case")).toBe(hint === "question-next-step" ? hint : null);
      expect(returned.searchParams.get("website")).toBe(site.id);
    }
  }
  expect(state.writes).toEqual([]);
});
