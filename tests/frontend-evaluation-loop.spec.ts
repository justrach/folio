import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { evaluationHref } from "../src/lib/evaluation-navigation";

const ready = { configured: true, canRun: true, authorized: true, model: "gpt-6-astra", allowedTargets: ["example.com"], message: "GUI fixture: managed evaluations enabled.", usage: { liveAttemptsLast24Hours: 0, remainingLiveRuns: 3, activeRunId: null, activeRunStatus: null } };

async function mockAccount(page: Page) {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: {
    user: { id: "loop-owner", name: "Loop reviewer", email: "loop@example.test", emailVerified: true },
    session: { id: "loop-session", userId: "loop-owner", expiresAt: "2099-01-01T00:00:00Z" },
  } }));
  await page.route("**/api/scans", (route) => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/agents/status", (route) => route.fulfill({ json: ready }));
  await page.route("**/api/seo-reports", (route) => route.fulfill({ json: { reports: [
    { id: "loop-seo-report", domain: "example.com", state: "complete", status: "complete", createdAt: "2026-09-13T00:00:00Z", publication: "private" },
  ] } }));
}

async function runFixture(id: string, name: string): Promise<EvaluationRun> {
  const fixture = await createDemoEvaluationRun();
  return { ...fixture, id, mode: "live", siteName: name, targetUrl: "https://example.com/", sessionId: `sess_${id}`, model: "gpt-6-astra", expectedFacts: { ...fixture.expectedFacts!, source: "owner-confirmed" }, captures: fixture.captures.map((capture) => ({ ...capture, url: "https://example.com/", transport: "http" })) };
}

test("incoming website and SEO intent prepares a fresh evaluation without starting one", async ({ page }) => {
  await mockAccount(page);
  const old = await runFixture("loop-original", "Original website review");
  let latest: EvaluationRun | null = null;
  const creates: Record<string, unknown>[] = [];
  const queryNavigations: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/evaluations" && url.searchParams.has("_rsc")) queryNavigations.push(url.pathname + url.search);
  });
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/evaluations" && route.request().method() === "GET") return route.fulfill({ json: { runs: [old, ...(latest ? [latest] : [])].map(evaluationSummary), connection: ready, suite: EVAL_SUITE } });
    if (path === "/api/evaluations" && route.request().method() === "POST") {
      creates.push(route.request().postDataJSON());
      latest = { ...old, id: "loop-failed", siteName: "Failed capture attempt", status: "failed", sessionId: null, result: null, error: "GUI fixture: website capture could not complete.", expectedFacts: undefined };
      return route.fulfill({ status: 201, json: { run: latest } });
    }
    return route.fulfill({ json: { run: path.endsWith(old.id) ? old : latest } });
  });
  await page.goto(evaluationHref({ targetUrl: "https://example.com/", seoReportId: "loop-seo-report" }));
  const target = page.getByLabel("Website to evaluate", { exact: true });
  await expect(target).toHaveValue("https://example.com/");
  await expect(page.locator("#eval-seo-report")).toHaveValue("loop-seo-report");
  await expect(page.getByRole("region", { name: "Evaluation preflight" })).toContainText("Ready to evaluate");
  expect(creates).toEqual([]);
  await page.getByText("Optional reference answers", { exact: true }).click();
  await page.getByLabel("Expected product name", { exact: true }).fill("Private draft reference");
  await page.locator(".eval-history-list button").filter({ hasText: old.siteName }).click();
  await expect(page.locator(".eval-report")).toContainText(old.siteName);
  await page.getByRole("button", { name: "Evaluate current website", exact: true }).click();
  await expect(page.locator(".eval-report")).toHaveCount(0);
  await expect(target).toHaveValue(old.targetUrl);
  await expect(page.getByLabel("Expected product name", { exact: true })).toHaveValue("");
  await expect(page.locator("#eval-seo-report")).toHaveValue("");
  await expect(page.locator(".eval-notice")).toContainText("Reference answers and saved SEO evidence were cleared");
  expect(creates).toEqual([]);
  await page.getByRole("button", { name: "Run evaluation", exact: true }).click();
  await expect(page).toHaveURL(/run=loop-failed/);
  await expect(page.locator(".eval-notice")).toContainText("saved as failed");
  await expect(page.locator(".eval-notice")).not.toContainText("can continue");
  expect(creates).toEqual([{ domain: old.targetUrl, mode: "managed" }]);
  expect(queryNavigations, "Selecting a report or preparing a fresh form needs no server-page navigation").toEqual([]);
});

