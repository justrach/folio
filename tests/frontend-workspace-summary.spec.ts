import { expect, test, type Page } from "@playwright/test";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { evaluationHref } from "../src/lib/evaluation-navigation";

const timestamp = "2026-09-13T08:00:00.000Z";
const connection = { configured: false, canRun: false, authorized: false, model: "fixture-model",
  maxRunsPerDay: 1, allowedTargets: ["example.com"], message: "Browser fixture: no provider is connected." };

async function makeRuns() {
  const demo = await createDemoEvaluationRun();
  const completed: EvaluationRun = { ...demo, id: "summary-completed", targetUrl: "https://example.com/pricing",
    siteName: "Alpha private review", mode: "live", model: "fixture-model", sessionId: "sess_summary_fixture",
    createdAt: timestamp, updatedAt: timestamp, expectedFacts: { source: "owner-confirmed" },
    result: { ...demo.result!, passed: 4, failed: 1, unmeasured: 3, measured: 5, verificationScore: 80,
      checks: demo.result!.checks.map((check, index) => ({ ...check, status: index < 4 ? "pass" : index === 4 ? "fail" : "unmeasured" })) } };
  const failed: EvaluationRun = { ...completed, id: "summary-failed", siteName: "Beta private review", targetUrl: "https://beta.example.com/",
    createdAt: "2026-09-12T08:00:00.000Z", status: "failed", result: null };
  const attention: EvaluationRun = { ...completed, id: "summary-attention", siteName: "Gamma private review", targetUrl: "https://gamma.example.com/",
    createdAt: "2026-09-11T08:00:00.000Z", status: "requires_action", result: null };
  const older: EvaluationRun = { ...completed, id: "summary-older", siteName: "Older private review", targetUrl: "https://older.example.com/",
    createdAt: "2026-09-10T08:00:00.000Z", status: "cancelled", result: null };
  return { completed, failed, attention, older };
}

async function fixture(page: Page, initialRuns: EvaluationRun[]) {
  const state = { owner: "alice" as string | null, runs: initialRuns, failReads: false,
    reads: 0, nonReadEvaluations: [] as string[], otherApiWrites: [] as string[], holdReads: null as Promise<void> | null };
  const user = () => ({ id: state.owner!, email: `${state.owner}@example.test`, name: `${state.owner} reviewer`,
    emailVerified: true, createdAt: timestamp, updatedAt: timestamp });
  // Every app API is intercepted: these cases never touch the shared D1 database.
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: state.owner ? {
      user: user(), session: { id: `session-${state.owner}`, userId: state.owner, token: "browser-fixture",
        expiresAt: "2099-01-01T00:00:00Z", createdAt: timestamp, updatedAt: timestamp },
    } : null });
    if (pathname === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (pathname === "/api/auth/sign-in/email") {
      state.owner = "bob";
      return route.fulfill({ json: { token: "browser-fixture-bob", user: user(), redirect: false } });
    }
    if (pathname.startsWith("/api/evaluations")) {
      if (method !== "GET") {
        state.nonReadEvaluations.push(`${method} ${pathname}`);
        return route.fulfill({ status: 409, json: { error: "The workspace summary must not submit evaluation work." } });
      }
      if (pathname === "/api/evaluations") {
        state.reads++;
        const runs = state.owner ? state.runs.map(evaluationSummary) : [];
        const shouldFail = state.failReads;
        if (state.holdReads) await state.holdReads;
        // Requests deliberately aborted by logout/unmount may already be closed.
        await route.fulfill(shouldFail ? { status: 503, json: { error: "Fixture storage unavailable." } }
          : { json: { runs, connection, suite: EVAL_SUITE } }).catch(() => {});
        return;
      }
      const run = state.owner ? state.runs.find(item => pathname === `/api/evaluations/${item.id}`) : null;
      return route.fulfill(run ? { json: { run } } : { status: 404, json: { error: "Evaluation not found." } });
    }
    if (method !== "GET") state.otherApiWrites.push(`${method} ${pathname}`);
    if (pathname === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (pathname === "/api/agents/status") return route.fulfill({ json: connection });
    if (pathname === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "No other API is enabled by this browser fixture." } });
  });
  await page.route("https://api.openai.com/**", route => route.abort("blockedbyclient"));
  return state;
}

