import { expect, test, type Page } from "@playwright/test";
import { websiteQuestionDrafts } from "../src/lib/website-question-drafts";

const audience = "small design teams", task = "collect feedback on prototypes";
const questions = websiteQuestionDrafts(audience, task);
const at = "2026-09-13T08:00:00.000Z";

async function fixture(page: Page, need = task) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ path, body: request.postDataJSON() });
      if (path === "/api/benchmarks" && request.method() === "POST") return route.fulfill({ json: { suite: {
        id: "fixture-suite", cases: (request.postDataJSON().questions as string[]).map((query, index) => ({ id: `case-${index}`, query })),
      } } });
      if (path === "/api/onboarding" && request.method() === "PUT") return route.fulfill({ json: {} });
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409, json: { error: "Provider work is forbidden in this fixture." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "fixture-owner", name: "Fixture owner", email: "owner@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "fixture-session", userId: "fixture-owner", token: "non-secret-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at },
    } });
    if (path === "/api/onboarding") return route.fulfill({ json: {
      state: { siteId: "fixture-site", audience, task: need, suiteId: null, competitorsSavedAt: null, baselineRequestedAt: null, completedAt: null },
      site: { id: "fixture-site", url: "https://example.test/", name: "Fixture site" }, check: null, suite: null, competitors: [],
    } });
    if (path === "/api/search-console" || path === "/api/github") return route.fulfill({ json: { configured: false, connected: false } });
    unexpected.push(`GET ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://*.googleapis.com/**"])
    await page.route(pattern, route => { unexpected.push("External provider request"); return route.abort(); });
  await page.goto("/start?step=5");
  await expect(page.getByRole("heading", { name: "Pick the questions your buyers ask." })).toBeVisible();
  return { writes, unexpected, errors };
}

async function dimensions(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector(".ob-side .ob-card")!.getBoundingClientRect();
    const copy = document.querySelector(".ob-copy")!.getBoundingClientRect();
    return { width: card.width, height: card.height, copyY: copy.top + scrollY,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
}

test("Step 5 scrolls all questions without expansion, obscured final text, layout shifts, or provider work", async ({ page }, info) => {
  const state = await fixture(page);
  const viewport = page.getByRole("region", { name: "Available questions" });
  const window = page.locator(".ob-question-window");
  await expect(viewport.getByRole("checkbox")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /Show .*more|Show fewer/i })).toHaveCount(0);
  await expect(window).toHaveAttribute("data-more-below", "true");
  const before = await dimensions(page);
  expect(before.overflow).toBeLessThanOrEqual(1);
  await viewport.screenshot({ path: info.outputPath("questions-scroll-cue.png") });
  expect(await window.evaluate(node => getComputedStyle(node, "::after").backdropFilter)).toContain("blur");

  if (info.project.name === "mobile") {
    // Exercise a real touch gesture, not just a programmatic scroll.
    await viewport.scrollIntoViewIfNeeded();
    const bounds = await viewport.boundingBox();
    const x = bounds!.x + bounds!.width / 2;
    const y = Math.min(page.viewportSize()!.height - 60, bounds!.y + bounds!.height - 60);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 35 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await cdp.detach();
  } else {
    await viewport.hover();
    await page.mouse.wheel(0, 220);
  }
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  // Touch flings continue on the compositor after touchEnd. Measure rows only
  // after that real gesture settles; the visibility assertions remain below.
  await viewport.evaluate(node => new Promise<void>(resolve => {
    let previous = node.scrollTop, still = 0;
    const frame = () => {
      const current = node.scrollTop;
      still = Math.abs(current - previous) < 0.1 ? still + 1 : 0;
      previous = current;
      if (still >= 3) resolve(); else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));


  // Every row can be brought wholly inside the viewport, without a permanent blur.
  for (const question of questions) {
    const row = viewport.locator("label").filter({ hasText: question });
    await row.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
    const fits = await row.evaluate(node => {
      const row = node.getBoundingClientRect(), view = node.closest(".ob-question-scroll")!.getBoundingClientRect();
      return row.top >= view.top - 1 && row.bottom <= view.bottom + 1 && getComputedStyle(node).filter === "none";
    });
    expect(fits).toBe(true);
  }
  await viewport.focus();
  await page.keyboard.press("End");
  await expect(window).toHaveAttribute("data-more-below", "false");
  const last = viewport.getByRole("checkbox", { name: questions[9], exact: true });
  await expect(last).toBeInViewport();
  expect(await window.evaluate(node => getComputedStyle(node, "::after").content)).toBe("none");
  await viewport.screenshot({ path: info.outputPath("questions-final-readable.png") });
  await last.check();
  await expect(page.getByText("6 of 10 selected", { exact: true })).toBeVisible();
  const after = await dimensions(page);
  expect(after).toEqual(before);
  expect(state.writes).toEqual([]);

  await page.keyboard.press("Home");
  await viewport.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBe(0);
  await expect(window).toHaveAttribute("data-more-below", "true");
  // Tabbing to a later checkbox scrolls its complete label out of the blur edge.
  await page.keyboard.press("Tab");
  for (let index = 1; index < questions.length; index++) await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
  await expect(window).toHaveAttribute("data-more-below", "false");

  await page.getByRole("button", { name: "Save 6 questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who do you want to watch?" })).toBeVisible();
  expect(state.writes).toEqual([
    { path: "/api/benchmarks", body: { name: "Website buyer questions", websiteId: "fixture-site", questions: [...questions.slice(0, 5), questions[9]], language: "English", locale: "United States" } },
    { path: "/api/onboarding", body: { suiteId: "fixture-suite" } },
  ]);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("Step 5 shows no scrolling cue when there are no draft questions", async ({ page }) => {
  const state = await fixture(page, "");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.locator(".ob-question-window")).toHaveAttribute("data-more-below", "false");
  await expect(page.getByRole("button", { name: "Save 0 questions", exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]);
  expect(state.unexpected).toEqual([]);
  expect(state.errors).toEqual([]);
});
