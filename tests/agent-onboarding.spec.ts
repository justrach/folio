import { expect, test, type Page } from "@playwright/test";

const at = "2026-11-11T09:00:00.000Z";
const token = `folio_v1_${"c".repeat(64)}`;
type Key = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
const key = (id: string, name: string, lastUsedAt: string | null, scopes = ["read"]): Key =>
  ({ id, name, prefix: "folio_v1_cccccccc", scopes, createdAt: at, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, lastUsedAt });

async function setup(page: Page, options: { signedIn?: boolean; keys?: Key[] } = {}) {
  const state = { keys: options.keys ?? [], posts: [] as { path: string; body: Record<string, unknown> }[], keyReads: 0 };
  // Record what the copy buttons put on the clipboard.
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.defineProperty(window, "__copied", { value: copied });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
  });
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
const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? null);
const currentStep = (page: Page) => page.locator('.ao-step[aria-current="step"] h3');

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
  await expect(currentStep(page)).toHaveText("Create a key for Cursor");
  await panel.getByRole("button", { name: "Create key" }).click();
  await expect(currentStep(page)).toHaveText("Add Folio to Cursor");

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
  await expect(currentStep(page)).toHaveText("Ask it something");

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
  await expect(panel).toContainText("Replace <your Folio key> with your key.");
  await panel.getByRole("button", { name: "Create key" }).click();
  await expect(panel.getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(panel).toContainText("Claude Desktop doesn’t read your terminal’s variables");
  // The config on screen keeps the placeholder; its copy carries the new key, ready to paste.
  await expect(panel.locator("pre").filter({ hasText: "mcp-remote" })).not.toContainText(token);
  await panel.getByRole("button", { name: "Copy with your key" }).click();
  expect(JSON.parse((await copied(page))!).mcpServers.folio.env.FOLIO_AUTH).toBe(`Bearer ${token}`);
  expect(keyPosts(state)).toHaveLength(1);
});

test("Manus, a cloud agent, gets the public address, a Bearer token to paste, and a prompt to check it", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await panel.getByRole("radio", { name: /Manus/ }).click();
  await expect(panel.getByRole("heading", { name: "Add Folio to Manus" })).toBeVisible();
  await expect(panel).toContainText("open Connectors, choose Create");
  // Manus's form, field by field. The page runs locally here, but Manus calls from the internet, so the URL is the public one.
  const fields = panel.locator(".ao-fields");
  await expect(fields.locator("dt")).toHaveText(["Server name", "Server URL", "Bearer token"]);
  await expect(fields.locator("div").filter({ hasText: "Server URL" }).locator("code")).toHaveText("https://usefolio.site/api/mcp");
  await expect(fields.locator("div").filter({ hasText: "Bearer token" })).toContainText("Paste the key from step 2");
  await expect(panel).toContainText("not the address this page is open on");
  await expect(panel).toContainText("hasn’t run them in a Manus account yet");
  await expect(panel.locator("figure").filter({ hasText: "Ask it in Manus" })).toContainText("call folio_organizations");
  await expect(panel.getByLabel("Key name")).toHaveValue("Rach’s Manus");
  await panel.getByRole("button", { name: "Create key" }).click();
  await expect(panel.locator(".ao-new-key").getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(panel).toContainText("Manus doesn’t read your terminal’s variables");
  // The token row now offers the key itself, masked on screen and whole in the copy.
  const tokenRow = fields.locator("div").filter({ hasText: "Bearer token" });
  await expect(tokenRow.locator("code")).toContainText("folio_v1_cccc•");
  await expect(tokenRow).not.toContainText(token);
  await tokenRow.getByRole("button", { name: "Copy key" }).click();
  expect(await copied(page)).toBe(token);
  await fields.locator("div").filter({ hasText: "Server URL" }).getByRole("button", { name: "Copy" }).click();
  expect(await copied(page)).toBe("https://usefolio.site/api/mcp");
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Manus", scopes: ["read"], expiresInDays: 30 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
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
