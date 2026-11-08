import { expect, test } from "@playwright/test";
import { selectValue } from "./select-helpers";

test("system theme follows the device while explicit choices persist and sync", async ({ page, context }) => {
  const writes: string[] = [];
  await context.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: null });
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  const picker = page.getByRole("combobox", { name: "Color theme", exact: true });
  await expect(picker).toHaveAttribute("data-value", "system");
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "light");
  await selectValue(picker, "dark");
  await page.goto("/privacy");
  await expect(picker).toHaveAttribute("data-value", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  await page.reload();
  await expect(picker).toHaveAttribute("data-value", "dark");
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/login");
  await selectValue(other.getByRole("combobox", { name: "Color theme", exact: true }), "light");
  await expect(picker).toHaveAttribute("data-value", "light");
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "light");
  await other.close();
  await selectValue(picker, "system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  await page.goto("/leaderboard");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-dashboard-theme", "dark");
  await page.getByRole("button", { name: "Dark appearance", exact: true }).click();
  await expect(picker).toHaveAttribute("data-value", "light");
  expect(writes).toEqual([]);
});
