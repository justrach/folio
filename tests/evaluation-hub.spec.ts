import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE, evaluationSummary } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { KEYWORD_BENCHMARK_SURFACE, type KeywordBenchmarkRun, type KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-09-13T08:00:00.000Z";
const target = "https://example.com/";
const suite: KeywordBenchmarkSuite = {
  id: "hub-search-suite", name: "Search questions fixture", description: "Isolated navigation fixture.", createdAt: at,
  cases: [{ id: "hub-question", suiteId: "hub-search-suite", revision: 0, createdAt: at, updatedAt: at,
    query: "Which shops sell comfortable walking shoes?", targetUrl: target, language: "en", locale: "US", rubricVersion: "keyword-observation-v1" }],
};
const searchRun: KeywordBenchmarkRun = {
  id: "hub-search-run", suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind: "baseline", baselineRunId: null,
  surface: KEYWORD_BENCHMARK_SURFACE, publication: "private", model: "fixture-model", harnessVersion: "fixture-harness",
  environmentType: "none", environmentFingerprint: "fixture-configuration", status: "completed", sessionId: "fixture-session",
  createAttemptAt: at, allowedDomains: ["example.com"], deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null,
  createdAt: at, updatedAt: at, revision: 1,
  answer: { text: "A saved fixture answer about walking shoes.", mentions: [{ name: "Fixture shop", url: target }],
    citations: [{ url: target, title: "Fixture source", quote: "A fixture source excerpt." }], limitations: ["Browser fixture, not a provider observation."] },
  usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
  providerMetadata: { environmentId: null, requestId: null, turnId: null }, error: null,
};

async function fixture(page: Page) {
  const state = { owner: "hub-owner" as string | null, reads: [] as string[], mutations: [] as string[], errors: [] as string[] };
  const pageRun = { ...await createDemoEvaluationRun(), id: "hub-page-run", mode: "live" as const, targetUrl: target, siteName: "Page evidence fixture" };
  const connection = { configured: false, authorized: false, canRun: false, model: "fixture-model", allowedTargets: [], message: "GUI fixture only." };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      state.mutations.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409, json: { error: "Mutation blocked by this navigation fixture." } });
    }
    state.reads.push(path);
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? {
      user: { id: state.owner, name: "Hub fixture owner", email: "hub@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "hub-session", userId: state.owner, token: "fixture-only", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at },
    } : null });
    if (path === "/api/benchmarks") return route.fulfill({ json: {
      suites: [{ ...suite, cases: undefined, caseCount: suite.cases.length }], templates: [],
      access: { configured: false, authorized: false, canRun: false, maxRunsPerDay: 6, maxActiveRuns: 1 },
      usage: { attemptsLast24Hours: 0, remainingRuns: 6, activeRuns: 0, remainingActiveRuns: 1 },
    } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") return route.fulfill({ json: { runs: [{ ...searchRun, answer: undefined,
      answerCharacters: searchRun.answer!.text.length, mentionCount: 1, citationCount: 1 }] } });
    if (path === `/api/benchmarks/runs/${searchRun.id}`) return route.fulfill({ json: { run: searchRun } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: [{ id: "hub-website", name: "Fixture shop", url: target, isPublic: false, createdAt: at, seoScore: null, lastScannedAt: null }] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [evaluationSummary(pageRun)], connection, suite: EVAL_SUITE } });
    if (path === `/api/evaluations/${pageRun.id}`) return route.fulfill({ json: { run: pageRun } });
    if (path === "/api/agents/status") return route.fulfill({ json: connection });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: false, signedIn: !!state.owner, connected: false } });
    return route.fulfill({ status: 404, json: { error: "No fixture for this request." } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => { state.mutations.push("Unexpected direct provider request"); return route.abort(); });
  return state;
}

function viewButton(page: Page, name: "Search questions" | "Page evidence") {
  return page.getByRole("group", { name: "Evaluation view", exact: true }).getByRole("button", { name, exact: true });
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
}

