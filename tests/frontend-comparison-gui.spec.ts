import { expect, test, type Page, type Route } from "@playwright/test";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

async function privateNotebook(page: Page, detailOverride?: (route: Route, id: string) => Promise<boolean>) {
  const first = await createDemoEvaluationRun();
  const second = await createDemoEvaluationRun();
  first.id = "nav-first"; first.siteName = "First private notebook source";
  second.id = "nav-second"; second.siteName = "Second private notebook source";
  const runs: EvaluationRun[] = [first, second];
  const reads: string[] = [];
  const writes: string[] = [];
  const connection = { configured: false, canRun: false, message: "GUI navigation fixture: no provider access." };
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: {
    user: { id: "nav-owner", email: "nav@example.test", name: "Navigation reviewer", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    session: { id: "nav-session", userId: "nav-owner", token: "test-only-session", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  } }));
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: [] } }));
  await page.route("**/api/scans", route => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/agents/status", route => route.fulfill({ json: connection }));
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 400, json: { error: "Navigation cannot start provider work." } });
    }
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: runs.map(evaluationSummary), connection, suite: EVAL_SUITE } });
    const id = decodeURIComponent(path.split("/").at(-1)!);
    reads.push(id);
    if (detailOverride && await detailOverride(route, id)) return;
    const run = runs.find(item => item.id === id);
    return route.fulfill({ status: run ? 200 : 404, json: run ? { run } : { error: "Private session not found." } });
  });
  return { first, second, reads, writes };
}

test("baseline deep links select the intended run and track same-page query changes", async ({ page }) => {
  const notebook = await privateNotebook(page);
  await page.goto("/evaluations?baseline=nav-first");
  const comparison = page.getByRole("region", { name: "Compare completed runs", exact: true });
  const baseline = comparison.getByLabel("Baseline evaluation", { exact: true });
  await expect(baseline).toHaveValue(notebook.first.id);
  await expect(comparison.locator(".eval-comparison-intent")).toContainText(notebook.first.siteName);
  expect(notebook.reads).toEqual([]);
  await comparison.getByLabel("Comparison evaluation", { exact: true }).selectOption(notebook.second.id);
  await expect(comparison.locator(".eval-comparison-result")).toBeVisible();
  await page.evaluate(() => window.history.pushState(null, "", "/evaluations?baseline=nav-second"));
  await expect(baseline).toHaveValue(notebook.second.id);
  await expect(comparison.getByLabel("Comparison evaluation", { exact: true })).toHaveValue("");
  await expect(comparison.locator(".eval-comparison-result")).toHaveCount(0);
  await expect(comparison.locator(".eval-comparison-intent")).toContainText(notebook.second.siteName);
  expect(notebook.writes).toEqual([]);
});

test("agent run selection updates its URL and clears stale details before an unknown run resolves", async ({ page }) => {
  let releaseUnknown: (() => void) | undefined;
  const notebook = await privateNotebook(page, async (route, id) => {
    if (id !== "unknown-session") return false;
    await new Promise<void>(resolve => { releaseUnknown = resolve; });
    await route.fulfill({ status: 404, json: { error: "Private session not found." } });
    return true;
  });
  await page.goto("/agents?run=nav-first");
  await expect(page.locator(".agent-detail-heading h3")).toHaveText(notebook.first.siteName);
  await page.locator(".agent-task-row").filter({ hasText: notebook.second.siteName }).click();
  await expect(page).toHaveURL(/\/agents\?run=nav-second$/);
  await expect(page.locator(".agent-detail-heading h3")).toHaveText(notebook.second.siteName);
  await page.goBack();
  await expect(page).toHaveURL(/\/agents\?run=nav-first$/);
  await expect(page.locator(".agent-detail-heading h3")).toHaveText(notebook.first.siteName);
  await page.evaluate(() => window.history.pushState(null, "", "/agents?run=unknown-session"));
  await expect.poll(() => Boolean(releaseUnknown)).toBe(true);
  await expect(page.locator(".agent-detail-heading")).toHaveCount(0);
  await expect(page.locator(".agent-detail")).toContainText("Loading this session’s returned events…");
  releaseUnknown!();
  await expect(page.locator(".agent-runs-panel").getByRole("alert")).toContainText("Private session not found.");
  await expect(page.locator(".agent-detail-heading")).toHaveCount(0);
  await expect(page.locator(".agent-detail")).toContainText("The selected session is unavailable.");
  const priorReads = notebook.reads.length;
  await page.evaluate(() => window.history.pushState(null, "", "/agents?run=..%2Fsecret"));
  await expect(page.locator(".agent-runs-panel").getByRole("alert")).toContainText("This session link is invalid.");
  expect(notebook.reads).toHaveLength(priorReads);
  expect(notebook.writes).toEqual([]);
});
