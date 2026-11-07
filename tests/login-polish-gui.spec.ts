import { openEmailLogin } from "./login-helpers";
import { expect, test } from "@playwright/test";

async function setup(page: import("@playwright/test").Page) {
  const state = { signedIn: false, signIns: 0, otherWrites: [] as string[], reject: true };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.fallback();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.signedIn ? { user: { id: "login-fixture", name: "Login fixture", email: "login@example.test", emailVerified: true }, session: { id: "fixture-session", userId: "login-fixture", token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (path === "/api/auth/sign-in/email") {
      state.signIns++;
      if (state.reject) return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Check your email and password." } });
      state.signedIn = true;
      return route.fulfill({ json: { redirect: false, token: "fixture", user: { id: "login-fixture", name: "Login fixture", email: "login@example.test", emailVerified: true } } });
    }
    if (route.request().method() !== "GET") { state.otherWrites.push(path); return route.fulfill({ status: 403, json: { error: "Unexpected write" } }); }
    return route.fulfill({ json: { configured: false, authorized: false, canRun: false, connected: false, sites: [], scans: [], runs: [], reports: [], suites: [] } });
  });
  return state;
}

test("login stays readable on a narrow phone and password/account controls do not submit", async ({ page }) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/login?next=%2Foverview%3Fview%3Dworkspace");
  await expect(page.getByRole("link", { name: "Folio home", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back.", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).not.toBeVisible();
  await openEmailLogin(page);
  await expect(page.getByLabel("Email address", { exact: true })).toBeFocused();
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("fixture-only-password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Other sign-in methods", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with email", exact: true })).toBeFocused();
  await expect(password).not.toBeVisible();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Create your account.", exact: true })).toBeVisible();
  await expect(page.getByLabel("Your name", { exact: true })).toBeVisible();
  await expect(password).toHaveAttribute("autocomplete", "new-password");
  expect(await page.getByLabel("Email address", { exact: true }).evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  expect(state.signIns).toBe(0); expect(state.otherWrites).toEqual([]);
});

test("login errors stay readable and successful email sign-in returns to the workspace", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/login?next=%2Foverview%3Fview%3Dworkspace");
  await openEmailLogin(page);
  await page.getByLabel("Email address", { exact: true }).fill("login@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check your email and password." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  state.reject = false;
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?view=workspace$/);
  await expect(page.getByRole("heading", { name: "My website results", exact: true })).toBeVisible();
  expect(state.signIns).toBe(2); expect(state.otherWrites).toEqual([]);
});


test("dark artwork and layered documentation follow the stored appearance", async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem("folio-dashboard-appearance", "dark"));
  for (const path of ["/login", "/", "/start"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-folio-theme", "dark");
    const pair = page.locator("img.theme-art-dark").first();
    await expect(pair).toHaveAttribute("src", /dark/);
    await expect(page.locator("img.theme-art-light").first()).not.toBeVisible();
    if (path === "/login") {
      await expect(pair).toBeVisible();
      await expect.poll(() => pair.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
  }
  await page.goto("/docs/api");
  const surfaces = await page.evaluate(() => [".api-docs-main", ".api-docs-nav", ".api-docs pre"].map(selector => getComputedStyle(document.querySelector(selector)!).backgroundColor));
  expect(new Set(surfaces).size).toBe(3);
});

test("login controls compress on press and respect reduced motion", async ({ page }) => {
  const state = await setup(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login");
  const choice = page.getByRole("button", { name: "Continue with email", exact: true });
  await choice.hover();
  await page.mouse.down();
  await expect.poll(() => choice.evaluate(node => getComputedStyle(node).transform)).not.toBe("none");
  await page.mouse.move(0, 0); await page.mouse.up();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choice.hover(); await page.mouse.down();
  await expect(choice).toHaveCSS("transform", "none");
  await page.mouse.move(0, 0); await page.mouse.up();
  expect(state.signIns).toBe(0); expect(state.otherWrites).toEqual([]);
});