test("plain evaluations starts with search questions; keyboard switching preserves a valid draft without starting work", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto("/evaluations");
  await expect(viewButton(page, "Search questions")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Search questions", exact: true })).toBeVisible();
  await expect(page.locator(".benchmark-workspace")).toBeVisible();
  await expect(page.locator("#eval-launch")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: suite.cases[0].query, exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("evaluation-hub-search.png"), fullPage: true });
  await viewButton(page, "Search questions").focus();
  await page.keyboard.press("Tab");
  await expect(viewButton(page, "Page evidence")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(viewButton(page, "Page evidence")).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("view")).toBe("page");
  await expect(page.locator(".benchmark-workspace")).toHaveCount(0);
  await page.getByLabel("Website to evaluate", { exact: true }).fill("https://example.org/");
  await viewButton(page, "Search questions").click();
  await expect(viewButton(page, "Search questions")).toHaveAttribute("aria-pressed", "true");
  expect(new URL(page.url()).searchParams.get("target")).toBe("https://example.org/");
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
  await noOverflow(page);
});

test("legacy page run links reopen the notebook through switches, back navigation, and refresh", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto("/evaluations?run=hub-page-run&baseline=hub-page-run");
  const report = page.getByRole("region", { name: "Page evidence fixture", exact: true });
  await expect(report).toBeVisible();
  await expect(viewButton(page, "Page evidence")).toHaveAttribute("aria-pressed", "true");
  await viewButton(page, "Search questions").click();
  await expect(page.getByRole("region", { name: "Search questions", exact: true })).toBeVisible();
  const search = new URL(page.url()).searchParams;
  expect(search.get("target")).toBe(target);
  for (const key of ["run", "baseline", "suite", "seoReport"]) expect(search.has(key)).toBe(false);
  await expect(report).toHaveCount(0);
  await page.goBack();
  await expect(report).toBeVisible();
  await page.reload();
  await expect(report).toBeVisible();
  await report.getByRole("tab", { name: /^Source evidence/ }).click();
  await expect(report.getByRole("tabpanel").getByRole("heading", { name: "Captured sources", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New evaluation", exact: true }).click();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("view")).toBe("page");
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("evaluation-hub-page.png"), fullPage: true });
});

test("explicit search run IDs never reach the page report loader and remain search selections after refresh", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto(`/evaluations?view=search&suite=${suite.id}&run=${searchRun.id}&website=hub-website&target=${encodeURIComponent(target)}`);
  const report = page.getByRole("region", { name: "Keyword observation", exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText("A saved fixture answer about walking shoes.");
  expect(state.reads).not.toContain(`/api/evaluations/${searchRun.id}`);
  await viewButton(page, "Page evidence").click();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(target);
  const params = new URL(page.url()).searchParams;
  for (const key of ["run", "suite", "website"]) expect(params.has(key)).toBe(false);
  await page.goBack();
  await expect(report).toBeVisible();
  await page.reload();
  await expect(report).toBeVisible();
  await expect(viewButton(page, "Search questions")).toHaveAttribute("aria-pressed", "true");
  expect(state.reads).not.toContain(`/api/evaluations/${searchRun.id}`);
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("evaluation-hub-answer.png"), fullPage: true });
});

test("valid legacy website and SEO intent uses page evidence while ambiguous or unsafe targets do not", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`/evaluations?target=${encodeURIComponent(target)}&seoReport=missing-fixture`);
  await expect(viewButton(page, "Page evidence")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(target);
  await expect(page.locator(".eval-notice")).toContainText("unavailable for this account or website");
  await viewButton(page, "Search questions").click();
  expect(new URL(page.url()).searchParams.has("seoReport")).toBe(false);
  await page.goto("/evaluations?target=https%3A%2F%2Flocalhost%2F&target=https%3A%2F%2Fexample.com%2F&website=bad%2Fid");
  await expect(viewButton(page, "Search questions")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#eval-launch")).toHaveCount(0);
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("a changed authentication state hides both kinds of previously opened private report", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`/evaluations?view=search&suite=${suite.id}&run=${searchRun.id}`);
  await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toBeVisible();
  state.owner = null;
  await page.reload();
  await expect(page.getByRole("link", { name: "Sign in to your workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toHaveCount(0);
  await expect(page.getByText("A saved fixture answer about walking shoes.", { exact: true })).toHaveCount(0);
  await page.goto("/evaluations?run=hub-page-run");
  await expect(page.getByRole("heading", { name: "Sign in to open this private report", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Page evidence fixture", exact: true })).toHaveCount(0);
  const next = new URL(await page.getByRole("link", { name: "Sign in to open report", exact: true }).getAttribute("href") ?? "", page.url()).searchParams.get("next");
  expect(new URL(next!, page.url()).searchParams.get("view")).toBe("page");
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
});
