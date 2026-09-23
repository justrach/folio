import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun, parseWebsiteAgentOutput, verifyEvaluationResult } from "../src/lib/eval-verifier";

const AGENT_OPINION = "Fixture-only agent opinion: the page is difficult to read despite the separate readability check.";

// Every application API request is intercepted. These are layout/navigation
// fixtures, not provider validation, and cannot start a paid evaluation.
async function fixtureWorkspace(page: Page, runs: EvaluationRun[]) {
  const mutations: string[] = [];
  const unexpected: string[] = [];
  const connection = {
    configured: true, authorized: true, canRun: true, model: "gpt-6-astra",
    allowedTargets: ["example.com"], message: "Isolated GUI fixture.",
    usage: { liveAttemptsLast24Hours: 0, remainingLiveRuns: 5, activeRunId: null, activeRunStatus: null },
  };
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      if (path.endsWith("/reconcile")) {
        const run = runs.find(value => path === `/api/evaluations/${value.id}/reconcile`);
        if (run) return route.fulfill({ json: { run } });
      }
      mutations.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 400, json: { error: "Mutation blocked by the GUI fixture." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "redesign-fixture-owner", name: "Fixture reviewer", email: "redesign@example.test", emailVerified: true },
      session: { id: "redesign-fixture-session", userId: "redesign-fixture-owner", expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: runs.map(evaluationSummary), connection, suite: EVAL_SUITE } });
    if (path === "/api/agents/status") return route.fulfill({ json: connection });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/benchmarks/runs") return route.fulfill({ json: { runs: [] } });
    if (runs.some(value => path === `/api/evaluations/${value.id}/semantic-review`))
      return route.fulfill({ json: { review: null, available: false } });
    const run = runs.find(value => path === `/api/evaluations/${value.id}` || path === `/api/evaluations/${value.id}/export`);
    if (run) return route.fulfill({ json: path.endsWith("/export") ? { format: "folio-evidence-bundle", run, suite: EVAL_SUITE } : { run } });
    unexpected.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 404, json: { error: "No fixture for this request." } });
  });
  await page.route("https://api.openai.com/**", route => {
    unexpected.push("Direct provider request");
    return route.abort();
  });
  return { mutations, unexpected };
}

async function savedRun(id: string, status: EvaluationRun["status"] = "completed"): Promise<EvaluationRun> {
  const fixture = await createDemoEvaluationRun();
  const agentOutput = parseWebsiteAgentOutput(fixture.agentOutput)!;
  agentOutput.summary = AGENT_OPINION;
  const result = status === "completed" ? await verifyEvaluationResult({ captures: fixture.captures }, agentOutput) : null;
  const now = new Date();
  return {
    ...fixture, id, mode: "live", status, siteName: id === "redesign-running" ? "Example Developer Documentation and Evidence Workspace" : `Saved website ${id}`,
    targetUrl: "https://example.com/documentation/a-long-public-page-address-for-layout-review",
    createdAt: new Date(now.getTime() - 120_000).toISOString(), updatedAt: new Date(now.getTime() - 15_000).toISOString(),
    sessionId: `sess_fixture_${id}`, providerStatus: status === "completed" ? "idle" : "running", model: "gpt-6-astra",
    result, agentOutput: status === "completed" ? agentOutput : undefined, expectedFacts: undefined,
    events: [
      { id: "capture-fixture", at: new Date(now.getTime() - 110_000).toISOString(), type: "capture", title: "Website source captured", status: "completed" },
      { id: "session-created", at: new Date(now.getTime() - 100_000).toISOString(), type: "session", title: "Managed session recorded", status: "completed" },
      { id: "provider-state", at: new Date(now.getTime() - 95_000).toISOString(), type: "status", title: "Saved root turn state", data: { turnId: `turn_${id}`, turnStatus: status === "completed" ? "completed" : "in_progress" } },
      { id: "message-fixture", at: new Date(now.getTime() - 15_000).toISOString(), type: "message", title: "Agent inspected the captured page", status: "completed", detail: "Fixture observation recorded in the saved session." },
      ...(status === "completed" ? [{ id: "verification-final", at: now.toISOString(), type: "verification" as const, title: "Returned evidence verified", status: "completed" as const }] : []),
    ],
  };
}

