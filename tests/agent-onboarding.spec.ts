import { expect, test, type Page } from "@playwright/test";
import { selectValue } from "./select-helpers";

const at = "2026-11-11T09:00:00.000Z";
const token = `folio_v1_${"c".repeat(64)}`;
type Key = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; connection?: "key" | "sign-in" };
const key = (id: string, name: string, lastUsedAt: string | null, scopes = ["read"], connection?: "key" | "sign-in"): Key =>
  ({ id, name, prefix: "folio_v1_cccccccc", scopes, createdAt: at, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, lastUsedAt, ...(connection ? { connection } : {}) });
type Site = { id: string; name: string; url: string; createdAt: string; isPublic: boolean };
const site = (id: string, domain: string): Site => ({ id, name: domain, url: `https://${domain}/`, createdAt: at, isPublic: false });
/** The parts of the saved report (/api/sites/[id]/visibility) the prompts read; illustrative values. */
const report = (domain: string, input: { crawled: boolean; namedIn: number; nearPageOne: boolean }) => ({ website: { id: "x", name: domain, url: `https://${domain}/`, domain, access: "owner", organizations: [] },
  crawl: { state: input.crawled ? "in_index" : "not_in_index", pagesCrawled: input.crawled ? 40 : 0, inventoryPages: null, lastFetchedAt: null, topSections: [] },
  aiAnswers: { namedIn: input.namedIn, citedIn: 0, related: { total: 0, published: 0 }, yourQuestions: { completed: 2, named: 0 } },
  gaps: input.nearPageOne ? [{ id: "google-near-page-one" }] : [{ id: "google-no-rankings" }] });

const organizations = [{ id: "org-manus", name: "Manus", role: "member", members: 4, websites: 2, createdAt: at }, { id: "org-other", name: "Other client", role: "owner", members: 2, websites: 1, createdAt: at }];

const people: Record<string, { name: string; email: string }> = { rach: { name: "Rach Pradhan", email: "rach@example.test" }, bob: { name: "Bob Example", email: "bob@example.test" } };
/** Better Auth's cross-tab session notice: the page re-reads the session (here, whoever `state.owner` names) without a real sign-in. */
const signalOwnerChange = (page: Page) => page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "better-auth.message",
  newValue: JSON.stringify({ event: "session", data: { trigger: "getSession" }, timestamp: Date.now() }) })));

