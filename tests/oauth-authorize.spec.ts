import { expect, test, type Page } from "@playwright/test";

const query = "response_type=code&client_id=folio_client_x&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&code_challenge=c&code_challenge_method=S256&state=s-1";
const preview = { client: { id: "folio_client_x", name: "Claude", uri: null, kind: "registered", host: null },
  redirect: { uri: "https://claude.ai/api/mcp/auth_callback", label: "claude.ai", local: false }, requested: ["read"],
  cancel: "https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s-1" };

async function setup(page: Page, options: { signedIn?: boolean; preview?: unknown; status?: number } = {}) {
  const state = { posts: [] as { path: string; body: Record<string, unknown> }[] };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: options.signedIn === false ? null
      : { user: { id: "rach", name: "Rach Pradhan", email: "rach@example.test", emailVerified: true }, session: { id: "s", userId: "rach", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (method === "POST" && url.pathname !== "/api/analytics") state.posts.push({ path: url.pathname, body: route.request().postDataJSON() });
    if (url.pathname === "/api/oauth/authorize" && method === "GET") {
      if (url.search.slice(1) !== query) return route.fulfill({ status: 400, json: { error: { message: "Unexpected request." }, page: true } });
      return route.fulfill({ status: options.status ?? 200, json: options.preview ?? preview });
    }
    if (url.pathname === "/api/oauth/authorize" && method === "POST")
      return route.fulfill({ json: { location: "https://claude.ai/api/mcp/auth_callback?code=folio_code_fixture&state=s-1", client: "Claude" } });
    if (url.pathname === "/api/organizations") return route.fulfill({ json: { organizations: [{ id: "org-manus", name: "Manus" }, { id: "org-cg", name: "Codegraff" }], joined: [] } });
    if (method !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: {} });
  });
  // The app's own address (registered last, so it wins over the /api/ fixture): where the browser is sent back to.
  await page.route("https://claude.ai/**", route => route.fulfill({ contentType: "text/html", body: "<title>Claude</title>Back in Claude" }));
  return state;
}
const approvals = (state: { posts: { path: string; body: Record<string, unknown> }[] }) => state.posts.filter(post => post.path === "/api/oauth/authorize").map(post => post.body);

test("an app's consent page names it, shows where it returns, and sends back the person's choice", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/oauth/authorize?${query}`);
  const card = page.getByRole("form", { name: "Connect Claude to Folio" });
  await expect(card).toContainText("Signed in as Rach Pradhan");
  await expect(card.locator(".cc-redirect")).toContainText("claude.ai");
  await expect(card.locator(".cc-redirect code")).toHaveText("https://claude.ai/api/mcp/auth_callback");
  await expect(card).toContainText("Registered itself");
  await expect(card).toContainText("Folio can’t confirm who made it");
  await expect(card.getByLabel("Connection name")).toHaveValue("Rach’s Claude");
  await expect(card.getByLabel("Lasts")).toContainText("90 days");
  await card.getByRole("radio", { name: "Select" }).click();
  await card.getByRole("button", { name: "Manus", exact: true }).click();
  await card.getByRole("button", { name: "Approve" }).click();
  await page.waitForURL(/^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?code=folio_code_fixture&state=s-1$/);
  await expect(page.locator("body")).toContainText("Back in Claude");
  expect(approvals(state)).toEqual([{ query, scopes: ["read"], organizations: ["org-manus"], name: "Rach’s Claude", expiresInDays: 90 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("Cancel tells the app no; an app Folio can't vouch for gets an explanation instead of a redirect", async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/oauth/authorize?${query}`);
  await page.getByRole("form", { name: "Connect Claude to Folio" }).getByRole("button", { name: "Cancel" }).click();
  await page.waitForURL(/error=access_denied&state=s-1$/);
  expect(approvals(state)).toEqual([]);

  const other = await page.context().newPage();
  await setup(other, { status: 400, preview: { error: { message: "This return address isn’t registered for the app, so Folio won’t send a sign-in there." }, page: true } });
  await other.goto(`/oauth/authorize?${query}`);
  // (Next.js's route announcer is also an alert, so the card is found by its class.)
  const problem = other.locator('.cc-card[role="alert"]');
  await expect(problem).toContainText("This app can’t connect");
  await expect(problem).toContainText("isn’t registered for the app");
  expect(other.url()).toContain("/oauth/authorize");
  await other.close();
});

test("someone signed out signs in first and comes back to the same request", async ({ page }) => {
  await setup(page, { signedIn: false });
  await page.goto(`/oauth/authorize?${query}`);
  await page.waitForURL(/\/login\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(`/oauth/authorize?${query}`);
});