async function selectedReportLeads(page: Page, report: Locator, info: TestInfo) {
  await expect(page.getByRole("heading", { level: 1, name: "Evaluations", exact: true })).toBeVisible();
  await expect(report).toBeVisible();
  const bounds = await report.boundingBox();
  expect(bounds, "Selected evaluation must occupy the opening viewport").not.toBeNull();
  const pageView = page.getByRole("region", { name: "Page evidence", exact: true });
  await expect(page.getByRole("button", { name: "Page evidence", exact: true })).toHaveAttribute("aria-pressed", "true");
  const hub = await page.locator(".evaluation-hub").boundingBox();
  const workspace = await pageView.locator(".evaluations-panel").boundingBox();
  expect(hub).not.toBeNull();
  expect(workspace).not.toBeNull();
  // The new view switch and its short explanation precede both workspaces.
  // Bound that addition separately; it must not hide an expanding intro or form.
  const hubHeaderHeight = workspace!.y - hub!.y;
  expect(hubHeaderHeight).toBeGreaterThan(0);
  expect(hubHeaderHeight).toBeLessThanOrEqual(info.project.name === "mobile" ? 180 : 140);
  // Preserve the previous notebook/report budget beneath the added view controls.
  expect(bounds!.y - hubHeaderHeight).toBeLessThanOrEqual((info.project.name === "mobile" ? 450 : 320) + 1);
  await expect(pageView.locator(".evaluations-panel > .panel").first()).toHaveClass(/eval-report/);
  await expect(report.locator(".eval-report-actions")).toBeInViewport();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Start with a website you know.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Evaluation preflight", exact: true })).toHaveCount(0);
  await noOverflow(page);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
}

