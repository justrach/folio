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

// Artifact tests validate every stored query/observation. Browser coverage exercises
// category boundaries plus published and unmeasured rendering without revisiting
// the same empty-state path thousands of times as the catalog grows.
const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
const browserQueries = [...new Map(categories.flatMap(category => {
  const queries = PUBLIC_SEARCH_QUERIES.filter(query => query.category === category);
  return [queries[0], queries.at(-1), queries.find(query => latestPublicSearchObservation(query.id)), queries.find(query => !latestPublicSearchObservation(query.id))].filter((query): query is typeof PUBLIC_SEARCH_QUERIES[number] => Boolean(query));
}).map(query => [query.id, query])).values()];

test("public rankings preserve order and sources across category boundaries and result states", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const readOnly = await browseOnly(page);
  await page.goto("/");
  const report = rankings(page);
  await expect(report).toBeVisible();
  await expect(page.getByRole("region", { name: "Folio website report", exact: true })).toBeHidden();
  const category = report.getByRole("combobox", { name: "Category", exact: true });
  const query = report.getByRole("button", { name: "Change question", exact: true });

  for (const item of browserQueries) {
    await category.selectOption(item.category);
    await query.click();
    const picker = page.getByRole("dialog", { name: "Choose a question" });
    await picker.getByRole("searchbox", { name: "Filter questions" }).fill(item.query);
    await picker.locator(`[data-question-id="${item.id}"]`).click();
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
  const query = report.getByRole("button", { name: "Change question", exact: true });
  for (const categoryName of categories) {
    await category.selectOption(categoryName);
    const expected = PUBLIC_SEARCH_QUERIES.filter(candidate => candidate.category === categoryName);
    await expect(query).toContainText(expected[0].query);
    await query.click();
    const picker = page.getByRole("dialog", { name: "Choose a question" });
    await expect(picker.getByRole("status")).toContainText(`${expected.length} matching`);
    await expect(picker.locator("li button")).toHaveCount(Math.min(expected.length, 100));
    await page.keyboard.press("Escape");
    await expect(picker).not.toBeVisible();
    await expect(query).toBeFocused();
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

test("selected questions wrap once and the searchable picker restores focus and URL history", async ({ page }) => {
  const readOnly = await browseOnly(page);
  await page.goto("/leaderboard");
  const report = rankings(page);
  const trigger = report.getByRole("button", { name: "Change question", exact: true });
  const initial = await report.locator(".ranked-search-query").innerText();
  for (const width of [1280, 640, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await report.locator(".ranked-search-query").evaluate(element => ({
      width: element.clientWidth, scroll: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace, overflow: getComputedStyle(element).overflow,
    }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.whiteSpace).toBe("normal");
    expect(bounds.overflow).toBe("visible");
    await expect(report.locator(".ranked-search-query")).toHaveCount(1);
    await noOverflow(page);
  }
  await trigger.focus(); await page.keyboard.press("Enter");
  const picker = page.getByRole("dialog", { name: "Choose a question" });
  await expect(picker.getByRole("searchbox")).toBeFocused();
  await picker.getByRole("searchbox").fill("no matching question xyz");
  await expect(picker).toContainText("No matching questions.");
  await page.keyboard.press("Escape"); await expect(trigger).toBeFocused();
  await trigger.click();
  const other = PUBLIC_SEARCH_QUERIES.find(item => item.query !== initial && item.category === PUBLIC_SEARCH_QUERIES.find(item => item.query === initial)?.category)!;
  await picker.getByRole("searchbox").fill(other.query);
  await picker.locator(`[data-question-id="${other.id}"]`).click();
  await expect(trigger).toContainText(other.query);
  await expect(page).toHaveURL(new RegExp(`query=${other.id}`));
  await page.reload(); await expect(trigger).toContainText(other.query);
  await page.goBack(); await expect(trigger).toContainText(initial);
  readOnly();
});
