import { expect, test } from "@playwright/test";

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
  const audience = page.getByLabel("Your customers", { exact: true });
  const task = page.getByLabel("What they want to do", { exact: true });
  const preview = page.locator(".ob-quote");
  const token = "collectfeedbackonprototypes".repeat(5).slice(0, 120);
  for (const scenario of [
    { name: "ordinary", audience: "small design teams", task: "compare prototype feedback across design teams and share clear decisions with clients before the next product release" },
    { name: "unbroken-task", audience: "small design teams", task: token },
    { name: "long-url", audience: "small design teams", task: `https://example.test/${"prototype-feedback".repeat(6)}`.slice(0, 120) },
    { name: "unbroken-customer-and-task", audience: "designteam".repeat(6), task: token },
  ]) {
    await test.step(scenario.name, async () => {
      await audience.fill(scenario.audience);
      await task.fill(scenario.task);
      await expect(audience).toHaveValue(scenario.audience);
      await expect(task).toHaveValue(scenario.task);
      await expect(preview.locator("mark").first()).toHaveText(scenario.audience);
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
