import { expect, test } from "@playwright/test";

test("standalone and workspace routes share the palette without writes or viewport overflow", async ({ page }) => {
  const writes: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => { if (!new URL(route.request().url()).pathname.startsWith("/api/")) return route.fallback(); if (route.request().method() !== "GET") writes.push(route.request().url()); return route.fulfill({ json: null }); });
  for (const path of ["/docs/api", "/pricing", "/privacy", "/login", "/settings", "/evaluations", "/search-data", "/search-console"]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(247, 245, 238)");
    const width = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
    expect(width.scroll, path).toBeLessThanOrEqual(width.viewport + 1);
  }
  await page.goto("/docs/api");
  const menu = page.getByRole("button", { name: "On this page", exact: true });
  const navigation = page.getByRole("navigation", { name: "API reference navigation" });
  if (await menu.isVisible()) {
    await expect(navigation).not.toBeVisible();
    await menu.focus(); await page.keyboard.press("Enter");
    await expect(navigation).toBeVisible();
    await navigation.getByRole("link", { name: /Read a saved run/ }).click();
    await expect(page.getByRole("heading", { name: "Read a saved run", exact: true })).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeFocused();
    await expect(navigation).not.toBeVisible();
  } else {
    await expect(navigation).toBeVisible();
  }
  await page.getByRole("button", { name: "Dark appearance", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  await page.goto("/privacy");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(23, 29, 25)");
  await page.goto("/docs/api");
  await expect(page.getByRole("button", { name: "Dark appearance", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(writes).toEqual([]); expect(errors).toEqual([]);
});
