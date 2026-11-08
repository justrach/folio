import { expect, test } from "@playwright/test";
import { evaluationSummary } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

for (const surface of [
  { path: "/evaluations?view=page", button: "Load older evaluations", list: ".eval-history-list" },
  { path: "/agents", button: "Load older sessions", list: ".agent-task-list" },
]) {
  test(`${surface.path} loads older history, retries reads, and preserves pages during polling`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const demo = await createDemoEvaluationRun();
    const recent = { ...demo, id: "history-recent", siteName: "Recent saved evaluation" };
    const older = { ...demo, id: "history-older", siteName: "Older saved evaluation" };
    let failOlder = true;
    let historyReads = 0;
    const writes: string[] = [];
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== "GET") {
        writes.push(`${request.method()} ${url.pathname}`);
        return route.fulfill({ status: 403, json: { error: "No writes authorized in history fixture." } });
      }
      if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: {
        user: { id: "history-owner", email: "history@example.test", name: "History reviewer", emailVerified: true },
        session: { id: "history-session", userId: "history-owner", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" },
      } });
      if (url.pathname === "/api/evaluations") {
        historyReads++;
        if (url.searchParams.has("cursor") && failOlder)
          return route.fulfill({ status: 503, json: { error: "History temporarily unavailable." } });
        const cursor = url.searchParams.get("cursor");
        expect(cursor === null || cursor === "older-page").toBe(true);
        return route.fulfill({ json: {
          runs: [evaluationSummary(cursor ? older : recent)], nextCursor: cursor ? null : "older-page",
          connection: { configured: false, canRun: false, message: "Fixture", allowedTargets: [] },
        } });
      }
      if (url.pathname.startsWith("/api/evaluations/")) return route.fulfill({ json: {
        run: url.pathname.endsWith(older.id) ? older : recent,
      } });
      return route.fulfill({ json: { reports: [], scans: [], sites: [], suites: [], runs: [] } });
    });
    await page.goto(surface.path);
    await expect(page).toHaveURL(surface.path);
    const list = page.locator(surface.list);
    await expect(list.getByText(recent.siteName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: surface.button, exact: true }).click();
    await expect(page.locator(".eval-alert[role=alert]")).toContainText("History temporarily unavailable.");
    await expect(list.getByText(recent.siteName, { exact: true })).toBeVisible();
    failOlder = false;
    await page.getByRole("button", { name: surface.button, exact: true }).click();
    await expect(list.getByText(older.siteName, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: surface.button, exact: true })).toHaveCount(0);
    const before = historyReads;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => historyReads).toBeGreaterThanOrEqual(before + 2);
    await expect(list.getByText(recent.siteName, { exact: true })).toHaveCount(1);
    await expect(list.getByText(older.siteName, { exact: true })).toHaveCount(1);
    await list.getByRole("button", { name: new RegExp(older.siteName) }).click();
    await expect(page).toHaveURL(/run=history-older/);
    await expect(page.getByRole("heading", { name: older.siteName, exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