test("selected running evaluation leads with recorded activity and usable keyboard tabs", async ({ page }, info) => {
  const run = await savedRun("redesign-running", "running");
  const history = await Promise.all(Array.from({ length: 5 }, (_, index) => savedRun(`redesign-history-${index}`)));
  const calls = await fixtureWorkspace(page, [run, ...history]);
  await page.goto(`/evaluations?run=${run.id}`);
  const report = page.getByRole("region", { name: run.siteName, exact: true });
  await selectedReportLeads(page, report, info);
  await expect(report.getByRole("tab", { name: "Agent returns", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(report.getByRole("tabpanel")).toContainText("Agent inspected the captured page");
  await expect(report.getByRole("tabpanel")).toContainText("Website source captured");
  const progress = report.getByRole("region", { name: "Evaluation progress", exact: true });
  await expect(progress).toContainText("Elapsed since start");
  await expect(progress).toContainText("Last updated");
  await expect(progress.getByRole("listitem").filter({ hasText: "Evidence prepared" })).toHaveAttribute("data-complete", "true");
  await expect(progress.getByRole("listitem").filter({ hasText: "Task accepted" })).toHaveAttribute("data-complete", "true");
  await expect(progress.getByRole("listitem").filter({ hasText: "Answer returned" })).toHaveAttribute("data-complete", "false");
  await expect(progress.getByRole("listitem").filter({ hasText: "Checks completed" })).toHaveAttribute("data-complete", "false");
  await expect(report.locator(".eval-verification-score")).toHaveCount(0);
  await expect(report.getByRole("progressbar")).toHaveCount(0);
  expect(await report.innerText()).not.toMatch(/\b\d+\s*%/);
  await page.screenshot({ path: info.outputPath("running-opening-viewport.png"), animations: "disabled" });

  const activity = report.getByRole("tab", { name: "Agent returns", exact: true });
  await activity.focus();
  await page.keyboard.press("Home");
  await expect(report.getByRole("tab", { name: "Verification checks", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(report.getByRole("tab", { name: /^Source evidence/ })).toBeFocused();
  await expect(report.getByRole("tabpanel")).toContainText("Read the saved text");
  await page.keyboard.press("End");
  await expect(report.getByRole("tab", { name: "Methodology", exact: true })).toBeFocused();
  await expect(report.getByRole("tabpanel")).toContainText("Hashes identify captured UTF-8 text");
  await noOverflow(page);
  expect(calls.mutations).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test("unconfirmed creation retains unknown progress instead of implying a finished or absent remote task", async ({ page }, info) => {
  const base = await savedRun("redesign-unconfirmed", "requires_action");
  const run: EvaluationRun = { ...base, sessionId: null, providerStatus: null, captures: [], events: [
    { id: "session-create-attempt", at: base.createdAt, type: "session", title: "Session creation attempted", status: "pending" },
  ], error: "Fixture: creation response could not be confirmed. Inspect this saved attempt before starting another." };
  const calls = await fixtureWorkspace(page, [run]);
  await page.goto(`/evaluations?run=${run.id}`);
  const report = page.getByRole("region", { name: run.siteName, exact: true });
  await selectedReportLeads(page, report, info);
  const progress = report.getByRole("region", { name: "Evaluation progress", exact: true });
  await expect(progress.getByRole("heading", { name: "Review required", exact: true })).toBeVisible();
  await expect(progress.getByRole("listitem")).toHaveCount(4);
  await expect(progress.locator('[data-complete="true"]')).toHaveCount(0);
  await expect(progress.getByText("Not recorded", { exact: true })).toHaveCount(4);
  await expect(report).not.toContainText("Preparation failed");
  await expect(report.locator(".eval-verification-score")).toHaveCount(0);
  await expect(report.getByRole("tab", { name: "Agent returns", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(report.getByRole("tabpanel")).toContainText("Session creation attempted");
  await page.screenshot({ path: info.outputPath("unconfirmed-creation.png"), animations: "disabled" });
  await noOverflow(page);
  expect(calls.mutations).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test("completed evaluation puts the result first and discloses advanced actions without starting a run", async ({ page }, info) => {
  const run = await savedRun("redesign-completed");
  const other = await savedRun("redesign-earlier");
  const calls = await fixtureWorkspace(page, [run, other]);
  await page.goto(`/evaluations?run=${run.id}`);
  const report = page.getByRole("region", { name: run.siteName, exact: true });
  await selectedReportLeads(page, report, info);
  await expect(report.getByRole("tab", { name: "Verification checks", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(report.getByRole("heading", { name: "Evidence verification", exact: true })).toBeVisible();
  await expect(report.locator(".eval-verification-score")).toContainText("measured checks passed");
  await expect(report).toContainText("Independent reference answers are needed to measure product name and pricing accuracy.");
  await expect(report).not.toContainText(AGENT_OPINION);
  await expect(report.getByRole("button", { name: "Download evidence", exact: true })).toBeVisible();
  await report.getByRole("button", { name: "Evaluate current website", exact: true }).click();
  await expect(page.getByText(/Fresh evaluation prepared/)).toBeVisible();
  await page.goBack();
  await expect(report).toBeVisible();
  await expect(page.getByText(/Fresh evaluation prepared/)).toHaveCount(0);
  await expect(report.getByRole("button", { name: "Replay frozen evidence", exact: true })).toBeHidden();
  await expect(report.getByRole("button", { name: "Delete saved evidence", exact: true })).toBeHidden();
  await page.screenshot({ path: info.outputPath("completed-opening-viewport.png"), animations: "disabled" });

  await report.getByRole("tab", { name: "Findings", exact: true }).click();
  await expect(report.getByRole("tabpanel").getByRole("heading", { name: "Agent summary", exact: true })).toBeVisible();
  await expect(report.getByRole("tabpanel")).toContainText(AGENT_OPINION);
  await expect(report.getByRole("tabpanel")).toContainText("This is the agent’s description");
  await report.getByRole("tab", { name: "Verification checks", exact: true }).click();

  const more = report.locator("summary").filter({ hasText: "More actions" });
  await expect(more).toBeVisible();
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(report.getByRole("button", { name: "Replay frozen evidence", exact: true })).toBeVisible();
  await expect(report.getByRole("button", { name: "Delete saved evidence", exact: true })).toBeVisible();
  await expect(report).toContainText("new paid session");
  await noOverflow(page);
  await more.click();
  const pendingDownload = page.waitForEvent("download");
  await report.getByRole("button", { name: "Download evidence", exact: true }).click();
  const download = await pendingDownload;
  const bundle = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(bundle.run.id).toBe(run.id);
  expect(bundle.run.publication).toBe("private");

  await more.click();
  await report.getByRole("link", { name: /Open agent activity/ }).click();
  await expect(page).toHaveURL(`/agents?run=${run.id}`);
  await expect(page.locator(".agent-detail-heading")).toContainText(run.siteName);
  await page.getByRole("link", { name: /^Open evaluation/ }).click();
  await expect(page).toHaveURL(`/evaluations?run=${run.id}`);
  await expect(report).toBeVisible();
  await page.getByRole("button", { name: "New evaluation", exact: true }).click();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toBeFocused();
  await expect(page.locator(".eval-report")).toHaveCount(0);
  await page.goBack();
  await expect(report).toBeVisible();
  await page.reload();
  await expect(report).toBeVisible();
  await noOverflow(page);
  expect(calls.mutations).toEqual([]);
  expect(calls.unexpected).toEqual([]);
});

test("private report waits for authentication and preserves its selection at sign-in", async ({ page }) => {
  const run = await savedRun("redesign-private");
  const calls = await fixtureWorkspace(page, [run]);
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/auth/get-session", async route => { await waiting; await route.fulfill({ json: null }); });
  await page.goto(`/evaluations?run=${run.id}&baseline=redesign-earlier`);
  await expect(page.getByRole("status").filter({ hasText: /(?:Loading|Checking) your workspace…/ }).first()).toBeVisible();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try reproducible demo", exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("heading", { name: "Sign in to open this private report", exact: true })).toBeVisible();
  const href = await page.getByRole("link", { name: "Sign in to open report", exact: true }).getAttribute("href");
  expect(new URL(href!, "http://localhost:3001").searchParams.get("next")).toBe(`/evaluations?run=${run.id}&baseline=redesign-earlier&view=page`);
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveCount(0);
  expect(calls.mutations).toEqual([]);
});
