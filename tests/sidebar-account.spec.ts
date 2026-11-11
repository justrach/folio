import { expect, test, type Page } from "@playwright/test";

// ILLUSTRATIVE BROWSER FIXTURE: every API is intercepted; writes other than sign-out are refused.
const at = "2026-11-11T09:00:00.000Z";
const organizations = [{ id: "org-manus", name: "Manus", role: "member", members: 4, websites: 2, createdAt: at }, { id: "org-cg", name: "Codegraff", role: "owner", members: 2, websites: 1, createdAt: at }];
type Done = { website: boolean; "search-console": boolean; agent: boolean; ask: boolean; team: boolean };
const some: Done = { website: true, "search-console": false, agent: false, ask: false, team: true };

async function setup(page: Page, options: { signedIn?: boolean; done?: Done } = {}) {
  const state = { posts: [] as string[], progressReads: 0, organizationReads: 0, done: options.done ?? some };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: options.signedIn === false ? null
      : { user: { id: "rach", name: "Rach Pradhan", email: "rach@example.test", emailVerified: true }, session: { id: "s", userId: "rach", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (method === "POST" && url.pathname !== "/api/analytics") state.posts.push(url.pathname);
    if (url.pathname === "/api/auth/sign-out") return route.fulfill({ json: { success: true } });
    if (url.pathname === "/api/getting-started") { state.progressReads++; return route.fulfill({ json: { progress: { done: state.done } } }); }
    if (url.pathname === "/api/organizations") { state.organizationReads++; return route.fulfill({ json: { organizations, joined: [] } }); }
    if (url.pathname === "/api/agent-keys") return route.fulfill({ json: { keys: [] } });
    if (method !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: {} });
  });
  return state;
}
/** On phones the sidebar is a drawer; open it first (retrying until the page has hydrated and the drawer is open). */
async function sidebar(page: Page) {
  if (page.viewportSize()!.width > 760) return;
  const menu = page.getByRole("button", { name: "Open navigation" });
  await expect(async () => {
    await menu.click();
    await expect(page.locator(".sidebar.open")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test("the account menu holds settings, inviting, agents, the theme and sign-out, then the person's organizations", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  await sidebar(page);
  const trigger = page.getByRole("button", { name: "Account: Rach Pradhan" });
  await expect(trigger).toContainText("rach@example.test");
  // The theme moved into this menu, so the floating picker no longer covers the workspace.
  await expect(page.locator(".folio-theme-picker")).toBeHidden();
  // /agents loads organizations for its consent card; the menu adds one read of its own, when it first opens.
  const before = state.organizationReads;
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(".am-panel");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Settings & connections" })).toHaveAttribute("href", "/settings");
  await expect(menu.getByRole("link", { name: "Connect your agent" })).toHaveAttribute("href", "/agents#connect");
  // Organizations load when the menu opens; invites go to one the person owns.
  await expect(menu.getByRole("link", { name: "Invite members" })).toHaveAttribute("href", "/orgs?org=org-cg");
  await expect(menu.locator(".am-org")).toHaveText([/Manus.*Member/, /Codegraff.*Owner/]);
  await expect(menu.getByRole("link", { name: /Manus/ })).toHaveAttribute("href", "/orgs?org=org-manus");
  expect(state.organizationReads).toBe(before + 1);
  const box = await menu.boundingBox(), width = page.viewportSize()!.width;
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  // Nothing inside is wider than the menu (a too-wide row once clipped the roles and the theme switch).
  expect(await menu.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  // Appearance: one choice for the whole site, remembered.
  const appearance = menu.getByRole("radiogroup", { name: "Appearance" });
  await appearance.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
  await expect(appearance.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("folio-dashboard-appearance"))).toBe("dark");
  await appearance.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "light");

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await Promise.all([page.waitForURL(/\/login$/), menu.getByRole("button", { name: "Sign out" }).click()]);
  expect(state.posts).toEqual(["/api/auth/sign-out"]);
});

test("Getting started shows real progress, opens the checklist at the next step, and can be hidden and brought back", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  await sidebar(page);
  const pill = page.getByRole("button", { name: "Getting started, 2 of 5 steps done" });
  await expect(pill).toContainText("2/5");
  await pill.click();
  const card = page.getByRole("dialog", { name: "Getting started" });
  await expect(card).toContainText("2/5 steps complete");
  await expect(card.locator(".gs-step.is-done")).toHaveText([/Add your website/, /Bring in your team/]);
  const next = card.locator('.gs-step[aria-current="step"]');
  await expect(next).toContainText("Connect Search Console");
  await expect(next).toContainText("Bring in Google’s own clicks");
  await expect(card.getByRole("link", { name: "Next: Connect Search Console" })).toHaveAttribute("href", "/search-console");
  const box = await card.boundingBox(), viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  // Hiding it moves it into the account menu, from where it comes back.
  await card.getByRole("button", { name: /Hide this list/ }).click();
  await expect(pill).toBeHidden();
  await page.getByRole("button", { name: "Account: Rach Pradhan" }).click();
  await page.locator(".am-panel").getByRole("button", { name: "Show getting started" }).click();
  await expect(pill).toBeVisible();

  // When every step is done, Finish puts it away for good.
  state.done = { website: true, "search-console": true, agent: true, ask: true, team: true };
  await pill.click();
  await expect(card).toContainText("You’re all set");
  await expect(card).toContainText("5/5 steps complete");
  await card.getByRole("button", { name: "Finish" }).click();
  await expect(page.locator(".gs-pill")).toHaveCount(0);
  await page.getByRole("button", { name: "Account: Rach Pradhan" }).click();
  await expect(page.locator(".am-panel")).toBeVisible();
  await expect(page.locator(".am-panel").getByRole("button", { name: "Show getting started" })).toHaveCount(0);
  expect(state.posts).toEqual([]);
});

test("signed out, the menu offers sign-in and the theme, and there is no checklist", async ({ page }) => {
  const state = await setup(page, { signedIn: false });
  await page.goto("/agents");
  await sidebar(page);
  await expect(page.locator(".gs-pill")).toHaveCount(0);
  await page.locator(".account-menu-trigger").click();
  const menu = page.locator(".am-panel");
  await expect(menu.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(menu.getByRole("radiogroup", { name: "Appearance" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await expect(menu.locator(".am-orgs")).toHaveCount(0);
  expect(state.progressReads).toBe(0);
});
