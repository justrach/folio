import { expect, test, type Page } from "@playwright/test";
import { publicIndexFixture } from "./public-index-fixture";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/public/benchmarks" ? publicIndexFixture : null }));
});
const openSearch = async (page: Page) => {
  await page.getByRole("button", { name: /Find anything/ }).click();
  const dialog = page.getByRole("dialog");
  return { dialog, field: dialog.getByRole("searchbox", { name: "Search Folio", exact: true }) };
};

for (const theme of ["light", "dark"] as const) {
  test(`search is a plain box that finds every page by the words people use, in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem("folio-dashboard-appearance", value), theme);
    await page.goto("/overview?view=demo");
    const { dialog, field } = await openSearch(page);
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("placeholder", "Search pages…");
    await expect(dialog.locator(".lbi-label")).toHaveCount(0);
    // Nothing typed: every page, including the ones the sidebar doesn't list.
    for (const name of ["Organizations", "Connect your agent", "API docs", "Settings", "Pricing"]) await expect(dialog.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    await expect(dialog.getByRole("status")).toContainText("Sign in to search your websites and reports too.");
    await field.fill("team");
    await expect(dialog.getByRole("link").first()).toHaveAccessibleName(/^Organizations/);
    await field.fill("mcp");
    await expect(dialog.getByRole("link").first()).toHaveAttribute("href", "/agents#connect");
    await field.fill("patch");
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await expect(dialog.getByRole("link", { name: /^Patch studio/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await field.fill("qqqq");
    await expect(dialog).toContainText("Nothing matches “qqqq”.");
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(page.getByRole("dialog").getByRole("searchbox", { name: "Search Folio" })).toBeFocused();
    // Enter opens the best match.
    await page.keyboard.type("pricing");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/pricing$/);
  });
}

test("signed in, typing a domain finds the website, its organization and its saved reports, and opening a report only reads it", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}${url.search}`);
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: { user: { id: "rach", name: "Rach Pradhan", email: "rach@example.test", emailVerified: true }, session: { id: "s", userId: "rach", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (url.pathname === "/api/workspace-search") return route.fulfill({ json: { index: {
      websites: [{ id: "site-manus", name: "manus.im", url: "https://manus.im/" }],
      seoReports: [{ id: "seo-1", domain: "manus.im", createdAt: "2026-11-10T00:00:00.000Z", complete: true }],
      searchConsole: [],
      organizations: [{ id: "org-1", name: "Manus", role: "owner", members: 2, domains: ["manus.im"] }],
    } } });
    if (url.pathname === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (request.method() !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: null });
  });
  await page.goto("/settings");
  const { dialog, field } = await openSearch(page);
  await expect(field).toHaveAttribute("placeholder", "Search pages, websites and reports…");
  await field.fill("manus");
  const links = dialog.getByRole("link");
  await expect(links.nth(0)).toHaveAttribute("href", "/orgs?org=org-1");
  await expect(links.nth(1)).toHaveAttribute("href", "/websites?site=site-manus");
  await expect(links.nth(2)).toHaveAttribute("href", "/search-data?report=seo-1");
  await expect(links.nth(2)).toContainText("Search & backlinks report");
  await expect(dialog.getByRole("status")).toContainText("matches");
  // Arrow keys move through the matches and back to the box.
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(field).toBeFocused();
  await field.fill("manus backlinks");
  await expect(links).toHaveCount(1);
  await links.first().click();
  await expect(page).toHaveURL(/\/search-data\?report=seo-1$/);
  await expect.poll(() => requests.includes("GET /api/seo-reports/seo-1")).toBe(true);
  expect(requests.filter(line => !line.startsWith("GET "))).toEqual([]);
});
