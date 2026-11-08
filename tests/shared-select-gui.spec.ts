import { publicIndexFixture } from "./public-index-fixture";
import { expect, test } from "@playwright/test";
import { PUBLIC_CORE_QUERIES, PUBLIC_SEARCH_QUERIES } from "../src/lib/public-search-rankings";
import { selectValue } from "./select-helpers";

test("shared dropdowns wrap long options, fit narrow screens and retain keyboard selection", async ({ page }) => {
  const writes: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    if (!new URL(route.request().url()).pathname.startsWith("/api/")) return route.fallback();
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: new URL(route.request().url()).pathname === "/api/public/benchmarks" ? publicIndexFixture : null });
  });
  await page.goto("/");
  const category = page.getByRole("combobox", { name: "Category", exact: true });
  await expect(category).toBeEnabled();
  await category.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("listbox").getByRole("option").last()).toBeFocused();
  await page.keyboard.press("Enter");
  const categories = [...new Set(PUBLIC_SEARCH_QUERIES.map(query => query.category))];
  await expect(category).toHaveAttribute("data-value", categories.at(-1)!);
  await expect(category).toBeFocused();
  await category.click(); await page.keyboard.press("Escape"); await expect(category).toBeFocused();

  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/leaderboard?indexView=rankings");
  const question = page.getByRole("combobox", { name: "Website comparison question", exact: true });
  await question.click();
  const menu = page.getByRole("listbox");
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  const longest = [...PUBLIC_CORE_QUERIES].sort((a,b) => b.query.length - a.query.length)[0];
  const option = menu.locator(`[data-value=${JSON.stringify(longest.id)}]`);
  await option.scrollIntoViewIfNeeded();
  expect(await option.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await selectValue(question, longest.id);
  await expect(question).toHaveText(longest.query);
  expect(await question.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await expect(page).toHaveURL(new RegExp(`query=${longest.id}`));
  for (const path of ["/", "/leaderboard?indexView=rankings", "/docs/api"]) {
    await page.goto(path);
    await expect(page.getByRole("combobox").first()).toBeEnabled();
    expect(await page.getByRole("combobox").evaluateAll(nodes => nodes.every(node => node.tagName === "BUTTON"))).toBe(true);
    expect(await page.locator('select:not([aria-hidden="true"])').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
