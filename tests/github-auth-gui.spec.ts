import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE } from "../src/lib/evals";

async function fixture(page: Page, owner: string | null = null) {
  const state = { owner, configured: true, connected: false, posts: [] as { path: string; body: Record<string, unknown> }[], forbidden: [] as string[] };
  const user = () => ({ id: state.owner!, name: state.owner!, email: `${state.owner}@example.test`, emailVerified: true, createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" });
  const connection = { configured: false, authorized: false, canRun: false, allowedTargets: [], message: "Fixture: provider work disabled." };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? {
      user: user(), session: { id: `fixture-${state.owner}`, userId: state.owner, token: "fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-09-13T00:00:00Z", updatedAt: "2026-09-13T00:00:00Z" },
    } : null });
    if (method === "POST" && ["/api/auth/sign-in/social", "/api/auth/link-social", "/api/auth/sign-out", "/api/auth/sign-in/email"].includes(path)) {
      state.posts.push({ path, body: route.request().postDataJSON() ?? {} });
      if (path === "/api/auth/sign-out") state.owner = null;
      if (path === "/api/auth/sign-in/email") { state.owner = "bob"; state.connected = false; }
      return route.fulfill({ json: { success: true, redirect: false, ...(state.owner ? { user: user(), token: "fixture" } : {}) } });
    }
    if (method !== "GET") { state.forbidden.push(`${method} ${path}`); return route.fulfill({ status: 403, json: { error: "Provider writes forbidden" } }); }
    if (path === "/api/github") return route.fulfill({ json: { configured: state.configured, signedIn: !!state.owner, connected: !!state.owner && state.connected } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: true, signedIn: !!state.owner, connected: false } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [], connection, suite: EVAL_SUITE } });
    if (path === "/api/agents/status") return route.fulfill({ json: connection });
    return route.fulfill({ json: { sites: [], scans: [], runs: [], reports: [], suites: [], ...connection } });
  });
  for (const url of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://github.com/**", "https://api.github.com/**"]) {
    await page.route(url, route => { state.forbidden.push("External provider request"); return route.abort(); });
  }
  return state;
}

test("GitHub sign-in is explicit and preserves the validated evaluation return", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/login?next=%2Fevaluations%3Fview%3Dsearch%26suite%3Dfixture-suite");
  const button = page.getByRole("button", { name: "Sign in with GitHub", exact: true });
  await expect(button).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  expect(state.posts).toEqual([]);
  await button.click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({ path: "/api/auth/sign-in/social", body: { provider: "github", callbackURL: "/evaluations?view=search&suite=fixture-suite", errorCallbackURL: "/login?error=github" } });
  expect(state.posts[0].body.scopes).toBeUndefined();
  expect(state.forbidden).toEqual([]);
});

test("Settings links GitHub only after a click and displays the saved connection", async ({ page }) => {
  const state = await fixture(page, "alice");
  await page.goto("/settings");
  const row = page.locator('[aria-label="GitHub account"]');
  await expect(row.getByRole("button", { name: "Connect GitHub", exact: true })).toBeVisible();
  expect(state.posts).toEqual([]);
  await row.getByRole("button", { name: "Connect GitHub", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({ path: "/api/auth/link-social", body: { provider: "github", callbackURL: "/settings", errorCallbackURL: "/settings?connection=github-error" } });
  expect(state.posts[0].body.scopes).toBeUndefined();
  state.connected = true;
  await page.reload();
  await expect(row.getByText("Connected for sign-in", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: "Connect GitHub", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  expect(state.forbidden).toEqual([]);
});

test("Unconfigured GitHub offers no broken OAuth action", async ({ page }) => {
  const state = await fixture(page, "alice"); state.configured = false;
  await page.goto("/settings");
  await expect(page.getByText("GitHub sign-in is not configured yet.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect GitHub", exact: true })).toHaveCount(0);
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with GitHub", exact: true })).toHaveCount(0);
  expect(state.posts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("GitHub connected state clears on logout and another account does not inherit it", async ({ page }) => {
  const state = await fixture(page, "alice"); state.connected = true;
  await page.goto("/settings");
  await expect(page.getByText("Connected for sign-in", { exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Connected for sign-in", { exact: true })).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Connect GitHub", exact: true })).toBeVisible();
  await expect(page.getByText("Connected for sign-in", { exact: true })).toHaveCount(0);
  expect(state.posts.some(post => post.path === "/api/auth/link-social")).toBe(false);
  expect(state.forbidden).toEqual([]);
});
