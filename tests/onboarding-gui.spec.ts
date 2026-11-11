import { expect, test } from "@playwright/test";

for (const signedIn of [false, true]) {
  test(`website setup has no Search Console import link (${signedIn ? "signed in" : "signed out"})`, async ({ page }) => {
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/get-session") return route.fulfill({ json: signedIn ? {
        user: { id: "fixture-owner", name: "Example owner", email: "owner@example.test", emailVerified: true,
          createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        session: { id: "fixture-session", userId: "fixture-owner", token: "non-secret-browser-fixture", expiresAt: "2099-01-01T00:00:00Z" },
      } : null });
      if (path === "/api/onboarding") return route.fulfill({ json: {
        state: null, site: null, check: null, suite: null, competitors: [],
      } });
      if (["/api/search-console", "/api/github"].includes(path))
        return route.fulfill({ json: { configured: false, connected: false } });
      return route.fulfill({ status: 404, json: { error: "Unavailable in this browser fixture." } });
    });

    await page.goto("/start?step=1");
    await expect(page.getByRole("heading", { name: "Start with your website." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Import from Search Console" })).toHaveCount(0);
    const actions = page.locator(".ob-actions");
    await expect(actions.locator(":scope > *")).toHaveCount(1);
    const check = actions.getByRole("button", { name: "Check my page" });
    await expect(check).toBeVisible();
    await expect(check).toBeDisabled();
    await page.getByRole("textbox", { name: "Website address" }).fill("example.test");
    await expect(check).toBeEnabled();
    expect(await actions.evaluate(element => element.getBoundingClientRect().height))
      .toBe(await check.evaluate(element => element.getBoundingClientRect().height));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("customer question preview wraps long input without clipping or starting work", async ({ page, baseURL }, info) => {
  const writes: string[] = [], external: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL!).origin) {
      external.push(url.origin);
      return route.abort("blockedbyclient");
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: 409, json: { error: "Preview editing must not start work." } });
    }
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "fixture-owner", name: "Example owner", email: "owner@example.test", emailVerified: true,
        createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      session: { id: "fixture-session", userId: "fixture-owner", token: "non-secret-browser-fixture", expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (url.pathname === "/api/onboarding") return route.fulfill({ json: {
      state: { siteId: "fixture-site", audience: "", task: "", suiteId: null, competitorsSavedAt: null, baselineRequestedAt: null, completedAt: null },
      site: { id: "fixture-site", name: "Example website", url: "https://example.test" }, check: null, suite: null, competitors: [],
    } });
    if (["/api/search-console", "/api/github"].includes(url.pathname))
      return route.fulfill({ json: { configured: false, connected: false } });
    return route.fulfill({ status: 404, json: { error: "Unavailable in this browser fixture." } });
  });

  await page.goto("/start?step=4");
  await expect(page.getByRole("heading", { name: "Who should find you, and what do they need?" })).toBeVisible();
  const audience = page.getByRole("textbox", { name: "Customer group 1", exact: true });
  expect(await audience.evaluate(element => element.tagName)).toBe("TEXTAREA");
  expect(await audience.getAttribute("maxlength")).toBeNull();
  const initialHeight = await audience.evaluate(element => element.clientHeight);
  const task = page.getByLabel("What they want to do", { exact: true });
  const preview = page.locator(".ob-quote");
  const token = "collectfeedbackonprototypes".repeat(5).slice(0, 120);
  for (const scenario of [
    { name: "ordinary", audience: "small design teams", task: "compare prototype feedback across design teams and share clear decisions with clients before the next product release" },
    { name: "unbroken-task", audience: "small design teams", task: token },
    { name: "long-url", audience: "small design teams", task: `https://example.test/${"prototype-feedback".repeat(6)}`.slice(0, 120) },
    { name: "unbroken-customer-and-task", audience: "designteam".repeat(20), task: token },
    { name: "long-multiline-customer", audience: `  ${"design teams comparing prototypes\n".repeat(8)}\twith  international clients  `, task: token },
    { name: "shortened-customer", audience: "small teams", task: token },
  ]) {
    await test.step(scenario.name, async () => {
      await audience.fill(scenario.audience);
      await task.fill(scenario.task);
      await expect(audience).toHaveValue(scenario.audience);
      await expect(task).toHaveValue(scenario.task);
      await expect(preview.locator("mark").first()).toHaveText(scenario.audience.trim().replace(/\s+/g, " "));
      await expect.poll(() => audience.evaluate(element => {
        const style = getComputedStyle(element);
        return element.scrollHeight <= element.clientHeight + 1 ||
          (Math.abs(element.clientHeight - parseFloat(style.maxHeight)) <= 1 && style.overflowY === "auto");
      })).toBe(true);
      if (scenario.name === "long-multiline-customer") {
        expect(await audience.evaluate(element => {
          element.scrollTop = element.scrollHeight;
          return element.scrollHeight - element.clientHeight - element.scrollTop <= 1;
        })).toBe(true);
      }
      if (scenario.name === "long-multiline-customer")
        expect(await audience.evaluate(element => element.clientHeight)).toBeGreaterThan(initialHeight);
      if (scenario.name === "shortened-customer")
        expect(await audience.evaluate(element => element.clientHeight)).toBeLessThanOrEqual(initialHeight + 1);
      await expect(preview.locator("mark").last()).toHaveText(scenario.task);
      const bounds = await preview.evaluate(element => {
        const box = element.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(element);
        const rects = Array.from(range.getClientRects());
        return {
          left: box.left, right: box.right, bottom: box.bottom,
          textLeft: Math.min(...rects.map(rect => rect.left)),
          textRight: Math.max(...rects.map(rect => rect.right)),
          textBottom: Math.max(...rects.map(rect => rect.bottom)),
          width: element.clientWidth, scrollWidth: element.scrollWidth,
          viewportWidth: document.documentElement.clientWidth, pageWidth: document.documentElement.scrollWidth,
        };
      });
      expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left);
      expect(bounds.textRight).toBeLessThanOrEqual(bounds.right + 1);
      expect(bounds.textBottom).toBeLessThanOrEqual(bounds.bottom + 1);
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
      expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.viewportWidth + 1);
      if (scenario.name === "unbroken-task") {
        await task.press("Tab");
        await expect(page.getByRole("button", { name: "Draft my questions" })).toBeFocused();
        await page.screenshot({ path: info.outputPath("step-4-wrapped-preview.png"), fullPage: true, animations: "disabled" });
      }
    });
  }

  await task.press("End");
  await task.press("Backspace");
  await task.press("x");
  const edited = `${token.slice(0, -1)}x`;
  await expect(task).toHaveValue(edited);
  await expect(preview.locator("mark").last()).toHaveText(edited);
  expect(writes).toEqual([]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
