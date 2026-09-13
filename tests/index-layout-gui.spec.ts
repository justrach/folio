import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { PublicSearchObservation, PublicSearchQuery } from "../src/lib/public-search-rankings";

const query: PublicSearchQuery = {
  id: "synthetic-layout-question", audience: "Software & work", category: "Fixture category",
  query: "Which project tools suit a small distributed team?", language: "en", locale: "en-US",
};
const observation: PublicSearchObservation = {
  id: "synthetic-layout-observation", queryId: query.id, observedAt: "2026-09-13T08:00:00.000Z",
  status: "completed", model: "synthetic-fixture-model", surface: "openai-managed-agents",
  searchMode: "open-web", harnessVersion: "synthetic-fixture", environmentType: "synthetic-fixture",
  recommendations: [
    { position: 1, name: "Fixture Cedar", url: "https://cedar.example", reason: "Synthetic reason for a small team. This is not a collected recommendation.", citationUrls: ["https://docs.cedar.example/team"] },
    { position: 2, name: "Fixture Birch", url: null, citationUrls: [] },
  ],
  citations: [{ url: "https://docs.cedar.example/team", title: "Synthetic Cedar team documentation" }],
  limitations: ["Synthetic layout fixture. No website was researched and no provider was called."],
};
const stylesheet = readFileSync("src/components/ranked-search-table.css", "utf8");

function fixtureHtml(value: PublicSearchObservation) {
  const rendered = execFileSync(process.execPath, ["--import", "tsx", "tests/fixtures/render-ranking-fixture.ts"], {
    input: JSON.stringify({ query, observation: value }), encoding: "utf8",
  });
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body{background:#f7f8ef;color:#203b2c;font-family:Arial,sans-serif;margin:20px}main{max-width:1000px;margin:auto}
    ${stylesheet}
  </style></head><body><main><h1>Synthetic ranking layout fixture</h1><p>No live result or score is shown here.</p>
    <section class="ranked-search" aria-label="Synthetic ranking fixture">${rendered}</section>
  </main></body></html>`;
}

test("Index has one compact view selector and does not mount the private activity dock", async ({ page }, testInfo) => {
  const writes: string[] = [];
  const pageErrors: string[] = [];
  const reads: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.route("**/api/**", route => {
    const request = route.request();
    if (request.method() !== "GET") writes.push(request.url());
    reads.push(new URL(request.url()).pathname);
    return route.fulfill({ status: 200, json: null });
  });
  await page.goto("/leaderboard");
  await expect(page.getByRole("heading", { name: "The Folio Index", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search rankings", exact: true })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Evaluation view", exact: true })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Background agent activity" })).toHaveCount(0);
  if (testInfo.project.name === "desktop") await expect(page.locator(".ranked-search-query")).toBeHidden();
  else await expect(page.locator(".ranked-search-query")).toBeVisible();
  const headingSize = await page.locator("h1").evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(headingSize).toBeLessThanOrEqual(30);
  const queryControl = page.getByRole("combobox", { name: "Search query", exact: true });
  await expect(queryControl).toBeVisible();
  const position = await queryControl.boundingBox();
  expect(position!.y).toBeLessThan(testInfo.project.name === "mobile" ? 460 : 370);
  const htmlButton = page.getByRole("button", { name: "HTML page checks", exact: true });
  await htmlButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "HTML page checks", exact: true })).toBeVisible();
  const searchButton = page.getByRole("button", { name: "Search rankings", exact: true });
  await searchButton.click();
  await expect(searchButton).toHaveAttribute("aria-pressed", "true");
  await expect(htmlButton).toHaveAttribute("aria-pressed", "false");
  await expect(queryControl).toBeVisible();
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
  await page.screenshot({ path: testInfo.outputPath("index-compact.png"), fullPage: true, scale: "css", animations: "disabled" });
  expect(writes).toEqual([]);
  expect(reads).not.toContain("/api/evaluations");
  expect(pageErrors).toEqual([]);
});

test("synthetic populated rankings retain positions, citations and keyboard disclosures on narrow screens", async ({ page }, testInfo) => {
  const requests: string[] = [];
  page.on("request", request => requests.push(request.url()));
  await page.setContent(fixtureHtml(observation));
  const rows = page.locator(".ranked-search-row");
  await expect(rows.locator(".ranked-search-position")).toHaveText(["1", "2"]);
  await expect(rows.nth(0).getByRole("link", { name: "Fixture Cedar", exact: true })).toHaveAttribute("href", "https://cedar.example");
  await expect(rows.nth(0).getByRole("link", { name: "Synthetic Cedar team documentation" })).toBeVisible();
  await expect(rows.nth(1)).toContainText("Website URL not returned");
  await expect(rows.nth(1)).toContainText("No source attached");
  await rows.nth(0).getByText("Returned reason", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(rows.nth(0).locator(".ranked-search-evidence")).toHaveAttribute("open", "");
  await expect(rows.nth(0)).toContainText("Synthetic reason for a small team");
  await page.getByText("About this observation", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".ranked-search-provenance")).toContainText("Synthetic layout fixture");
  await expect(page.locator("main")).not.toContainText("/ 100");
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
  await page.screenshot({ path: testInfo.outputPath("synthetic-populated-ranking.png"), fullPage: true, scale: "css", animations: "disabled" });
  expect(requests).toEqual([]);
});

test("a synthetic completed observation without recommendations shows no invented positions", async ({ page }) => {
  await page.setContent(fixtureHtml({ ...observation, recommendations: [], citations: [] }));
  await expect(page.getByRole("status")).toContainText("No recommendations returned.");
  await expect(page.locator(".ranked-search-row")).toHaveCount(0);
  await expect(page.locator("time").first()).toHaveAttribute("datetime", observation.observedAt);
});
