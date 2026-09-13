import { expect, test, type Page } from "@playwright/test";

const at = "2026-09-13T08:00:00.000Z";
const searchReport = {
  id: "retry-search-fixture", property: "https://saved.example.com/", startDate: "2026-08-14", endDate: "2026-09-10", fetchedAt: at,
  totals: { clicks: 1, impressions: 10, ctr: 0.1, position: 2 }, daily: [], queries: [], pages: [],
  status: "complete", warnings: [], rowLimit: 1000,
};
const observation = { status: "empty", data: null, error: null, costUsd: 0, fetchedAt: at };
const seoResult = {
  id: "saved-lookup-fixture", domain: "saved.example.com", provider: "DataForSEO", fetchedAt: at,
  organic: observation, backlinks: observation, status: "complete", totalCostUsd: 0, knownCostUsd: 0, costIsComplete: true,
};
const seoReport = {
  id: "saved-seo-fixture", domain: seoResult.domain, publication: "private", state: "complete", createdAt: at, retrievedAt: at,
  status: "complete", totalCostUsd: 0, knownCostUsd: 0, costIsComplete: true, result: seoResult,
};

async function fixture(page: Page) {
  const state = { detailReads: 0, writes: [] as string[] };
  // Catch all application APIs: the browser never uses actual accounts or providers.
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      state.writes.push(path);
      return route.fulfill({ status: 409, json: { error: "This fixture forbids mutations." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "recovery-fixture-owner", name: "Fixture reviewer", email: "fixture@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "fixture-session", userId: "recovery-fixture-owner", token: "fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at },
    } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: false, connected: false, signedIn: true, message: "Fixture: saved reports only." } });
    if (path === "/api/search-console/reports") return route.fulfill({ json: { reports: [searchReport] } });
    if (path === `/api/search-console/reports/${searchReport.id}`) {
      state.detailReads++;
      return state.detailReads === 1
        ? route.fulfill({ status: 503, json: { error: "Fixture: temporary saved-report read failure." } })
        : route.fulfill({ json: { report: searchReport } });
    }
    if (path === "/api/seo-data") return route.fulfill({ json: { configured: true, authorized: true } });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [seoReport] } });
    if (path === `/api/seo-reports/${seoReport.id}`) return route.fulfill({ json: { report: seoReport } });
    return route.fulfill({ status: 404, json: { error: "No other API is available in this fixture." } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://accounts.google.com/**", "https://www.googleapis.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}

test("a failed selected Search Console report can be reopened without duplicate history or an import", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/search-console");
  const open = page.getByRole("button", { name: `Open Search Console report for ${searchReport.property}`, exact: true });
  await open.click();
  await expect(page.locator(".gsc-workspace").getByRole("alert")).toContainText("temporary saved-report read failure");
  const historyLength = await page.evaluate(() => history.length);
  await open.click();
  const report = page.getByRole("region", { name: "Search Console report", exact: true });
  await expect(report).toBeVisible();
  await expect(report).toBeFocused();
  expect(state.detailReads).toBe(2);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await expect(page).toHaveURL(/\/search-console$/);
  await expect(report).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("opening a saved SEO report prepares its domain without starting a paid update", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/search-data?target=https%3A%2F%2Fprevious.example.com%2F");
  const domain = page.getByLabel("Website domain", { exact: true });
  await expect(domain).toHaveValue("previous.example.com");
  await page.getByRole("button", { name: /Open saved website report for saved\.example\.com/ }).click();
  await expect(page.getByRole("heading", { name: "saved.example.com", exact: true })).toBeVisible();
  await expect(domain).toHaveValue("saved.example.com");
  await expect(page.getByRole("link", { name: "Use in evaluation", exact: true })).toHaveAttribute("href", /seoReport=saved-seo-fixture/);
  expect(state.writes).toEqual([]);
});
