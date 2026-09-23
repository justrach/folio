import { expect, test } from "@playwright/test";

test("workspace hydration shows an accessible, motion-aware loader", async ({ page }, info) => {
  let releaseSession: (() => void) | undefined;
  await page.route("**/api/auth/get-session**", async route => {
    await new Promise<void>(resolve => { releaseSession = resolve; });
    await route.fulfill({ json: null });
  });

  try {
    await page.goto("/websites", { waitUntil: "domcontentloaded" });
    const status = page.getByRole("status", { name: /Loading your workspace/ });
    await expect(status).toBeVisible();
    await expect(status).toContainText("Getting your websites and saved results ready.");
    await expect(status.locator(".workspace-loader-mark i")).toHaveCount(16);
    expect(await status.locator(".workspace-loader-mark i").first().evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
    await page.screenshot({ path: info.outputPath("workspace-loading.png"), animations: "disabled" });
  } finally {
    releaseSession?.();
  }
});
