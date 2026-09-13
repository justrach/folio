import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-09-13T08:00:00.000Z";
const result = {
  id: "lookup-for-handoff", domain: "example.com", provider: "DataForSEO", fetchedAt: timestamp,
  organic: { status: "empty", data: null, error: null, costUsd: 0.01, taskId: "organic-fixture", providerVersion: "fixture", endpoint: "/v3/dataforseo_labs/google/domain_rank_overview/live", fetchedAt: timestamp },
  backlinks: { status: "empty", data: null, error: null, costUsd: 0.02, taskId: "backlinks-fixture", providerVersion: "fixture", endpoint: "/v3/backlinks/summary/live", fetchedAt: timestamp },
  status: "complete", totalCostUsd: 0.03, knownCostUsd: 0.03, costIsComplete: true, notes: [],
};
const savedReport = { id: "saved-exact-report-123", domain: result.domain, createdAt: timestamp, retrievedAt: timestamp, publication: "private", state: "complete", result };
const pendingReport = { id: "pending-report-456", domain: "pending.example.com", createdAt: timestamp, retrievedAt: null, publication: "private", state: "pending", result: null };
const summaries = [
  { ...savedReport, result: undefined, status: "complete", totalCostUsd: 0.03, knownCostUsd: 0.03, costIsComplete: true },
  { ...pendingReport, result: undefined, status: "unconfirmed", totalCostUsd: null, knownCostUsd: null, costIsComplete: false },
];

async function fixture(page: Page, options: { signedIn?: boolean; unsavedLookup?: boolean } = {}) {
  const state = { signedIn: options.signedIn ?? true, seoLookups: 0, evalStarts: 0, reportReads: [] as string[] };
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: state.signedIn ? {
    user: { id: "seo-handoff-owner", email: "handoff@example.test", name: "Handoff reviewer", emailVerified: true, createdAt: timestamp, updatedAt: timestamp },
    session: { id: "handoff-session", userId: "seo-handoff-owner", token: "browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: timestamp, updatedAt: timestamp },
  } : null }));
  await page.route("**/api/auth/sign-out", route => {
    state.signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/scans", route => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/agents/status", route => route.fulfill({ json: {
    provider: "OpenAI Agents API", configured: true, authorized: true, canRun: true, status: "configured", model: "gpt-6-astra",
    maxRunsPerDay: 1, allowedTargets: ["example.com"], message: "Browser fixture: ready; no real provider is contacted.",
  } }));
  await page.route("**/api/evaluations", route => {
    if (route.request().method() === "POST") {
      state.evalStarts++;
      return route.fulfill({ status: 409, json: { error: "Navigation must not start a managed run." } });
    }
    return route.fulfill({ json: { runs: [] } });
  });
  await page.route("**/api/seo-data", route => {
    if (route.request().method() === "POST") {
      state.seoLookups++;
      return options.unsavedLookup ? route.fulfill({ json: { ...result, reportId: "unsaved-report", saved: false, storageWarning: "Fixture: this completed result was not saved." } })
        : route.fulfill({ status: 409, json: { error: "Navigation must not start a paid lookup." } });
    }
    return route.fulfill({ json: { configured: true, authorized: true, reason: "Browser fixture: explicit lookups are available." } });
  });
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: state.signedIn ? summaries : [] } }));
  await page.route("**/api/seo-reports/*", route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    state.reportReads.push(id);
    if (!state.signedIn) return route.fulfill({ status: 401, json: { error: "Sign in to read a saved report." } });
    const report = id === savedReport.id ? savedReport : id === pendingReport.id ? pendingReport : null;
    return report ? route.fulfill({ json: { report } }) : route.fulfill({ status: 404, json: { error: "Report not found." } });
  });
  return state;
}

async function navigate(page: Page, href: string) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`.nav-link[href="${href}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
}

test("a saved SEO report hands its exact ID and website to the composer without starting work", async ({ page }) => {
  const state = await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/search-data?target=https%3A%2F%2Fexample.com%2Fpricing");
  await expect(page.getByLabel("Website domain", { exact: true })).toHaveValue("example.com");
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveCount(0);
  expect(state.reportReads).toEqual([]);
  await page.getByRole("button", { name: /Open saved website report for example\.com/ }).click();
  const handoff = page.getByRole("link", { name: "Use in evaluation", exact: true });
  await expect(handoff).toBeVisible();
  const href = new URL((await handoff.getAttribute("href"))!, "http://localhost:3001");
  expect(href.pathname).toBe("/evaluations");
  expect(href.searchParams.get("target")).toBe("https://example.com/");
  expect(href.searchParams.get("seoReport")).toBe(savedReport.id);
  await handoff.click();
  await expect(page).toHaveURL(/\/evaluations\?/);
  await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue("https://example.com/");
  await expect(page.locator("#eval-seo-report")).toHaveValue(savedReport.id);
  expect(state.seoLookups).toBe(0);
  expect(state.evalStarts).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));

  await navigate(page, "/search-data");
  await page.getByRole("button", { name: /Open saved website report for example\.com/ }).click();
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toBeVisible();
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Better Auth" })).toBeVisible();
  await navigate(page, "/search-data");
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveCount(0);
  await expect(page.locator(".seo-data-results")).toHaveCount(0);
  expect(state.seoLookups).toBe(0);
  expect(state.evalStarts).toBe(0);
  expect(errors).toEqual([]);
});

test("pending reports never offer an evaluation attachment or trigger another lookup", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/search-data");
  await page.getByRole("button", { name: /Open saved website report for example\.com/ }).click();
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Open saved website report for pending\.example\.com/ }).click();
  await expect(page.locator(".seo-data-history").getByRole("alert")).toContainText("completion and cost are unconfirmed");
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveCount(0);
  await expect(page.locator(".seo-data-results")).toHaveCount(0);
  expect(state.seoLookups).toBe(0);
  expect(state.evalStarts).toBe(0);
});

test("an unsaved lookup remains downloadable and cannot be attached by its reservation ID", async ({ page }) => {
  const state = await fixture(page, { unsavedLookup: true });
  await page.goto("/search-data?target=example.com");
  await expect(page.getByLabel("Website domain", { exact: true })).toHaveValue("example.com");
  expect(state.seoLookups).toBe(0);
  await page.getByRole("button", { name: "Update website data", exact: true }).click();
  await expect(page.locator(".seo-data-results").getByRole("alert")).toContainText("was not saved");
  await expect(page.getByRole("button", { name: "Download private report", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveCount(0);
  expect(state.seoLookups).toBe(1);
  expect(state.evalStarts).toBe(0);
});

test("unsafe target hints and a report ID in the URL do not authorize private evidence reads", async ({ page }) => {
  const state = await fixture(page, { signedIn: false });
  await page.goto(`/search-data?target=javascript%3Aalert%281%29&seoReport=${savedReport.id}`);
  await expect(page.getByLabel("Website domain", { exact: true })).toHaveValue("");
  await expect(page.getByRole("link", { name: "Sign in to continue", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveCount(0);
  expect(state.reportReads).toEqual([]);
  expect(state.seoLookups).toBe(0);
  expect(state.evalStarts).toBe(0);
});
