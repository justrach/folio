import { expect, test, type Page } from "@playwright/test";
import { evaluateHtml } from "../src/lib/evaluation";

const ownerId = "workspace-gui-owner";
const timestamp = "2026-09-13T09:00:00.000Z";
const latestUrl = "https://example.com/pricing?edition=team";
const olderUrl = "https://www.example.com/docs";
const latestAudit = {
  ...evaluateHtml('<!doctype html><html lang="en"><head><title>Workspace latest audit</title><meta name="description" content="A captured website used only by this browser navigation test."><link rel="canonical" href="https://example.com/pricing?edition=team"></head><body><h1>Workspace latest audit</h1><p>A private captured page for checking the saved audit workflow.</p></body></html>', latestUrl),
  id: "latest-workspace-audit", url: latestUrl, createdAt: timestamp,
};
const olderAudit = {
  ...evaluateHtml('<!doctype html><html lang="en"><head><title>Workspace older audit</title></head><body><h1>Workspace older audit</h1></body></html>', olderUrl),
  id: "older-workspace-audit", url: olderUrl, createdAt: "2026-09-12T09:00:00.000Z",
};

async function fixture(page: Page, options: { signedIn?: boolean; failFirstAuditRead?: boolean } = {}) {
  const state = { signedIn: options.signedIn ?? true, auditReads: 0, auditStarts: 0, seoLookups: 0, evalStarts: 0, signIns: 0 };
  const user = { id: ownerId, name: "Morgan", email: "workspace-gui@example.test", emailVerified: true, createdAt: timestamp, updatedAt: timestamp };
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: state.signedIn ? {
    user,
    session: { id: "workspace-gui-session", userId: ownerId, token: "browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: timestamp, updatedAt: timestamp },
  } : null }));
  await page.route("**/api/auth/sign-in/email", route => {
    state.signIns++;
    state.signedIn = true;
    return route.fulfill({ json: { redirect: false, token: "browser-fixture", user } });
  });
  await page.route("**/api/scans", route => {
    if (route.request().method() === "POST") {
      state.auditStarts++;
      return route.fulfill({ status: 409, json: { error: "This navigation test must not start an audit." } });
    }
    state.auditReads++;
    if (options.failFirstAuditRead && state.auditReads === 1)
      return route.fulfill({ status: 503, json: { error: "Fixture: audit history unavailable." } });
    return route.fulfill({ json: { scans: state.signedIn ? [latestAudit, olderAudit] : [] } });
  });
  await page.route("**/api/sites", route => route.fulfill({ json: { sites: [{ id: "owned-latest", name: "Latest fixture", url: latestUrl }, { id: "owned-older", name: "Older fixture", url: olderUrl }] } }));
  await page.route("**/api/evaluations", route => {
    if (route.request().method() === "POST") {
      state.evalStarts++;
      return route.fulfill({ status: 409, json: { error: "This navigation test must not start a managed evaluation." } });
    }
    return route.fulfill({ json: { runs: [] } });
  });
  await page.route("**/api/agents/status", route => route.fulfill({ json: {
    provider: "OpenAI Agents API", configured: true, authorized: true, canRun: true, status: "configured", model: "gpt-6-astra",
    maxRunsPerDay: 1, allowedTargets: ["example.com", "www.example.com"], message: "Browser fixture: configured without provider calls.",
  } }));
  await page.route("**/api/seo-data", route => {
    if (route.request().method() === "POST") {
      state.seoLookups++;
      return route.fulfill({ status: 409, json: { error: "This navigation test must not start a paid lookup." } });
    }
    return route.fulfill({ json: { configured: true, authorized: true, reason: "Browser fixture: explicit lookups are available." } });
  });
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: [] } }));
  await page.route("**/api/benchmarks", route => route.fulfill({ json: { suites: [] } }));
  await page.route("**/api/benchmarks/runs", route => route.fulfill({ json: { runs: [] } }));
  await page.route("**/api/search-console/reports", route => route.fulfill({ json: { reports: [] } }));
  return state;
}

async function navigate(page: Page, path: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

function noStartedWork(state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.auditStarts).toBe(0);
  expect(state.seoLookups).toBe(0);
  expect(state.evalStarts).toBe(0);
}

