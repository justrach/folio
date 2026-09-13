import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun, sha256Source, verifyEvaluationResult } from "../src/lib/eval-verifier";

async function mockComparison(page: Page, runs: EvaluationRun[], details = runs) {
  let authenticated = true;
  const writes: string[] = [];
  const detailReads: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const connection = { configured: false, canRun: false, message: "GUI fixture: provider calls disabled." };
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: authenticated ? {
    user: { id: "comparison-owner", email: "comparison@example.test", name: "Comparison reviewer", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    session: { id: "comparison-session", userId: "comparison-owner", token: "test-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  } : null }));
  await page.route("**/api/auth/sign-out", route => {
    authenticated = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/agents/status", route => route.fulfill({ json: connection }));
  await page.route("**/api/scans", route => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: [] } }));
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 400, json: { error: "No provider operations are allowed in comparison tests." } });
    }
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: runs.map(evaluationSummary), connection, suite: EVAL_SUITE } });
    const id = decodeURIComponent(path.split("/").at(-1)!);
    detailReads.push(id);
    const run = details.find(value => value.id === id);
    return route.fulfill({ status: run ? 200 : 404, json: run ? { run } : { error: "Private run not found." } });
  });
  return { writes, detailReads, errors };
}

async function liveFixture(id: string) {
  const run = await createDemoEvaluationRun();
  run.id = id;
  run.siteName = `Private comparison ${id}`;
  run.mode = "live";
  run.model = "mocked-provider-model";
  run.sessionId = `mocked-session-${id}`;
  run.captures[0].transport = "http";
  run.expectedFacts!.source = "owner-confirmed";
  run.result = await verifyEvaluationResult(run, run.agentOutput);
  return run;
}

test("private run comparison shows check changes and changed evidence without provider requests", async ({ page }, testInfo) => {
  const before = await liveFixture("before");
  const after = await liveFixture("after");
  after.captures[0].content += "<p>Different captured source text.</p>";
  after.captures[0].sha256 = await sha256Source(after.captures[0].content);
  after.expectedFacts!.productName = "Owner's revised reference product";
  after.result = await verifyEvaluationResult(after, after.agentOutput);
  const mocks = await mockComparison(page, [before, after]);
  await page.goto("/evaluations");
  const comparison = page.getByRole("region", { name: "Compare completed runs", exact: true });
  await expect(comparison).toBeVisible();
  expect(mocks.detailReads).toEqual([]);
  await comparison.getByLabel("Baseline evaluation", { exact: true }).selectOption(before.id);
  const afterSelect = comparison.getByLabel("Comparison evaluation", { exact: true });
  await afterSelect.focus();
  await expect(afterSelect).toBeFocused();
  await afterSelect.selectOption(after.id);
  await expect(comparison.getByText("These percentages are not interchangeable.", { exact: true })).toBeVisible();
  await expect(comparison).toContainText("Source hashes changed between these runs.");
  await expect(comparison).toContainText("Reference answers also changed.");
  const row = comparison.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Product name accuracy", exact: true }) });
  await expect(row).toContainText("Passed");
  await expect(row).toContainText("Failed");
  await expect(row).toContainText("regressed");
  await row.getByText("Inspect observations", { exact: true }).click();
  await expect(row).toContainText("Owner's revised reference product");
  await comparison.getByText("Inspect source hashes and reference answers", { exact: true }).click();
  await expect(comparison.locator(".eval-comparison-source code")).toHaveText([before.captures[0].sha256, after.captures[0].sha256]);
  expect(mocks.detailReads.sort()).toEqual(["after", "before"]);
  expect(mocks.writes).toEqual([]);
  expect(mocks.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  await comparison.screenshot({ path: testInfo.outputPath("private-comparison.png"), animations: "disabled" });
});

test("run selection separates local fixtures from live and unfinished evaluations", async ({ page }) => {
  const first = await createDemoEvaluationRun();
  first.id = "demo-one";
  const second = await createDemoEvaluationRun();
  second.id = "demo-two";
  const live = await liveFixture("live-only");
  const unfinished = { ...live, id: "unfinished", status: "failed" as const, result: null };
  const mocks = await mockComparison(page, [first, second, live, unfinished]);
  await page.goto("/evaluations");
  const comparison = page.getByRole("region", { name: "Compare completed runs", exact: true });
  const baseline = comparison.getByLabel("Baseline evaluation", { exact: true });
  const candidate = comparison.getByLabel("Comparison evaluation", { exact: true });
  await expect(baseline.locator('option[value="unfinished"]')).toHaveCount(0);
  await baseline.selectOption(first.id);
  await expect(candidate.locator('option[value="live-only"]')).toHaveCount(0);
  await candidate.selectOption(second.id);
  await expect(comparison.locator(".eval-comparison-summary")).toContainText("0 percentage points");
  await expect(comparison).toContainText("Reference answers are unchanged.");
  await baseline.selectOption(live.id);
  await expect(candidate.locator('option[value="demo-one"]')).toHaveCount(0);
  await expect(comparison).toContainText("No other completed live agent run is available.");
  await expect(comparison.locator(".eval-comparison-result")).toHaveCount(0);
  expect(mocks.writes).toEqual([]);
  expect(mocks.errors).toEqual([]);
});

test("detail provenance is rechecked before rendering a comparison", async ({ page }) => {
  const before = await liveFixture("before");
  const after = await liveFixture("after");
  const inconsistent = { ...after, mode: "demo" as const };
  const mocks = await mockComparison(page, [before, after], [before, inconsistent]);
  await page.goto("/evaluations");
  const comparison = page.getByRole("region", { name: "Compare completed runs", exact: true });
  await comparison.getByLabel("Baseline evaluation", { exact: true }).selectOption(before.id);
  await comparison.getByLabel("Comparison evaluation", { exact: true }).selectOption(after.id);
  await expect(comparison.getByRole("alert")).toContainText("Local fixtures and live Agents API runs cannot be compared together.");
  await expect(comparison.locator(".eval-comparison-result")).toHaveCount(0);
  expect(mocks.writes).toEqual([]);
  expect(mocks.errors).toEqual([]);
});
