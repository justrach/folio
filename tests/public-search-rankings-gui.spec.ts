import { expect, test, type Page } from "@playwright/test";
import { PUBLIC_SEARCH_QUERIES, latestPublicSearchObservation } from "../src/lib/public-search-rankings";

const rankings = (page: Page) => page.getByRole("region", { name: "Public search rankings", exact: true });

async function browseOnly(page: Page) {
  const writes: string[] = [], providers: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ status: 200, json: null });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(pattern, route => { providers.push(route.request().url()); return route.abort("blockedbyclient"); });
  return () => { expect(writes).toEqual([]); expect(providers).toEqual([]); expect(errors).toEqual([]); };
}

async function noOverflow(page: Page) {
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
}

test("public rankings preserve the returned order and sources for each exact query", async ({ page }, testInfo) => {
  const readOnly = await browseOnly(page);
  await page.goto("/");
  const report = rankings(page);
  await expect(report).toBeVisible();
  await expect(page.getByRole("region", { name: "Folio website report", exact: true })).toBeHidden();
  const category = report.getByRole("combobox", { name: "Category", exact: true });
  const query = report.getByRole("combobox", { name: "Search query", exact: true });

  for (const item of PUBLIC_SEARCH_QUERIES) {
    await category.selectOption(item.category);
    await query.selectOption(item.id);
    await expect(report).toContainText(item.query);
    const observed = latestPublicSearchObservation(item.id);
    if (!observed) {
      await expect(report).toContainText("No recorded ranking yet.");
      await expect(report.locator(".ranked-search-row")).toHaveCount(0);
      continue;
    }
    await expect(report.locator("time").first()).toHaveAttribute("datetime", observed.observedAt);
    const rows = report.locator(".ranked-search-row");
    await expect(rows).toHaveCount(observed.recommendations.length);
    await expect(rows.locator(".ranked-search-position")).toHaveText(observed.recommendations.map(row => String(row.position)));
    for (let index = 0; index < observed.recommendations.length; index++) {
      const recommendation = observed.recommendations[index];
      const row = rows.nth(index);
      await expect(row).toContainText(recommendation.name);
      if (recommendation.url) await expect(row.locator(`a[href=${JSON.stringify(recommendation.url)}]`).first()).toBeVisible();
      for (const source of recommendation.citationUrls)
        await expect(row.locator(`.ranked-search-citations a[href=${JSON.stringify(source)}]`).first()).toBeVisible();
      if (recommendation.citationUrls.length === 0) await expect(row).toContainText("No source attached");
      const disclosure = row.getByText("Returned reason", { exact: true });
      await disclosure.focus();
      await page.keyboard.press("Enter");
      await expect(row.locator(".ranked-search-evidence")).toHaveAttribute("open", "");
      await expect(row).toContainText(recommendation.reason || "No reason was recorded for this recommendation.");
    }
    await report.getByText("About this observation", { exact: true }).click();
    await expect(report.locator(".ranked-search-provenance")).toContainText(observed.model);
    await expect(report.locator(".ranked-search-provenance")).toContainText(observed.harnessVersion);
    await expect(report).not.toContainText("/ 100");
    await noOverflow(page);
  }
  await page.screenshot({ path: testInfo.outputPath("public-search-rankings.png"), fullPage: true, scale: "css" });
  readOnly();
});

test("ranking categories constrain query selection and HTML checks remain a separate disclosure", async ({ page }) => {
  const readOnly = await browseOnly(page);
  await page.goto("/");
  const report = rankings(page);
  const category = report.getByRole("combobox", { name: "Category", exact: true });
  const query = report.getByRole("combobox", { name: "Search query", exact: true });
  for (const item of PUBLIC_SEARCH_QUERIES) {
    await category.selectOption(item.category);
    const expected = PUBLIC_SEARCH_QUERIES.filter(candidate => candidate.category === item.category);
    await expect(query.getByRole("option")).toHaveCount(expected.length);
    await expect(query).toHaveValue(expected[0].id);
    await expect(report).toContainText(expected[0].query);
  }
  const technicalToggle = page.locator(".landing-technical-report > summary");
  await technicalToggle.focus();
  await page.keyboard.press("Enter");
  const technical = page.getByRole("region", { name: "Folio website report", exact: true });
  await expect(technical).toBeVisible();
  await expect(technical).toContainText("Folio checked this homepage’s HTML.");
  await expect(technical).toContainText("/ 100");
  await expect(report).not.toContainText("/ 100");
  await noOverflow(page);
  readOnly();
});