test("a signed-in workspace opens its latest saved audit and preserves the website through evaluation handoff", async ({ page }) => {
  const state = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/overview");
  // A fresh browser has no remembered audit; history supplies the default.
  expect(await page.evaluate(id => sessionStorage.getItem(`folio-active-${id}`), ownerId)).toBeNull();
  await expect(page.getByRole("button", { name: "My website results", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".workspace-switch")).toContainText("Morgan workspace");
  await expect(page.locator(".workspace-switch")).not.toContainText("Acme workspace");
  const bridge = page.getByRole("region", { name: "Separate website evidence", exact: true });
  await expect(bridge).toContainText(`Latest readiness: ${latestAudit.seoScore}/100`);
  await expect(page.locator(".sparkline")).toHaveCount(0);
  await expect(bridge).toBeVisible();
  const link = bridge.getByRole("link", { name: "Evaluate this website", exact: true });
  const href = new URL((await link.getAttribute("href"))!, "http://localhost:3001");
  expect(href.pathname).toBe("/evaluations");
  expect(href.searchParams.get("target")).toBe(latestUrl);
  const seoHref = new URL((await bridge.locator('a[href^="/search-data?"]').getAttribute("href"))!, "http://localhost:3001");
  expect(seoHref.searchParams.get("target")).toBe(latestUrl);
  await link.click();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(latestUrl);
  noStartedWork(state);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("each audit history row offers its own evaluation target alongside the saved report", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/websites");
  const rows = page.locator(".audit-history-row");
  await expect(rows).toHaveCount(2);
  for (const [index, audit] of [latestAudit, olderAudit].entries()) {
    await expect(rows.nth(index).getByRole("button")).toHaveCount(1);
    const evaluate = rows.nth(index).getByRole("link", { name: `Evaluate ${new URL(audit.url).hostname}`, exact: true });
    const href = new URL((await evaluate.getAttribute("href"))!, "http://localhost:3001");
    expect(href.searchParams.get("target")).toBe(audit.url);
  }
  await rows.nth(1).getByRole("link", { name: `Evaluate ${new URL(olderUrl).hostname}`, exact: true }).click();
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(olderUrl);
  noStartedWork(state);
  await navigate(page, "/websites");
  await page.locator(".audit-history-row").nth(1).getByRole("button").click();
  await expect(page).toHaveURL(/\/seo$/);
  await expect(page.locator(".score-ring")).toContainText(String(olderAudit.seoScore));
  noStartedWork(state);
});

test("failed private audit reads can be retried without displaying the demo or starting work", async ({ page }) => {
  const state = await fixture(page, { failFirstAuditRead: true });
  await page.goto("/seo");
  await expect(page.getByRole("button", { name: /^My audit results/ })).toHaveClass(/selected/);
  await expect(page.locator(".workspace-read-error")).toContainText("Your saved audits could not be loaded");
  await expect(page.locator(".score-ring")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Demo report", exact: true })).not.toHaveClass(/selected/);
  await page.getByRole("button", { name: "Retry audits", exact: true }).click();
  await expect(page.locator(".workspace-read-error")).toHaveCount(0);
  await expect(page.locator(".score-ring")).toContainText(String(latestAudit.seoScore));
  expect(state.auditReads).toBeGreaterThanOrEqual(2);
  noStartedWork(state);
});

test("email sign-in returns to the requested evaluation composer without starting a run", async ({ page }) => {
  const state = await fixture(page, { signedIn: false });
  const destination = `/evaluations?target=${encodeURIComponent(latestUrl)}`;
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email address", { exact: true }).fill("workspace-gui@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("/evaluations\\?"));
  expect(new URL(page.url()).searchParams.get("target")).toBe(latestUrl);
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(latestUrl);
  expect(state.signIns).toBe(1);
  noStartedWork(state);
});

test("an external login return target falls back to the private websites workspace", async ({ page }) => {
  const state = await fixture(page, { signedIn: false });
  const navigations: string[] = [];
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
  await page.route("https://outside.example.org/**", route => route.fulfill({ body: "Blocked external destination fixture." }));
  await page.goto("/login?next=https%3A%2F%2Foutside.example.org%2Fcollect");
  const appOrigin = new URL(page.url()).origin;
  await page.getByLabel("Email address", { exact: true }).fill("workspace-gui@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  expect(navigations.every(url => new URL(url).origin === appOrigin)).toBe(true);
  expect(state.signIns).toBe(1);
  noStartedWork(state);
});