test("same-page run navigation hides stale details and supports browser history and baseline selection", async ({ page }) => {
  await mockAccount(page);
  const a = await runFixture("loop-a", "First private report");
  const b = await runFixture("loop-b", "Second private report");
  let releaseB: (() => void) | undefined;
  const gateB = new Promise<void>((resolve) => { releaseB = resolve; });
  let firstB = true;
  let creates = 0;
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/evaluations") {
      if (route.request().method() === "POST") creates += 1;
      return route.fulfill({ json: { runs: [a, b].map(evaluationSummary), connection: ready, suite: EVAL_SUITE } });
    }
    if (path.endsWith(b.id) && firstB) { firstB = false; await gateB; }
    return route.fulfill({ json: { run: path.endsWith(b.id) ? b : a } });
  });
  await page.goto(evaluationHref({ runId: a.id }));
  await expect(page.locator(".eval-report")).toContainText(a.siteName);
  await page.locator(".eval-history-list button").filter({ hasText: b.siteName }).click();
  await expect(page).toHaveURL(/run=loop-b/);
  await expect(page.locator(".eval-report")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Loading selected evaluation" })).toBeVisible();
  releaseB!();
  await expect(page.locator(".eval-report")).toContainText(b.siteName);
  await page.goBack();
  await expect(page).toHaveURL(/run=loop-a/);
  await expect(page.locator(".eval-report")).toContainText(a.siteName);
  await page.goForward();
  await expect(page).toHaveURL(/run=loop-b/);
  await expect(page.locator(".eval-report")).toContainText(b.siteName);
  await page.getByRole("button", { name: "Compare this run", exact: true }).click();
  await expect(page).toHaveURL(/baseline=loop-b/);
  await expect(page.getByLabel("Baseline evaluation", { exact: true })).toHaveValue(b.id);
  await page.locator(".eval-more-actions > summary").click();
  await expect(page.getByRole("link", { name: "Open agent activity", exact: false })).toHaveAttribute("href", `/agents?run=${b.id}`);
  expect(creates).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("preflight exposes the active session and prevents another paid launch", async ({ page }) => {
  await mockAccount(page);
  const run = { ...await runFixture("loop-blocked", "Waiting private session"), status: "requires_action" as const, result: null };
  const connection = { ...ready, usage: { ...ready.usage, activeRunId: run.id, activeRunStatus: run.status } };
  let creates = 0;
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/evaluations") {
      if (route.request().method() === "POST") creates += 1;
      return route.fulfill({ json: { runs: [evaluationSummary(run)], connection, suite: EVAL_SUITE } });
    }
    return route.fulfill({ json: { run } });
  });
  await page.goto("/evaluations?view=page");
  await expect(page.getByRole("region", { name: "Evaluation preflight" })).toContainText("Finish your saved session first");
  await expect(page.getByRole("button", { name: "Run evaluation", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "saved session", exact: true }).click();
  await expect(page).toHaveURL(/run=loop-blocked/);
  await expect(page.getByRole("button", { name: "Cancel run", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Replay frozen evidence", exact: true })).toHaveCount(0);
  expect(creates).toBe(0);
});

test("preflight keeps exhausted allowances and unsafe website inputs from launching", async ({ page }) => {
  await mockAccount(page);
  let remaining = 0;
  let creates = 0;
  await page.route("**/api/evaluations", (route) => {
    if (route.request().method() === "POST") creates += 1;
    return route.fulfill({ json: { runs: [], connection: { ...ready, usage: { ...ready.usage, liveAttemptsLast24Hours: 3 - remaining, remainingLiveRuns: remaining } }, suite: EVAL_SUITE } });
  });
  await page.goto("/evaluations?target=example.com");
  const preflight = page.getByRole("region", { name: "Evaluation preflight" });
  const launch = page.getByRole("button", { name: "Run evaluation", exact: true });
  await expect(preflight).toContainText("rolling 24-hour run allowance is used");
  await expect(preflight).toContainText("0 live attempts remaining");
  await expect(launch).toBeDisabled();
  await expect(page.getByRole("button", { name: "Try reproducible demo", exact: true })).toBeEnabled();
  remaining = 1;
  await page.getByRole("button", { name: "Refresh agent connection", exact: true }).click();
  await expect(launch).toBeEnabled();
  const target = page.getByLabel("Website to evaluate", { exact: true });
  for (const invalid of ["http://example.com", "https://credentials@example.com/", "https://unapproved.example.org/"]) {
    await target.fill(invalid);
    await expect(launch).toBeDisabled();
    await expect(preflight).toContainText("Choose an enabled website target");
  }
  await target.fill("https://example.com/");
  await expect(launch).toBeEnabled();
  expect(creates).toBe(0);
});

test("no daily limit retains explicit website evaluation starts and the active-session guard", async ({ page }) => {
  await mockAccount(page);
  let activeRunId: string | null = null;
  let creates = 0;
  await page.route("**/api/evaluations", route => {
    if (route.request().method() === "POST") creates++;
    return route.fulfill({ json: { runs: [], connection: { ...ready, maxRunsPerDay: null,
      usage: { ...ready.usage, remainingLiveRuns: null, activeRunId, activeRunStatus: activeRunId ? "running" : null } }, suite: EVAL_SUITE } });
  });
  await page.goto("/evaluations?target=example.com");
  const preflight = page.getByRole("region", { name: "Evaluation preflight", exact: true });
  const launch = page.getByRole("button", { name: "Run evaluation", exact: true });
  await expect(preflight).toContainText("No daily limit");
  await expect(launch).toBeEnabled();
  expect(creates).toBe(0);
  activeRunId = "existing-active-fixture";
  await page.getByRole("button", { name: "Refresh agent connection", exact: true }).click();
  await expect(preflight).toContainText("Finish your saved session first");
  await expect(launch).toBeDisabled();
  expect(creates).toBe(0);
});
