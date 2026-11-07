import { expect, test } from "@playwright/test";

test("dashboard controls share press feedback and stop moving with reduced motion", async ({ page }) => {
  const writes: string[] = [];
  await page.route("**/api/**", route => {
    if (route.request().method() !== "GET") writes.push(route.request().url());
    return route.fulfill({ json: null });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/leaderboard");
  const control = page.getByRole("button", { name: "Dark appearance", exact: true });
  await control.hover(); await page.mouse.down();
  await expect.poll(() => control.evaluate(node => getComputedStyle(node).transform)).not.toBe("none");
  await expect.poll(() => control.evaluate(node => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return matrix.m22 < matrix.m11 - .03;
  })).toBe(true);
  await page.mouse.move(0, 0); await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await control.hover(); await page.mouse.down();
  await expect(control).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0); await page.mouse.up();
  await control.click();
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  expect(writes).toEqual([]);
});
