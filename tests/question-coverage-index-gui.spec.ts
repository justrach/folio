import { expect, test, type Page } from "@playwright/test";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { PUBLIC_SEARCH_QUERIES, PUBLIC_SEARCH_OBSERVATIONS, type PublicSearchObservation } from "../src/lib/public-search-rankings";
import type { PublicQuestionCoverage } from "../src/lib/public-question-coverage";

const at = "2026-09-30T10:00:00.000Z";
const query = { id: "fixture-coverage-question", query: "Which fixture tool documents setup and runtime limits?", audience: "Developer tools" as const, category: "Fixture coverage", language: "en", locale: "en-US" };
const observation: PublicSearchObservation = { id: "fixture-coverage-search-answer", queryId: query.id, observedAt: at, status: "completed", model: "fixture-search-model", surface: "openai-managed-agents", searchMode: "open-web", harnessVersion: "fixture-v1", environmentType: "fixture-hosted", recommendations: [
  { position: 1, name: "Fixture product", url: "https://example.com/", reason: "Fixture returned search reason.", citationUrls: ["https://example.com/docs"] },
  { position: 2, name: "Unreviewed product", url: "https://other.example/", citationUrls: [] },
], citations: [{ url: "https://example.com/docs", title: "Fixture source" }], limitations: ["Synthetic browser fixture, not a provider observation."] };
const coverage: PublicQuestionCoverage = { format: "folio-public-question-coverage-v1", records: [{ observationId: observation.id, queryId: query.id, position: 1, recommendationUrl: "https://example.com/", websiteUrl: "https://example.com/", evaluatedAt: at, method: "question-page-coverage-v1", requestedModel: "jev-latest", model: "jev-fixture-resolved", requestSha256: "a".repeat(64), status: "partial", captureAttemptCount: 2, humanReviewRequired: true, pages: [{ url: "https://example.com/docs", title: "Fixture setup documentation", capturedAt: at, sha256: "b".repeat(64), truncated: true, excerpt: "Synthetic captured excerpt: setup is described; runtime limits require further evidence.", relevance: { choice: "relevant", confidence: 0.8, probabilities: { relevant: 0.8, irrelevant: 0.1, uncertain: 0.1 } }, coverage: { choice: "partial", confidence: 0.8, probabilities: { direct: 0.1, partial: 0.8, not_established: 0.1 } } }] }] };

async function guard(page: Page, data?: unknown) {
  const forbidden: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/api/**", route => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/public/benchmarks" && request.method() === "GET" && data) return route.fulfill({ json: data });
    forbidden.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill({ status: 403, json: { error: "Fixture blocks private or paid requests" } });
  });
  for (const pattern of ["https://api.typesafe.ai/**", "https://api.openai.com/**", "https://api.dataforseo.com/**", "https://gateway.codegraff.com/**"])
    await page.route(pattern, route => { forbidden.push("Provider request"); return route.abort(); });
  return () => { expect(forbidden).toEqual([]); expect(errors).toEqual([]); };
}
async function healthy(page: Page) {
  await expect(page).toHaveTitle(/Folio/i);
  await expect(page.locator("body")).not.toBeEmpty();
  // The Next development-tools portal is expected; reject an actual error overlay.
  await expect(page.locator("nextjs-portal").filter({ hasText: /Build Error|Runtime Error|Unhandled Runtime Error/ })).toHaveCount(0);
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
}

test("existing Folio Index attaches an honest unmeasured disclosure and preserves query/model navigation", async ({ page }, testInfo) => {
  const readOnly = await guard(page);
  const first = PUBLIC_SEARCH_OBSERVATIONS.find(item => item.recommendations.length)!;
  const exact = PUBLIC_SEARCH_QUERIES.find(item => item.id === first.queryId)!;
  await page.goto(`/leaderboard?query=${encodeURIComponent(exact.id)}&model=${encodeURIComponent(first.model)}`);
  await expect(page.getByRole("heading", { name: "The Folio Index", exact: true })).toBeVisible();
  const report = page.getByRole("region", { name: "Public search rankings", exact: true });
  await expect(report).toContainText(exact.query);
  const row = report.locator(".ranked-search-row").first();
  await row.locator(".ranked-search-coverage > summary").click();
  await expect(row).toContainText("Not evaluated");
  await expect(row).toContainText("Opening this result does not run a review.");
  await page.reload();
  // SSR already contains the selects; wait for App Router's native-history integration
  // before changing a controlled select, otherwise hydration can overwrite the event.
  await page.waitForFunction(() => window.history.pushState !== History.prototype.pushState);
  await expect(report.getByRole("combobox", { name: "Search query", exact: true })).toHaveValue(exact.id);
  await expect(report.getByRole("combobox", { name: "Index model", exact: true })).toHaveValue(first.model);
  await report.getByRole("combobox", { name: "Index model", exact: true }).selectOption("");
  await expect(page).not.toHaveURL(/model=/);
  await page.goBack();
  await expect(report.getByRole("combobox", { name: "Index model", exact: true })).toHaveValue(first.model);
  await healthy(page);
  await page.screenshot({ path: `/tmp/folio-coverage-index-${testInfo.project.name}.png`, fullPage: false });
  readOnly();
});

test("selected public question shows separate Jev evidence, source provenance and gaps without rewriting returned rankings", async ({ page }, testInfo) => {
  const rankings = { format: "folio-public-search-rankings-v1", queries: [query], observations: [observation] };
  const progress = { format: "folio-public-search-progress-v1", updatedAt: at, queries: [{ queryId: query.id, status: "completed" }] };
  const data = buildPublicDashboard(rankings, progress, coverage);
  const readOnly = await guard(page, data);
  await page.goto(`/overview?query=${query.id}`);
  const report = page.getByRole("region", { name: "Selected task", exact: true });
  await expect(report.getByRole("heading", { name: query.query, exact: true })).toBeVisible();
  await expect(report.locator(".ranked-search-position")).toHaveText(["1", "2"]);
  const row = report.locator(".ranked-search-row").first();
  const toggle = row.locator(".ranked-search-coverage > summary");
  await toggle.focus(); await page.keyboard.press("Enter");
  await expect(row).toContainText("Partial answer");
  await expect(row).toContainText("Next evidence step");
  await expect(row).toContainText("1 captured page / 2 attempts");
  await expect(row).toContainText("jev-fixture-resolved");
  await expect(row).toContainText("not verified truth or a website score");
  await row.getByText("Captured excerpt and provenance", { exact: true }).click();
  await expect(row).toContainText(coverage.records[0].pages[0].excerpt);
  await expect(row).toContainText("not a model-selected supporting quote");
  await expect(row).toContainText("b".repeat(64));
  await expect(row.getByRole("link", { name: "Fixture setup documentation", exact: true })).toHaveAttribute("href", "https://example.com/docs");
  await expect(report.locator(".ranked-search-row").nth(1)).toContainText("Not evaluated");
  await report.getByText("About this observation", { exact: true }).click();
  await expect(report.locator(".ranked-search-provenance")).toContainText("fixture-search-model");
  await expect(report.locator(".ranked-search-position")).toHaveText(["1", "2"]);
  await healthy(page);
  await row.locator(".ranked-search-coverage").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/folio-coverage-evidence-${testInfo.project.name}.png`, fullPage: false });
  readOnly();
});
