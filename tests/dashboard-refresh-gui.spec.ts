import { publicIndexFixture } from "./public-index-fixture";
import { expect, test } from "@playwright/test";

test("dashboard appearance and Index view survive refresh without paid operations", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: new URL(route.request().url()).pathname === "/api/public/benchmarks" ? publicIndexFixture : null });
  });
  await page.goto("/leaderboard");
  const shell = page.locator(".folio-workspace");
  const theme = page.getByRole("button", { name: "Dark appearance", exact: true });
  await theme.click();
  await expect(shell).toHaveAttribute("data-dashboard-theme", "dark");
  await page.getByRole("button", { name: "HTML page checks", exact: true }).click();
  await expect(page).toHaveURL(/indexView=html/);
  await page.reload();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "HTML page checks", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Search rankings", exact: true }).click();
  await expect(page.getByLabel("Website comparison question")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: "HTML page checks", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(writes).toEqual([]);
});

test("long question filters, website list and setup remain usable at 320 pixels", async ({ page }) => {
  const writes: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => { if (route.request().method() !== "GET") writes.push(route.request().url()); return route.fulfill({ json: new URL(route.request().url()).pathname === "/api/public/benchmarks" ? publicIndexFixture : null }); });
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/leaderboard");
  await expect(page.getByRole("button", { name: "Show chart", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a website", exact: true }).fill("railway");
  await expect(page.locator(".website-ranking-row")).toHaveCount(1);
  for (const path of ["/leaderboard", "/", "/start"]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
  }
  await expect(page.getByLabel("Website address")).toBeVisible();
  await page.getByLabel("Website address").fill("example.com");
  await expect(page.getByRole("button", { name: "Check my page", exact: true })).toBeEnabled();
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
