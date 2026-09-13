import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const retrievedAt = "2026-09-13T08:00:00.000Z";
const partialResult = {
  id: "fixture-provider-result",
  domain: "private-seo.example.com",
  provider: "DataForSEO",
  fetchedAt: retrievedAt,
  organic: { status: "empty", data: null, error: null, costUsd: 0.01, taskId: "fixture-organic-task", providerVersion: "fixture", endpoint: "/v3/dataforseo_labs/google/domain_rank_overview/live", fetchedAt: retrievedAt },
  backlinks: { status: "error", data: null, error: { code: "NETWORK_ERROR", message: "Fixture: backlink response is unconfirmed.", retryAutomatically: false }, costUsd: null, taskId: null, providerVersion: null, endpoint: "/v3/backlinks/summary/live", fetchedAt: retrievedAt },
  status: "partial",
  totalCostUsd: null,
  knownCostUsd: 0.01,
  costIsComplete: false,
  notes: ["Private browser fixture; no provider is contacted."],
};

const savedReport = {
  id: "saved-private-report",
  domain: partialResult.domain,
  createdAt: retrievedAt,
  retrievedAt,
  publication: "private",
  state: "complete",
  result: partialResult,
};

async function navigate(page: Page, path: string) {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

test("private SEO history reopens and exports partial observations without paying, then clears on logout", async ({ page }) => {
  let signedIn = true;
  let paidRequests = 0;
  let reportReads = 0;
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: signedIn ? {
    user: { id: "seo-history-owner", email: "seo-history@example.test", name: "SEO history reviewer", emailVerified: true, createdAt: retrievedAt, updatedAt: retrievedAt },
    session: { id: "seo-session", userId: "seo-history-owner", token: "browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: retrievedAt, updatedAt: retrievedAt },
  } : null }));
  await page.route("**/api/auth/sign-out", route => {
    signedIn = false;
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/scans", route => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/evaluations", route => route.fulfill({ json: { runs: [] } }));
  await page.route("**/api/agents/status", route => route.fulfill({ json: {
    provider: "OpenAI Agents API", configured: false, status: "disconnected", model: "gpt-6-astra", canRun: false, authorized: false, message: "GUI fixture: no API key.", allowedTargets: ["example.com"],
  } }));
  await page.route("**/api/seo-data", route => {
    if (route.request().method() === "POST") {
      paidRequests++;
      return route.fulfill({ status: 403, json: { error: "GUI test prohibits paid requests." } });
    }
    return route.fulfill({ json: { configured: true, authorized: false, reason: "Fixture: paid access is revoked; your saved reports remain readable." } });
  });
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: signedIn ? [
    { ...savedReport, result: undefined, status: "partial", totalCostUsd: null, knownCostUsd: 0.01, costIsComplete: false },
    { id: "interrupted-report", domain: "interrupted.example.com", createdAt: retrievedAt, retrievedAt: null, publication: "private", state: "pending", status: "unconfirmed", totalCostUsd: null, knownCostUsd: null, costIsComplete: false },
  ] : [] } }));
  await page.route("**/api/seo-reports/*", route => {
    reportReads++;
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ json: { report: id === savedReport.id ? savedReport : { id, publication: "private", result: null } } });
  });

  await page.goto("/search-data");
  await expect(page.getByRole("heading", { name: "Saved SEO reports", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fetch SEO data", exact: true })).toBeDisabled();
  await expect(page.locator(".seo-data-history-list")).toContainText("$0.01 known · remainder unknown");
  await page.getByRole("button", { name: /Open saved SEO report for private-seo/ }).click();
  await expect(page.locator(".seo-data-results")).toContainText("Additional cost unknown");
  await expect(page.locator(".seo-data-results")).toContainText("Missing data is not a zero score.");
  await expect(page.locator(".seo-data-results")).toContainText("Fixture: backlink response is unconfirmed.");
  await page.getByRole("button", { name: "Refresh history", exact: true }).click();
  await page.getByRole("button", { name: /Open saved SEO report for private-seo/ }).click();
  expect(reportReads).toBe(2);
  expect(paidRequests).toBe(0);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download private report", exact: true }).click();
  const download = await downloadEvent;
  const bundle = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(bundle.publication).toBe("private");
  expect(bundle.reportId).toBe(savedReport.id);
  expect(bundle.result).toEqual(partialResult);

  await page.getByRole("button", { name: /Open saved SEO report for interrupted/ }).click();
  await expect(page.locator(".seo-data-history").getByRole("alert")).toContainText("completion and cost are unconfirmed");
  expect(paidRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));

  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Better Auth" })).toBeVisible();
  await navigate(page, "/search-data");
  await expect(page.getByRole("link", { name: "Sign in to continue", exact: true })).toBeVisible();
  await expect(page.locator(".seo-data-history")).toHaveCount(0);
  await expect(page.locator(".seo-data-results")).toHaveCount(0);
  await expect(page.getByText(partialResult.domain, { exact: true })).toHaveCount(0);
  expect(paidRequests).toBe(0);
  expect(pageErrors).toEqual([]);
});
