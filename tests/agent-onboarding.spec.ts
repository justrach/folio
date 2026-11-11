import { expect, test, type Page } from "@playwright/test";

const at = "2026-11-11T09:00:00.000Z";
const token = `folio_v1_${"c".repeat(64)}`;
type Key = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
const key = (id: string, name: string, lastUsedAt: string | null, scopes = ["read"]): Key =>
  ({ id, name, prefix: "folio_v1_cccccccc", scopes, createdAt: at, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, lastUsedAt });

async function setup(page: Page, options: { signedIn?: boolean; keys?: Key[] } = {}) {
  const state = { keys: options.keys ?? [], posts: [] as { path: string; body: Record<string, unknown> }[], keyReads: 0 };
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: options.signedIn === false ? null
      : { user: { id: "rach", name: "Rach Pradhan", email: "rach@example.test", emailVerified: true }, session: { id: "s", userId: "rach", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (method === "POST" && url.pathname !== "/api/analytics") state.posts.push({ path: url.pathname, body: route.request().postDataJSON() });
    if (url.pathname === "/api/agent-keys" && method === "GET") { state.keyReads++; return route.fulfill({ json: { keys: state.keys } }); }
    if (url.pathname === "/api/agent-keys" && method === "POST") {
      const body = route.request().postDataJSON() as { name: string; scopes: string[] };
      const created = key("new-key", body.name, null, body.scopes); state.keys = [created, ...state.keys];
      return route.fulfill({ status: 201, json: { key: created, token } });
    }
    if (url.pathname === "/api/sites") return route.fulfill({ json: { sites: [{ id: "site-manus", name: "manus.im", url: "https://manus.im/", createdAt: at, isPublic: false }] } });
    if (method !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: {} });
  });
  return state;
}
const keyPosts = (state: { posts: { path: string; body: Record<string, unknown> }[] }) => state.posts.filter(post => post.path === "/api/agent-keys");

test("a person picks their agent, creates its key without seeing it on screen, and sees it connect", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents#connect");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await expect(panel).toContainText("It reads your saved websites");
  // Claude Code is the default: one command, plus a .mcp.json the team can commit.
  await expect(panel.locator("pre").first()).toContainText('claude mcp add --transport http --scope user folio');
  await expect(panel.locator("pre").first()).toContainText('Authorization: Bearer $FOLIO_API_KEY');
  await expect(panel).toContainText("/mcp__folio__improve_aeo");

  await panel.getByRole("radio", { name: /Cursor/ }).click();
  await expect(panel.getByRole("heading", { name: "Add Folio to Cursor" })).toBeVisible();
  await expect(panel.locator("figcaption").filter({ hasText: ".cursor/mcp.json" })).toHaveCount(1);
  await expect(panel).toContainText("Bearer ${env:FOLIO_API_KEY}");
  await expect(panel).toContainText("cursor-agent mcp list-tools folio");
  await expect(panel.getByLabel("Key name")).toHaveValue("Rach’s Cursor");
  await expect(panel.getByRole("checkbox", { name: /Read · always included/ })).toBeDisabled();
  await panel.getByRole("checkbox", { name: /Record changes/ }).check();
  await expect(panel.getByText("Connection status")).toBeVisible();
  await panel.getByRole("button", { name: "Create key" }).click();

  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Cursor", scopes: ["read", "changes"], expiresInDays: 30 }]);
  const secret = panel.getByLabel("Your new key");
  await expect(secret).toContainText('export FOLIO_API_KEY="folio_v1_cccc');
  await expect(secret).not.toContainText(token);
  await panel.getByRole("button", { name: "Show" }).click();
  await expect(secret).toContainText(token);
  await panel.getByRole("button", { name: "Hide" }).click();
  await expect(secret).not.toContainText(token);
  await expect(panel.getByRole("button", { name: "Copy export line" })).toBeVisible();

  // The status waits for the first call and turns green by itself when the key is used.
  await expect(panel.getByText("Waiting for Rach’s Cursor")).toBeVisible();
  state.keys = state.keys.map(item => item.id === "new-key" ? { ...item, lastUsedAt: new Date().toISOString() } : item);
  await expect(panel.locator(".ao-status")).toContainText("Connected", { timeout: 12_000 });
  await expect(panel.locator(".ao-status")).toContainText("Rach’s Cursor");
  await expect(panel.locator(".ao-status")).toContainText("used just now");

  // Prompts adapt to the first saved website, and the references open.
  await expect(panel.locator(".ao-prompt")).toHaveCount(4);
  await expect(panel.locator(".ao-prompt").first()).toContainText("What is manus.im missing?");
  await panel.getByText("What your agent can do with each permission").click();
  await expect(panel.locator(".ao-permissions li").filter({ hasText: "Paid search lookups" })).toContainText("Can charge");
  await expect(panel.locator(".ao-permissions")).toContainText("folio_seo_lookup");
  await panel.getByText("If it doesn’t connect").click();
  await expect(panel.locator(".ao-trouble")).toContainText("Untrusted MCP origin");
  expect(keyPosts(state)).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("clients that ignore shell variables say where to paste the key", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await panel.getByRole("radio", { name: /Claude Desktop/ }).click();
  await expect(panel).toContainText("mcp-remote");
  await expect(panel).toContainText("Bearer <your Folio key>");
  await panel.getByRole("button", { name: "Create key" }).click();
  await expect(panel.getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(panel).toContainText("Claude Desktop doesn’t read your terminal’s variables");
  expect(keyPosts(state)).toHaveLength(1);
});

test("someone with a connected agent sees a compact entry; signed-out visitors still see the setup", async ({ page }) => {
  await setup(page, { keys: [key("k1", "Rach’s Claude Code", new Date().toISOString())] });
  await page.goto("/agents");
  const compact = page.locator("details.agent-onboarding");
  await expect(compact).toContainText("Connect another agent");
  await expect(compact).toContainText("Last: Rach’s Claude Code, used just now");
  await compact.locator(":scope > summary").click();
  await expect(compact.locator(".ao-status")).toContainText("Connected");

  const visitor = await page.context().newPage();
  const state = await setup(visitor, { signedIn: false });
  await visitor.goto("/agents");
  const panel = visitor.getByRole("region", { name: "Connect your agent" });
  await expect(panel.getByRole("link", { name: "Sign in to create one" })).toHaveAttribute("href", "/login?next=%2Fagents");
  await expect(panel.locator("pre").first()).toContainText("/api/mcp");
  expect(state.keyReads).toBe(0);
  await visitor.close();
});