async function navigate(page: Page, href: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`.nav-link[href="${href}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
}

test("overview shows the three recent private evaluations without requiring a technical audit", async ({ page }, testInfo) => {
  const runs = await makeRuns();
  // Reverse order demonstrates that the summary selects the most recent records.
  const state = await fixture(page, [runs.older, runs.attention, runs.failed, runs.completed]);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/overview");
  const summary = page.getByRole("region", { name: "Workspace evaluations", exact: true });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("heading", { level: 3 })).toHaveText(["Alpha private review", "Beta private review", "Gamma private review"]);
  await expect(summary.getByRole("listitem")).toHaveCount(3);
  await expect(summary).not.toContainText("Older private review");
  await expect(summary).toContainText("https://example.com/pricing");
  const completed = summary.getByRole("listitem").filter({ hasText: "Alpha private review" });
  await expect(completed).toContainText("Completed");
  await expect(completed).toContainText("4 passed");
  await expect(completed).toContainText("1 failed");
  await expect(completed).toContainText("3 unmeasured");
  await expect(completed).toContainText("5 measured checks");
  await expect(summary.getByRole("listitem").filter({ hasText: "Gamma private review" })).toContainText("Needs attention");
  const prepare = summary.getByRole("link", { name: "Prepare evaluation", exact: true });
  await expect(prepare).toHaveAttribute("href", evaluationHref({ targetUrl: runs.completed.targetUrl }));
  const report = summary.getByRole("link", { name: "Open report for Alpha private review", exact: true });
  await expect(report).toHaveAttribute("href", evaluationHref({ runId: runs.completed.id }));
  await expect(summary.getByRole("link", { name: "Open returns for Alpha private review", exact: true }))
    .toHaveAttribute("href", `/agents?run=${runs.completed.id}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  await page.screenshot({ path: `.local/screenshots/workspace-evaluations-${testInfo.project.name}.png`, fullPage: true, animations: "disabled" });
  await report.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/evaluations\\?run=${runs.completed.id}$`));
  await expect(page.locator(".eval-report").getByRole("heading", { name: runs.completed.siteName, exact: true })).toBeVisible();
  await navigate(page, "/overview");
  await summary.getByRole("link", { name: "Open returns for Alpha private review", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/agents\\?run=${runs.completed.id}$`));
  await expect(page.locator(".agent-detail-heading")).toContainText(runs.completed.siteName);
  expect(state.nonReadEvaluations).toEqual([]);
  expect(state.otherApiWrites).toEqual([]);
  expect(errors).toEqual([]);
});

test("summary errors can be retried and an update event refreshes empty saved state using reads only", async ({ page }) => {
  const { completed } = await makeRuns();
  const state = await fixture(page, []);
  state.failReads = true;
  await page.goto("/overview");
  const summary = page.getByRole("region", { name: "Workspace evaluations", exact: true });
  await expect(summary.getByRole("alert")).toContainText("saved evaluations are unavailable");
  state.failReads = false;
  await summary.getByRole("button", { name: "Retry evaluations", exact: true }).click();
  await expect(summary.getByRole("heading", { name: "Your first evaluation starts here.", exact: true })).toBeVisible();
  await expect(summary.getByRole("listitem")).toHaveCount(0);
  state.runs = [completed];
  const readsBefore = state.reads;
  await page.evaluate(() => window.dispatchEvent(new Event("folio-evaluations-changed")));
  await expect(summary).toContainText(completed.siteName);
  expect(state.reads).toBeGreaterThan(readsBefore);
  expect(state.nonReadEvaluations).toEqual([]);
  expect(state.otherApiWrites).toEqual([]);
});

test("loading and late responses cannot restore one owner's summary after logout and another sign-in", async ({ page }) => {
  const { completed } = await makeRuns();
  const state = await fixture(page, [completed]);
  let release: () => void = () => {};
  state.holdReads = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/overview");
  const summary = page.getByRole("region", { name: "Workspace evaluations", exact: true });
  await expect(summary.getByRole("status")).toHaveText("Loading your saved evaluations…");
  await expect(summary.getByRole("listitem")).toHaveCount(0);
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Better Auth", exact: true })).toBeVisible();
  state.holdReads = null;
  release();
  await navigate(page, "/overview");
  await expect(summary).toHaveCount(0);
  await expect(page.getByText(completed.siteName, { exact: true })).toHaveCount(0);
  state.runs = [{ ...completed, id: "bob-summary", siteName: "Bob private review", targetUrl: "https://bob.example.com/" }];
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await navigate(page, "/overview");
  await expect(summary).toContainText("Bob private review");
  await expect(summary).not.toContainText(completed.siteName);
  expect(state.nonReadEvaluations).toEqual([]);
  expect(state.otherApiWrites).toEqual([]);
});