async function setup(page: Page, options: { signedIn?: boolean; keys?: Key[]; organizations?: typeof organizations; sites?: Site[]; reports?: Record<string, unknown>;
  bob?: { keys: Key[]; sites: Site[] } } = {}) {
  let release = () => {};
  const state = { keys: options.keys ?? [], posts: [] as { path: string; body: Record<string, unknown> }[], keyReads: 0, gets: [] as string[],
    owner: options.signedIn === false ? null as string | null : "rach",
    /** While set, Rach's key listings wait for release(); `held` and `settled` count them. */
    holdRachKeys: false, held: 0, settled: 0, release: () => release() };
  const gate = () => new Promise<void>(resolve => { const previous = release; release = () => { previous(); resolve(); }; });
  // Record what the copy buttons put on the clipboard, and the app links (cursor:, vscode:) the install buttons open.
  await page.addInitScript(() => {
    const copied: string[] = [], opened: string[] = [];
    Object.defineProperty(window, "__copied", { value: copied });
    Object.defineProperty(window, "__opened", { value: opened });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { copied.push(text); } } });
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (/^https?:/.test(this.href)) return click.call(this); opened.push(this.href); };
  });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method();
    // Who is signed in when the request is made, as the server would know from the cookie.
    const owner = state.owner;
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: owner === null ? null
      : { user: { id: owner, ...people[owner], emailVerified: true }, session: { id: `s-${owner}`, userId: owner, expiresAt: "2099-01-01T00:00:00Z" } } });
    if (method === "POST" && url.pathname !== "/api/analytics") state.posts.push({ path: url.pathname, body: route.request().postDataJSON() });
    if (method === "GET" && url.pathname !== "/api/auth/get-session") state.gets.push(url.pathname);
    if (url.pathname === "/api/agent-keys" && method === "GET") {
      state.keyReads++;
      if (owner === "bob") return route.fulfill({ json: { keys: options.bob?.keys ?? [] } });
      if (state.holdRachKeys) {
        state.held++; await gate();
        // The page may have aborted it; either way it was answered late, for Rach.
        await route.fulfill({ json: { keys: state.keys } }).catch(() => undefined); state.settled++; return;
      }
      return route.fulfill({ json: { keys: state.keys } });
    }
    if (url.pathname === "/api/agent-keys" && method === "POST") {
      const body = route.request().postDataJSON() as { name: string; scopes: string[] };
      const created = key("new-key", body.name, null, body.scopes); state.keys = [created, ...state.keys];
      return route.fulfill({ status: 201, json: { key: created, token } });
    }
    if (url.pathname === "/api/sites") return route.fulfill({ json: { sites: owner === "bob" ? options.bob?.sites ?? [] : options.sites ?? [site("site-manus", "manus.im")] } });
    const visibility = url.pathname.match(/^\/api\/sites\/([^/]+)\/visibility$/);
    if (visibility && options.reports) {
      const found = options.reports[visibility[1]];
      return found === undefined ? route.fulfill({ status: 500, json: { error: { message: "Fixture failure." } } }) : route.fulfill({ json: { report: found } });
    }
    if (url.pathname === "/api/organizations" && method === "GET") return route.fulfill({ json: { organizations: options.organizations ?? organizations, joined: [] } });
    if (url.pathname === "/api/auth/sign-out") return route.fulfill({ json: { success: true } });
    if (method !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: {} });
  });
  return state;
}
const keyPosts = (state: { posts: { path: string; body: Record<string, unknown> }[] }) => state.posts.filter(post => post.path === "/api/agent-keys");
const copied = (page: Page) => page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? null);
const opened = (page: Page) => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
const currentStep = (page: Page) => page.locator('.ao-step[aria-current="step"] h3');
const card = (page: Page, client: string) => page.getByRole("form", { name: `Connect ${client} to Folio` });

