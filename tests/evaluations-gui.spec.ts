import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page) ?? [], "Browser runtime and console errors").toEqual([]);
});

const connection = {
  provider: "OpenAI Agents API", configured: false, status: "disconnected",
  model: "gpt-6-astra", canRun: false, authorized: false, maxRunsPerDay: 5,
  message: "GUI fixture: connect an OpenAI API key before running managed evaluations.",
  allowedTargets: ["example.com"],
};

async function mockAccount(page: Page, signedIn = true) {
  let authenticated = signedIn;
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({
    json: authenticated ? {
      user: { id: "gui-evaluation-owner", email: "eval-gui@example.test", name: "Evaluation reviewer", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      session: { id: "gui-session", userId: "gui-evaluation-owner", token: "non-secret-browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    } : null,
  }));
  await page.route("**/api/auth/sign-out", (route) => {
    authenticated = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/seo-reports", (route) => route.fulfill({ json: { reports: [] } }));
  await page.route("**/api/scans", (route) => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/agents/status", (route) => route.fulfill({ json: connection }));
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth + 1),
  );
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  // Keep review copies outside Playwright's auto-cleared results folder. Both are ignored by Git.
  const directory = resolve(".local/screenshots");
  await mkdir(directory, { recursive: true });
  await copyFile(path, resolve(directory, `${name}-${info.project.name}.png`));
}

async function navigate(page: Page, path: string) {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("evaluation demo is explicit, verifiable, keyboard navigable, and exportable without a provider", async ({ page }, testInfo) => {
  await mockAccount(page, false);
  const apiCalls: string[] = [];
  await page.route("**/api/evaluations**", async (route) => {
    apiCalls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 401, json: { error: "Sign in to view private evaluations." } });
  });
  await page.goto("/evaluations");
  await expect(page.getByRole("button", { name: "Run with Agents API", exact: true })).toBeDisabled();
  await expect(page.getByRole("link", { name: /Sign in to connect your workspace/ })).toBeVisible();
  await expect(page.locator(".eval-report")).toHaveCount(0);
  await page.getByRole("button", { name: "Try reproducible demo", exact: true }).click();
  const report = page.locator(".eval-report");
  await expect(report.getByRole("heading", { name: "Sable Analytics · fictional fixture", exact: true })).toBeVisible();
  await expect(page.locator(".eval-notice[role=status]")).toContainText("No OpenAI request was made");
  await expect(report).toContainText("Local verifier · no model call");

  const product = report.locator(".eval-check").filter({ hasText: "Product name accuracy" });
  await product.locator("summary").click();
  await expect(product.locator("dd")).toHaveText(["Sable Analytics", "Sable Analytics"]);
  await product.getByRole("button", { name: "demo-home-v1", exact: true }).click();
  await expect(report.getByRole("tab", { name: /^Source evidence/ })).toHaveAttribute("aria-selected", "true");
  await report.getByText("Read captured text", { exact: true }).click();
  await expect(report.locator(".eval-evidence-card pre")).toContainText("The Starter plan costs 29 USD per month.");
  await expect(report.locator(".eval-hash code")).toHaveText(/^[a-f0-9]{64}$/);

  const sourceTab = report.getByRole("tab", { name: /^Source evidence/ });
  await sourceTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(report.getByRole("tab", { name: "Agent returns", exact: true })).toBeFocused();
  await expect(report.getByRole("tabpanel")).toContainText("This fixture did not start an OpenAI session");
  await page.keyboard.press("End");
  await expect(report.getByRole("tab", { name: "Methodology", exact: true })).toBeFocused();
  await expect(report.getByRole("tabpanel")).toContainText("not search rank");

  const pending = page.waitForEvent("download");
  await report.getByRole("button", { name: "Download evidence", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^folio-evaluation-demo-.*\.json$/);
  const bundle = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(bundle.run.mode).toBe("demo");
  expect(bundle.run.sessionId).toBeNull();
  expect(bundle.run.publication).toBe("private");
  expect(bundle.run.expectedFacts.pricing).toEqual({ amount: 29, currency: "USD", interval: "month" });
  for (const capture of bundle.run.captures) {
    expect(createHash("sha256").update(capture.content, "utf8").digest("hex")).toBe(capture.sha256);
  }
  expect(apiCalls).toEqual([]);
  await noOverflow(page);
  await screenshot(page, testInfo, "evaluations-demo");
});

test("signed-in evaluation page requires configured access and never launches automatically", async ({ page }) => {
  await mockAccount(page);
  let creates = 0;
  await page.route("**/api/evaluations", (route) => {
    if (route.request().method() === "POST") creates += 1;
    return route.fulfill({ json: { runs: [], connection, suite: EVAL_SUITE } });
  });
  await page.goto("/evaluations");
  await expect(page.getByText(connection.message, { exact: true })).toBeVisible();
  await page.getByLabel("Website to evaluate", { exact: true }).fill("example.com");
  await expect(page.getByRole("button", { name: "Run with Agents API", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh agent connection", exact: true }).click();
  await navigate(page, "/agents");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await navigate(page, "/evaluations");
  await expect(page.getByRole("button", { name: "Run with Agents API", exact: true })).toBeDisabled();
  expect(creates).toBe(0);
});

test("managed session starts once, follows navigation, exposes private returns, and clears on logout", async ({ page }, testInfo) => {
  await mockAccount(page);
  // Provider and server persistence are mocked. The UI must never reach a paid provider.
  const fixture = await createDemoEvaluationRun();
  const completed: EvaluationRun = {
    ...fixture, id: "gui-managed-evidence", siteName: "Private GUI source", mode: "live",
    targetUrl: "https://example.com/", sessionId: "sess_gui_fixture", model: "gpt-6-astra",
    providerStatus: "idle", revision: 2,
    events: [
      { id: "session-created", at: fixture.createdAt, type: "session", title: "Managed session recorded", status: "completed" },
      { id: "source-return", at: fixture.createdAt, type: "tool", title: "Captured source returned", status: "completed", detail: "GUI fixture: sanitized source evidence.", data: { evidenceId: "demo-home-v1", characters: fixture.captures[0].content.length } },
      { id: "verified", at: fixture.updatedAt, type: "verification", title: "Returned evidence verified", status: "completed" },
    ],
  };
  let saved: EvaluationRun | null = null;
  let allowCompletion = false;
  const creates: unknown[] = [];
  let exports = 0;
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/evaluations" && method === "GET") {
      await route.fulfill({ json: { runs: saved ? [evaluationSummary(saved)] : [], connection: { ...connection, configured: true, status: "configured", canRun: true, authorized: true, message: "GUI fixture: managed runs enabled." }, suite: EVAL_SUITE } });
    } else if (path === "/api/evaluations" && method === "POST") {
      creates.push(route.request().postDataJSON());
      saved = { ...completed, status: "queued", result: null, providerStatus: "pending", revision: 1, events: [completed.events[0]] };
      await route.fulfill({ status: 201, json: { run: saved } });
    } else if (path.endsWith("/reconcile") && method === "POST") {
      if (allowCompletion) saved = completed;
      await route.fulfill({ json: { run: saved } });
    } else if (path.endsWith("/export") && method === "GET") {
      exports += 1;
      await route.fulfill({ json: { format: "folio-evidence-bundle", run: saved, suite: EVAL_SUITE } });
    } else if (path === `/api/evaluations/${completed.id}` && method === "GET") {
      await route.fulfill({ json: { run: saved } });
    } else {
      await route.fulfill({ status: 400, json: { error: "Unexpected GUI fixture operation." } });
    }
  });

  await page.goto("/evaluations");
  const launch = page.getByRole("button", { name: "Run with Agents API", exact: true });
  await expect(launch).toBeEnabled();
  expect(creates).toEqual([]);
  await page.getByLabel("Website to evaluate", { exact: true }).fill("example.com");
  await launch.click();
  await expect(page.locator(".eval-report .eval-status").first()).toContainText("Queued");
  await expect(page.locator(".eval-report .eval-verification-score")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The session is working in the background.", exact: true })).toBeVisible();
  expect(creates).toEqual([{ domain: "example.com", mode: "managed" }]);

  await navigate(page, "/overview");
  const dock = page.getByRole("complementary", { name: "Background agent activity", exact: true });
  await expect(dock).toContainText("Private GUI source");
  await expect(dock).toContainText("Waiting to start");
  await dock.getByRole("link", { name: "Open agent session for Private GUI source", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\?run=gui-managed-evidence$/);
  await expect(page.locator(".agent-detail-heading")).toContainText("Private GUI source");
  await expect(page.locator(".eval-session-id code")).toHaveText("sess_gui_fixture");
  allowCompletion = true;
  await page.getByRole("button", { name: "Refresh returns", exact: true }).click();
  await expect(page.locator(".agent-detail-heading .eval-status")).toHaveText("Completed");
  const returnedSource = page.locator(".eval-event").filter({ hasText: "Captured source returned" });
  await returnedSource.locator("summary").click();
  await expect(returnedSource.locator("pre")).toContainText('"evidenceId": "demo-home-v1"');
  await noOverflow(page);
  await screenshot(page, testInfo, "managed-agents");
  await page.getByRole("link", { name: "Open evaluation", exact: false }).click();
  await expect(page).toHaveURL(/\/evaluations\?run=gui-managed-evidence$/);
  await expect(page.locator(".eval-report .eval-status").first()).toHaveText("Completed");
  await expect(page.locator(".eval-verification-score")).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence", exact: true }).click();
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe("folio-evaluation-gui-managed-evidence.json");
  const bundle = JSON.parse(await readFile((await downloaded.path())!, "utf8"));
  expect(bundle.run.publication).toBe("private");
  expect(bundle.run.sessionId).toBe("sess_gui_fixture");
  expect(exports).toBe(1);
  expect(creates).toHaveLength(1);
  await noOverflow(page);
  await screenshot(page, testInfo, "managed-evaluation");

  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: /Sign in with Better Auth/ })).toBeVisible();
  await navigate(page, "/evaluations");
  await expect(page.getByRole("link", { name: /Sign in to connect your workspace/ })).toBeVisible();
  await expect(page.getByText("Private GUI source", { exact: true })).toHaveCount(0);
  await expect(page.locator(".eval-history")).toHaveCount(0);
  await expect(page.locator(".eval-report")).toHaveCount(0);
  expect(creates).toHaveLength(1);
});

test("proposed pricing requires sign-in and links to evaluations without starting billing", async ({ page }, testInfo) => {
  await mockAccount(page, false);
  const planRequests: string[] = [];
  await page.route("**/api/plans", (route) => {
    planRequests.push(route.request().method());
    return route.fulfill({ status: 401, json: { error: "Sign in required." } });
  });
  await page.goto("/pricing");
  await expect(page.getByText("Proposed pricing · billing is not active", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to register interest", exact: false })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Register interest", exact: true })).toHaveCount(0);
  await page.getByText("Are private results included in the public index?", { exact: true }).click();
  await expect(page.getByText(/Evaluation prompts, captured evidence, agent outputs, and your account remain private/)).toBeVisible();
  await noOverflow(page);
  await screenshot(page, testInfo, "pricing");
  await page.getByRole("link", { name: "Explore the evaluation suite", exact: false }).click();
  await expect(page).toHaveURL(/\/evaluations$/);
  expect(planRequests).toEqual([]);
});

test("pricing saves only an explicit private preference and preserves it across navigation", async ({ page }) => {
  await mockAccount(page);
  let selected: string | null = null;
  const writes: unknown[] = [];
  await page.route("**/api/plans", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      writes.push(body); selected = body.plan;
    }
    await route.fulfill({ json: { interest: selected ? { plan: selected, updatedAt: Date.now() } : null, billingActive: false } });
  });
  await page.goto("/pricing");
  const builder = page.locator(".pricing-card").filter({ has: page.getByRole("heading", { name: "Builder", exact: true }) });
  await expect(builder.getByRole("button", { name: "Register interest", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  await builder.getByRole("button", { name: "Register interest", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("No subscription or charge has been created");
  await expect(builder.getByRole("button", { name: "Preference saved", exact: true })).toBeVisible();
  expect(writes).toEqual([{ plan: "builder" }]);
  await page.reload();
  await expect(builder.getByRole("button", { name: "Preference saved", exact: true })).toBeVisible();
  expect(writes).toEqual([{ plan: "builder" }]);
  await noOverflow(page);
});
