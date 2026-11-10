import { expect, test } from "@playwright/test";
import { publicIndexFixture } from "./public-index-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/public/benchmarks" ? publicIndexFixture : null }));
});

for (const theme of ["light", "dark"] as const) {
  test(`command search keeps its hint separate and accepts typing immediately in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("folio-dashboard-appearance", value), theme);
    await page.goto("/overview?view=demo");
    await page.getByRole("button", { name: /Find anything/ }).click();
    const dialog = page.getByRole("dialog");
    const field = dialog.getByRole("searchbox", { name: "Search pages", exact: true });
    await expect(field).toBeFocused();
    const label = dialog.locator(".lbi-label");
    const aboveText = async () => {
      const a = await label.boundingBox(), b = await field.boundingBox();
      return a !== null && b !== null && a.y + a.height < b.y + b.height / 2 - 4;
    };
    await expect.poll(aboveText).toBe(true);
    await dialog.getByRole("button", { name: "Close dialog", exact: true }).focus();
    await expect(field).toBeEmpty();
    await expect.poll(aboveText).toBe(true);
    await field.focus();
    await page.keyboard.type("patch");
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await expect(dialog.getByRole("link", { name: "Patch studio", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(field).toBeFocused();
  });
}
