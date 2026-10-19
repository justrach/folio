import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page) {
  const writes: string[] = [];
  const state = { owner: "navigation-owner", writes };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") {
      writes.push(path);
      return route.fulfill({ status: 409, json: { error: "Navigation cannot start work." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: state.owner, name: "Navigation fixture", email: "navigation@example.test" },
      session: { id: "navigation-session", userId: state.owner, expiresAt: "2099-01-01T00:00:00Z" },
    } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: [], templates: [], access: { configured: false, authorized: false, canRun: false, maxRunsPerDay: 6, maxActiveRuns: 1 }, usage: { attemptsLast24Hours: 0, remainingRuns: 6, activeRuns: 0, remainingActiveRuns: 1 } } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: [] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: false, connected: false } });
    if (path.endsWith("/reports")) return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ json: { configured: false, authorized: false, canRun: false, runs: [], suites: [], templates: [] } });
  });
  return state;
}
async function sidebar(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) await menu.click();
  return page.locator("aside.sidebar");
}

test("workspace begins with three destinations and reveals tools on request without starting work", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/websites");
  const nav = await sidebar(page);
  await expect(nav.getByRole("navigation", { name: "Main navigation", exact: true }).getByRole("link")).toHaveText(["My workspace", "My websites", "Questions"]);
  await expect(nav.getByRole("link", { name: "My websites", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "SEO health", exact: true })).toBeHidden();
  const tools = nav.getByRole("button", { name: "More tools", exact: true });
  await tools.focus();
  await page.keyboard.press("Enter");
  await expect(tools).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "Search Console", exact: true })).toBeVisible();
  await tools.click();
  await expect(nav.getByRole("link", { name: "Search Console", exact: true })).toBeHidden();
  await expect(nav.getByRole("link", { name: "Settings & connections", exact: true })).toBeVisible();
  await nav.getByRole("link", { name: "My workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?view=workspace$/);
  expect(state.writes).toEqual([]);
});

test("direct advanced links reveal their active destination on entry and refresh", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/search-console");
  for (let pass = 0; pass < 2; pass++) {
    const nav = await sidebar(page);
    await expect(nav.getByRole("button", { name: "More tools", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Search Console", exact: true })).toHaveAttribute("aria-current", "page");
    if (pass === 0) await page.reload();
  }
  expect(state.writes).toEqual([]);
});

test("another owner starts with tools closed and legacy questions keep one primary destination", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/websites");
  let nav = await sidebar(page);
  await nav.getByRole("button", { name: "More tools", exact: true }).click();
  state.owner = "another-navigation-owner";
  await page.reload();
  nav = await sidebar(page);
  await expect(nav.getByRole("button", { name: "More tools", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.goto("/benchmarks");
  nav = await sidebar(page);
  await expect(nav.getByRole("link", { name: "Questions", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Keyword evaluations", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