test("a person picks their agent, approves it on the consent card, adds it in one step, and sees it connect", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents#connect");
  const origin = new URL(page.url()).origin;
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await expect(panel).toContainText("It reads your saved websites");
  // Claude Code is the default. Its one-paste command waits for a key; by hand, one command plus a .mcp.json the team can commit.
  await expect(panel.locator(".ao-install").getByRole("button", { name: "Copy command" })).toBeDisabled();
  await expect(panel).toContainText("This becomes one command with the key already in it.");
  // One website: the prompts name it, with no picker.
  await expect(panel.getByLabel("Website the prompts are about")).toHaveCount(0);
  const byHand = panel.locator("details.ao-manual");
  await expect(byHand.locator("pre").first()).toContainText("claude mcp add --transport http --scope user folio");
  await expect(byHand.locator("pre").first()).toContainText("Authorization: Bearer $FOLIO_API_KEY");
  await expect(panel).toContainText("/mcp__folio__improve_aeo");

  await panel.getByRole("radio", { name: /Cursor/ }).click();
  await expect(panel.getByRole("heading", { name: "Add Folio to Cursor" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add to Cursor" })).toBeDisabled();
  await expect(byHand.locator("figcaption").filter({ hasText: ".cursor/mcp.json" })).toHaveCount(1);
  await expect(panel).toContainText("Bearer ${env:FOLIO_API_KEY}");
  await expect(panel).toContainText("cursor-agent mcp list-tools folio");

  // The consent card: who is asking, which account, what it may do, which organizations' websites.
  const consent = card(page, "Cursor");
  await expect(consent).toContainText("Signed in as Rach Pradhan");
  await expect(consent.getByLabel("Key name")).toHaveValue("Rach’s Cursor");
  await expect(consent.getByRole("radio", { name: "Read only" })).toHaveAttribute("aria-checked", "true");
  await expect(consent).toContainText("Changes nothing on your websites. Folio lists what it asked under What your agents asked");
  await consent.getByRole("radio", { name: "Read & record changes" }).click();
  await expect(consent).toContainText("Save what it changed on your websites");
  await expect(consent).not.toContainText("Changes nothing on your websites");
  await expect(consent).toContainText("Websites shared in every organization you’re in, now and later, plus your own.");
  await consent.getByRole("radio", { name: "Select" }).click();
  await expect(consent).toContainText("Only your own websites.");
  const manus = consent.getByRole("button", { name: "Manus", exact: true });
  await manus.click();
  await expect(manus).toHaveAttribute("aria-pressed", "true");
  await expect(consent.getByRole("button", { name: "Other client", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(consent).toContainText("Websites shared in the ones you picked, plus your own.");
  await expect(panel.getByText("Connection status")).toBeVisible();
  await expect(currentStep(page)).toHaveText("Approve access for Cursor");
  await consent.getByRole("button", { name: "Approve" }).click();
  await expect(currentStep(page)).toHaveText("Add Folio to Cursor");
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Cursor", scopes: ["read", "changes"], expiresInDays: 30, organizations: ["org-manus"] }]);

  // Approved: the card says what's next, and the key stays masked unless asked for.
  const done = panel.locator(".cc-card.is-done");
  await expect(done).toContainText("Rach’s Cursor is approved");
  await expect(done).toContainText("The key is shown only now; copy it before you leave this page.");
  await expect(done).toContainText("Next, press Add to Cursor in step 3.");
  const secret = panel.getByLabel("Your new key");
  await expect(secret).toContainText('export FOLIO_API_KEY="folio_v1_cccc');
  await expect(secret).not.toContainText(token);
  await panel.getByRole("button", { name: "Show" }).click();
  await expect(secret).toContainText(token);
  await panel.getByRole("button", { name: "Hide" }).click();
  await expect(secret).not.toContainText(token);
  await expect(done.getByRole("button", { name: "Copy command" })).toBeVisible();
  await expect(done).toContainText("This command contains your key. Paste it into a terminal, never into a chat with an agent.");

  // Add to Cursor hands Cursor the server and the key in one link; the page itself never shows the key.
  await panel.getByRole("button", { name: "Add to Cursor" }).click();
  const links = await opened(page);
  expect(links).toHaveLength(1);
  expect(links[0].startsWith("cursor://anysphere.cursor-deeplink/mcp/install?name=folio&config=")).toBe(true);
  expect(JSON.parse(Buffer.from(new URL(links[0]).searchParams.get("config")!, "base64").toString("utf8")))
    .toEqual({ url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${token}` } });
  await expect(panel).not.toContainText(token);
  await expect(panel.locator(".ao-install")).toContainText("This button hands your key to Cursor. Don’t paste the link into a chat with an agent.");

  // The status waits for the first call and turns green by itself when the key is used.
  await expect(panel.getByText("Waiting for Rach’s Cursor")).toBeVisible();
  state.keys = state.keys.map(item => item.id === "new-key" ? { ...item, lastUsedAt: new Date().toISOString() } : item);
  await expect(panel.locator(".ao-status")).toContainText("Connected", { timeout: 12_000 });
  await expect(panel.locator(".ao-status")).toContainText("Rach’s Cursor");
  await expect(panel.locator(".ao-status")).toContainText("used just now");
  await expect(done).toContainText("Cursor is connected");
  await expect(done).toContainText("It can now read your websites through Folio.");
  // The key is still on screen, so the warning stays after the first call.
  await expect(done).toContainText("The key is shown only now; copy it before you leave this page.");
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

test("Claude Code gets one command with the key in it, paid actions are opt-in, and VS Code's link holds no key", async ({ page }) => {
  const state = await setup(page, { organizations: [] });
  await page.goto("/agents");
  const origin = new URL(page.url()).origin;
  const panel = page.getByRole("region", { name: "Connect your agent" });
  const consent = card(page, "Claude Code");
  // Someone in no organization reads their own websites; there's nothing to pick.
  await expect(consent).toContainText("You’re not in an organization yet");
  await expect(consent.getByRole("radio", { name: "Select" })).toHaveCount(0);
  // Paid actions stay folded away, and say they charge when chosen.
  await consent.getByText("Paid actions").click();
  await expect(consent.locator(".cc-paid")).not.toContainText("DataForSEO");
  await consent.getByRole("checkbox", { name: /Paid search lookups · can charge/ }).check();
  await expect(consent).toContainText("Can spend: paid search lookups.");
  await consent.getByRole("checkbox", { name: /Paid search lookups · can charge/ }).uncheck();
  await expect(consent).not.toContainText("Can spend");
  await consent.getByRole("button", { name: "Approve" }).click();

  const install = panel.locator(".ao-install");
  await expect(install.locator("pre")).toContainText("claude mcp add --transport http --scope user folio");
  await expect(install.locator("pre")).toContainText("folio_v1_cccc•");
  await expect(install.locator("pre")).not.toContainText(token);
  await expect(install).toContainText("This command contains your key. Paste it into a terminal, never into a chat with an agent.");
  await install.getByRole("button", { name: "Copy command" }).click();
  expect(await copied(page)).toBe(`claude mcp remove --scope user folio 2>/dev/null\nclaude mcp add --transport http --scope user folio ${origin}/api/mcp \\\n  --header "Authorization: Bearer ${token}"`);
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Claude Code", scopes: ["read"], expiresInDays: 30 }]);

  // VS Code asks for the key itself, so its button works before any key and its link carries none.
  await panel.getByRole("radio", { name: /VS Code/ }).click();
  const href = await panel.getByRole("link", { name: "Add to VS Code" }).getAttribute("href");
  expect(href!.startsWith("vscode:mcp/install?")).toBe(true);
  expect(href).not.toContain("folio_v1_");
  expect(JSON.parse(decodeURIComponent(href!.slice("vscode:mcp/install?".length))).url).toBe(`${origin}/api/mcp`);
});

test("Claude Desktop downloads an extension that asks for the key; by hand, the config's copy carries it", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await panel.getByRole("radio", { name: /Claude Desktop/ }).click();
  const download = panel.getByRole("link", { name: "Download for Claude Desktop" });
  await expect(download).toHaveAttribute("href", /\/api\/agent-setup\/claude-desktop$/);
  await expect(download).toHaveAttribute("download", "");
  await expect(panel).toContainText("Claude asks for it when you install");
  await panel.getByText("Or set it up by hand").click();
  await expect(panel).toContainText("mcp-remote");
  await expect(panel).toContainText("Bearer <your Folio key>");
  await expect(panel).toContainText("Replace <your Folio key> with your key.");
  await card(page, "Claude Desktop").getByRole("button", { name: "Approve" }).click();
  const done = panel.locator(".cc-card.is-done");
  await expect(done.getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(done).toContainText("Next, download the extension in step 3 and paste this key when Claude asks for it.");
  await expect(panel).toContainText("Claude Desktop doesn’t read your terminal’s variables");
  // The config on screen keeps the placeholder; its copy carries the new key, ready to paste.
  await expect(panel.locator("pre").filter({ hasText: "mcp-remote" })).not.toContainText(token);
  const config = panel.locator("figure").filter({ hasText: "mcp-remote" });
  await expect(config).toContainText("The copy contains your key. Paste it into the file, never into a chat with an agent.");
  await config.getByRole("button", { name: "Copy file" }).click();
  expect(JSON.parse((await copied(page))!).mcpServers.folio.env.FOLIO_AUTH).toBe(`Bearer ${token}`);
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Claude Desktop", scopes: ["read"], expiresInDays: 30 }]);
});

test("Harness signs in itself: one command with no key, always the public https address; a key stays available by hand", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await panel.getByRole("radio", { name: /Harness/ }).click();
  const origin = new URL(page.url()).origin;
  // Approval happens on Folio's page when graff signs in, so step 2 only explains and the person starts at step 3.
  await expect(currentStep(page)).toHaveText("Add Folio to Harness");
  await expect(panel.locator(".ao-signs-in")).toContainText("Harness asks for your approval itself");
  await expect(card(page, "Harness")).toBeHidden();
  // The command is ready before any key exists, and holds none. The page runs locally, so it says why the address is the public one.
  const command = panel.locator(".ao-install pre");
  await expect(command).toHaveText("graff mcp add folio --url https://usefolio.site/api/mcp --everywhere && \\\n  graff mcp login folio");
  await expect(panel.locator(".ao-install figcaption")).toContainText("One command, no key in it");
  // Nothing in the sign-in command is a secret, so it carries no key warning; someone who used a key before is told how to switch.
  await expect(panel.locator(".ao-install .ao-key-note")).toHaveCount(0);
  await expect(panel).toContainText("Connected Harness with a key before? Run the command above to sign in instead, then revoke the old key");
  await expect(panel.locator("figure").filter({ hasText: "graff mcp reconnect folio" })).toContainText("ready");
  await panel.locator(".ao-install").getByRole("button", { name: "Copy command" }).click();
  expect(await copied(page)).toBe("graff mcp add folio --url https://usefolio.site/api/mcp --everywhere && \\\n  graff mcp login folio");
  await expect(panel).toContainText("Signing in needs https, so the command uses https://usefolio.site");
  expect(keyPosts(state)).toEqual([]);
  // A key, if the person prefers one: the same consent card, folded away. The fold stays open on the approved card.
  await panel.getByText("Use a key instead").click();
  await card(page, "Harness").getByRole("button", { name: "Approve" }).click();
  const done = panel.locator(".ao-signs-in .cc-card.is-done");
  await expect(done.getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(done).toContainText("Next, open “Or set it up by hand” in step 3 and copy that command: the copy fills in this key.");
  // graff takes headers as KEY=VALUE. The screen keeps the placeholder; the copy carries the key. The one-step command still has none.
  // A key needs no https, so by hand it's this page's own address, like every other client's setup.
  await panel.getByText("Or set it up by hand", { exact: true }).click();
  await expect(panel.locator("pre").filter({ hasText: "--header" })).toContainText("Authorization=Bearer <your Folio key>");
  await expect(command).not.toContainText("folio_v1_");
  const byKey = panel.locator("figure").filter({ hasText: "--header" });
  await expect(byKey).toContainText("This command contains your key. Paste it into a terminal, never into a chat with an agent.");
  await byKey.getByRole("button", { name: "Copy command" }).click();
  expect(await copied(page)).toBe(`graff mcp add folio --url ${origin}/api/mcp --everywhere \\\n  --header "Authorization=Bearer ${token}"`);
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Harness", scopes: ["read"], expiresInDays: 30 }]);
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
  const consent = card(page, "Manus");
  await expect(consent.getByLabel("Key name")).toHaveValue("Rach’s Manus");
  await consent.getByRole("button", { name: "Approve" }).click();
  await expect(panel.locator(".cc-card.is-done").getByRole("button", { name: "Copy key" })).toBeVisible();
  await expect(panel).toContainText("Manus doesn’t read your terminal’s variables");
  // The token row now offers the key itself, masked on screen and whole in the copy.
  const tokenRow = fields.locator("div").filter({ hasText: "Bearer token" });
  await expect(tokenRow.locator("code")).toContainText("folio_v1_cccc•");
  await expect(tokenRow).not.toContainText(token);
  await expect(tokenRow).toContainText("This is your key. Paste it into a terminal or your agent’s settings, never into a chat with an agent.");
  await tokenRow.getByRole("button", { name: "Copy key" }).click();
  expect(await copied(page)).toBe(token);
  await fields.locator("div").filter({ hasText: "Server URL" }).getByRole("button", { name: "Copy value" }).click();
  expect(await copied(page)).toBe("https://usefolio.site/api/mcp");
  expect(keyPosts(state).map(post => post.body)).toEqual([{ name: "Rach’s Manus", scopes: ["read"], expiresInDays: 30 }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("someone with a connected agent sees it and the prompts first, with setup folded; signed-out visitors still see the setup; Switch account signs out", async ({ page }) => {
  await setup(page, { keys: [key("k1", "Rach’s Claude Code", new Date().toISOString())] });
  await page.goto("/agents");
  // Connected: status and prompts lead; setting up another agent is folded underneath.
  const connected = page.getByRole("region", { name: "Your connected agents" });
  await expect(connected.locator(".ao-status")).toContainText("Connected");
  await expect(connected.locator(".ao-status")).toContainText("Rach’s Claude Code");
  await expect(connected.locator(".ao-prompt").first()).toBeVisible();
  // No agent is picked here, so the Claude Code slash command is offered only for Claude Code.
  await expect(connected.locator(".ao-prompts-block .ao-slash")).toHaveText("If your agent is Claude Code, you can type /mcp__folio__improve_aeo instead for the guided version.");
  await expect(connected.locator(".ao-prompts-block")).not.toContainText("Or type /mcp__folio__improve_aeo");
  const compact = connected.locator("details.ao-setup");
  await expect(compact).toContainText("Connect another agent");
  await expect(compact).toContainText("Last: Rach’s Claude Code, used just now");
  await expect(compact).not.toHaveAttribute("open", "");
  await compact.locator(":scope > summary").click();
  await expect(compact.getByRole("heading", { name: "Pick your agent" })).toBeVisible();
  await expect(compact.locator(".ao-prompt")).toHaveCount(0);

  const visitor = await page.context().newPage();
  const state = await setup(visitor, { signedIn: false });
  await visitor.goto("/agents");
  const panel = visitor.getByRole("region", { name: "Connect your agent" });
  await expect(panel.getByRole("link", { name: "Sign in to approve one" })).toHaveAttribute("href", "/login?next=%2Fagents");
  await expect(panel.locator("pre").first()).toContainText("/api/mcp");
  expect(state.keyReads).toBe(0);
  await visitor.close();

  // Switch account signs out and returns to sign-in, coming back here afterwards.
  const other = await page.context().newPage();
  const signedIn = await setup(other);
  await other.goto("/agents");
  await Promise.all([other.waitForURL(/\/login\?next=%2Fagents/), card(other, "Claude Code").getByRole("button", { name: "Switch account" }).click()]);
  expect(signedIn.posts.map(post => post.path)).toContain("/api/auth/sign-out");
  expect(keyPosts(signedIn)).toHaveLength(0);
  await other.close();
});

test("the prompts are about the website the person picks, and a saved report read in view marks the ones that would come back empty", async ({ page }) => {
  const state = await setup(page, { sites: [site("site-folio", "usefolio.site"), site("site-manus", "manus.im")],
    reports: { "site-folio": report("usefolio.site", { crawled: false, namedIn: 0, nearPageOne: false }), "site-manus": report("manus.im", { crawled: true, namedIn: 3, nearPageOne: true }) } });
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  const prompts = panel.locator(".ao-prompt");
  await expect(prompts.first()).toContainText("What is usefolio.site missing?");
  // Nothing is read for the prompts until step 5 comes into view.
  await page.waitForTimeout(800);
  expect(state.gets.filter(path => path.endsWith("/visibility"))).toEqual([]);
  await panel.getByRole("heading", { name: "Ask it something" }).scrollIntoViewIfNeeded();
  // usefolio.site has not been read and no answer names it: those prompts say so and move after the one that works.
  const pages = prompts.filter({ hasText: "Do its pages answer the big searches?" });
  await expect(pages).toHaveClass(/is-empty/);
  await expect(pages).toContainText("Folio hasn’t read this website’s pages yet, so this one will come back empty.");
  await expect(prompts.filter({ hasText: "Who do AI answers recommend instead?" })).toContainText("No published answer in Folio names this website");
  await expect(prompts.first()).toContainText("What is usefolio.site missing?");
  await expect(prompts.first()).not.toHaveClass(/is-empty/);
  // Its report has gaps and completed questions, so the repository prompt works and comes second; the two marked ones follow.
  await expect(prompts.nth(1)).toContainText("Fix the top gap in this repository");
  await expect(prompts.nth(1)).not.toHaveClass(/is-empty/);
  await expect(prompts.nth(2)).toHaveClass(/is-empty/);
  await expect(prompts.nth(3)).toHaveClass(/is-empty/);
  // The page search says it sends the search text to a third party.
  await expect(pages).toContainText("folio_index_pages sends each search’s words to an embedding model");
  expect(state.gets.filter(path => path.endsWith("/visibility"))).toEqual(["/api/sites/site-folio/visibility"]);

  // Another website: the prompts name it, and its own report clears the marks.
  await selectValue(panel.getByLabel("Website the prompts are about"), "site-manus");
  await expect(prompts.first()).toContainText("What is manus.im missing?");
  await expect(prompts.first().locator("blockquote")).toContainText("Call folio_targets to find manus.im, then call folio_website_gaps");
  await expect(panel.locator(".ao-prompt.is-empty")).toHaveCount(0);
  await expect(prompts.nth(2)).toContainText("Do its pages answer the big searches?");
  expect(state.gets.filter(path => path.endsWith("/visibility"))).toEqual(["/api/sites/site-folio/visibility", "/api/sites/site-manus/visibility"]);
  // Browsing the panel writes nothing.
  expect(state.posts).toEqual([]);
});

test("if the saved report can't be read, the prompts stay unmarked and in order", async ({ page }) => {
  const state = await setup(page, { keys: [key("k1", "Rach’s Codex", new Date().toISOString())], sites: [site("site-folio", "usefolio.site")], reports: {} });
  await page.goto("/agents");
  const connected = page.getByRole("region", { name: "Your connected agents" });
  await expect.poll(() => state.gets.filter(path => path.endsWith("/visibility")).length).toBe(1);
  await expect(connected.locator(".ao-prompt")).toHaveCount(4);
  await expect(connected.locator(".ao-prompt.is-empty")).toHaveCount(0);
  await expect(connected.locator(".ao-prompt header strong")).toHaveText(["What is usefolio.site missing?", "Who do AI answers recommend instead?", "Do its pages answer the big searches?", "Fix the top gap in this repository"]);
});

test("each connection says how it connected, what it may do and whether it can spend", async ({ page }) => {
  const recent = new Date(Date.now() - 120_000).toISOString();
  await setup(page, { keys: [key("k1", "Rach’s Harness", recent, ["changes", "read"], "sign-in"), key("k2", "Rach’s Codex", recent, ["read"], "key"), key("k3", "Rach’s Cursor", recent, ["read", "seo"], "key")] });
  await page.goto("/agents");
  const status = page.getByRole("region", { name: "Your connected agents" }).locator(".ao-status");
  const row = (name: string) => status.locator("li").filter({ hasText: name });
  await expect(row("Rach’s Harness")).toContainText("Signed in");
  await expect(row("Rach’s Harness")).toContainText("Read & record changes · 22 tools");
  await expect(row("Rach’s Harness")).toContainText("Can’t start paid work");
  await expect(row("Rach’s Codex")).toContainText("Key");
  await expect(row("Rach’s Codex")).toContainText("Read only · 20 tools");
  await expect(row("Rach’s Codex")).toContainText("Can’t start paid work");
  await expect(row("Rach’s Cursor")).toContainText("Read, paid search lookups · 22 tools");
  await expect(row("Rach’s Cursor").locator(".is-paid")).toHaveText("Can start paid work if your account is approved: paid search lookups");
});

test("signed-out visitors make no private or report request, and browsing the signed-in panel writes nothing", async ({ page }) => {
  const visitor = await setup(page, { signedIn: false, reports: {} });
  await page.goto("/agents");
  const panel = page.getByRole("region", { name: "Connect your agent" });
  await panel.getByRole("heading", { name: "Ask it something" }).scrollIntoViewIfNeeded();
  await expect(panel.locator(".ao-prompt")).toHaveCount(4);
  await page.waitForTimeout(800);
  expect(visitor.gets.filter(path => /^\/api\/(agent-keys|sites|organizations|getting-started)/.test(path))).toEqual([]);
  expect(visitor.posts).toEqual([]);

  const other = await page.context().newPage();
  const signedIn = await setup(other, { sites: [site("site-folio", "usefolio.site"), site("site-manus", "manus.im")], reports: { "site-folio": report("usefolio.site", { crawled: true, namedIn: 1, nearPageOne: true }) } });
  await other.goto("/agents");
  const setupPanel = other.getByRole("region", { name: "Connect your agent" });
  for (const client of ["Codex", "Harness", "Cursor", "Manus", "Claude Code"]) await setupPanel.getByRole("radio", { name: new RegExp(client) }).click();
  await setupPanel.getByText("Or set it up by hand").first().click();
  await setupPanel.getByText("What your agent can do with each permission").click();
  await selectValue(setupPanel.getByLabel("Website the prompts are about"), "site-manus");
  await setupPanel.locator(".ao-prompt").first().getByRole("button", { name: "Copy prompt" }).click();
  await expect.poll(() => signedIn.gets.filter(path => path.endsWith("/visibility")).length).toBeGreaterThan(0);
  expect(signedIn.posts).toEqual([]);
  await other.close();
});

test("another account, or signing out, starts the panel over: no key, connection, chosen website or mark of the last account, and its late replies are ignored", async ({ page }) => {
  const state = await setup(page, { keys: [key("k1", "Rach’s Codex", new Date().toISOString())], sites: [site("site-folio", "usefolio.site"), site("site-manus", "manus.im")],
    reports: { "site-folio": report("usefolio.site", { crawled: true, namedIn: 1, nearPageOne: true }), "site-manus": report("manus.im", { crawled: false, namedIn: 0, nearPageOne: false }) },
    bob: { keys: [key("b1", "Bob’s Cursor", new Date().toISOString(), ["read"], "key")], sites: [site("site-bob", "bob.example")] } });
  await page.goto("/agents");
  // Rach: connected, so status and prompts lead. Approve another key from the folded setup, then pick manus.im, whose prompts are marked.
  const connected = page.getByRole("region", { name: "Your connected agents" });
  await expect(connected.locator(".ao-status")).toContainText("Rach’s Codex");
  await connected.locator("details.ao-setup > summary").click();
  await card(page, "Claude Code").getByRole("button", { name: "Approve" }).click();
  // The layout stays put: the approved card shows in the open fold, and the status at the top waits for the new key.
  const panel = connected;
  await expect(panel.getByLabel("Your new key")).toContainText("folio_v1_cccc");
  await expect(panel.locator(".ao-status")).toContainText("Waiting for Rach’s Claude Code");
  await panel.getByRole("heading", { name: "Ask it something" }).scrollIntoViewIfNeeded();
  await selectValue(panel.getByLabel("Website the prompts are about"), "site-manus");
  await expect(panel.locator(".ao-prompt").first()).toContainText("What is manus.im missing?");
  await expect(panel.locator(".ao-prompt.is-empty")).not.toHaveCount(0);
  state.keys = state.keys.map(item => item.id === "new-key" ? { ...item, lastUsedAt: new Date().toISOString() } : item);
  await expect(panel.locator(".ao-status")).toContainText("Connected", { timeout: 12_000 });
  await expect(panel.locator(".ao-status")).toContainText("Rach’s Codex");

  // A key listing for Rach is still on its way when the account changes to Bob.
  state.holdRachKeys = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => state.held).toBe(1);
  state.owner = "bob"; await signalOwnerChange(page);
  const bob = page.getByRole("region", { name: "Your connected agents" });
  await expect(bob.locator(".ao-status")).toContainText("Bob’s Cursor");
  await expect(bob.locator(".ao-prompt").first()).toContainText("What is bob.example missing?");
  // Rach's late reply arrives, with a key added since; nothing of it shows.
  state.keys = [key("k-late", "Rach’s late key", new Date().toISOString()), ...state.keys];
  state.release();
  await expect.poll(() => state.settled).toBe(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const section = page.locator("#connect");
  // (usefolio.site itself is Folio's own address in the setup text, so Rach's websites are checked where the prompts name them.)
  for (const text of ["Rach’s", "folio_v1_cccc", "manus.im"]) await expect(section).not.toContainText(text);
  await expect(section.locator(".ao-prompts-block")).not.toContainText("usefolio.site");
  await expect(section.locator(".ao-prompt.is-empty")).toHaveCount(0);
  await expect(section.getByLabel("Website the prompts are about")).toHaveCount(0);
  await expect(section.getByLabel("Your new key")).toHaveCount(0);

  // Signed out: the setup again, with nothing of either account.
  state.owner = null; await signalOwnerChange(page);
  const out = page.getByRole("region", { name: "Connect your agent" });
  await expect(out.getByRole("link", { name: "Sign in to approve one" })).toBeVisible();
  for (const text of ["Rach’s", "Bob’s", "bob.example", "manus.im", "folio_v1_cccc"]) await expect(out).not.toContainText(text);
  await expect(out.locator(".ao-prompts-block")).not.toContainText("usefolio.site");
  await expect(out.locator(".ao-prompt.is-empty")).toHaveCount(0);
  expect(keyPosts(state)).toHaveLength(1);
});
