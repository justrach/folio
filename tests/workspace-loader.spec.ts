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
    await expect(status).toContainText("Loading your workspace…");
    // The drawing: a page, its fold, three written lines and a tick, all decorative.
    const strokes = status.locator(".workspace-loader-mark[aria-hidden=true] svg path.sk-ink");
    await expect(strokes).toHaveCount(6);
    // Under reduced motion nothing animates and every stroke is shown finished.
    expect(await strokes.evaluateAll(paths => paths.map(path => [getComputedStyle(path).animationName, getComputedStyle(path).strokeDasharray]))).toEqual(Array(6).fill(["none", "none"]));
    expect(await status.locator(".workspace-loader-title").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
    await page.screenshot({ path: info.outputPath("workspace-loading.png"), animations: "disabled" });
  } finally {
    releaseSession?.();
  }
});
