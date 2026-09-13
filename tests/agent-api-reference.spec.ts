import { expect, test, type Page } from "@playwright/test";
import { agentApiMarkdown, agentOpenApiSpec } from "../src/lib/agent-api-reference";
import type { AgentApiKeySummary } from "../src/lib/agent-observation-types";

const FIXTURE_TOKEN = "folio_fixture_only_not_a_real_api_key";
const key = (name: string, id = "fixture-key"): AgentApiKeySummary => ({id, name, prefix: "folio_fixture", scopes: ["read"], createdAt: "2026-09-13T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z", lastUsedAt: null, revokedAt: null});
async function fixture(page: Page, options: {holdFirstList?: boolean; holdCreate?: boolean} = {}) {
  let releaseList!: () => void, releaseCreate!: () => void;
  const listGate = new Promise<void>(resolve => {releaseList = resolve;}), createGate = new Promise<void>(resolve => {releaseCreate = resolve;});
  const state = {owner: "owner-alice" as string | null, keys: [key("Alice private key")], lists: 0, heldLists: 0, settledLists: 0, settledCreates: 0, mutations: [] as {path: string; method: string; body: Record<string, unknown>}[], unexpected: [] as string[], releaseList, releaseCreate};
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {configurable: true, value: {writeText: async (text: string) => { (window as Window & {copiedFixtureText?: string}).copiedFixtureText = text; }}});
  });
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    // The public /docs/api page also has /api/ in Next chunk paths; those are assets, not API requests.
    if (!path.startsWith("/api/")) return route.continue();
    if (path === "/api/auth/get-session") return route.fulfill({json: state.owner ? {user: {id: state.owner, name: "API fixture reviewer", email: "fixture@example.test", emailVerified: true}, session: {id: `session-${state.owner}`, userId: state.owner, expiresAt: "2099-01-01T00:00:00Z"}} : null});
    if (path === "/api/openapi.json" && method === "GET") return route.fulfill({json: agentOpenApiSpec()});
    if (path === "/api/agent-keys" && method === "GET") {
      const keys = [...state.keys]; state.lists++;
      const held = options.holdFirstList && state.owner === "owner-alice";
      if (held) {state.heldLists++; await listGate;}
      // A cancelled request may no longer accept a response; the browser must ignore it either way.
      return route.fulfill({json: {keys}}).catch(error => {if (!String(error).includes("Target page, context or browser has been closed") && !String(error).includes("Invalid InterceptionId")) throw error;}).finally(() => {if (held) state.settledLists++;});
    }
    if (path === "/api/agent-keys" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>; state.mutations.push({path, method, body});
      const result = {...key(String(body.name), `fixture-key-${state.mutations.length}`), scopes: body.scopes as AgentApiKeySummary["scopes"]};
      state.keys.unshift(result);
      if (options.holdCreate) await createGate;
      return route.fulfill({json: {key: result, token: FIXTURE_TOKEN}}).catch(error => {if (!String(error).includes("Target page, context or browser has been closed") && !String(error).includes("Invalid InterceptionId")) throw error;}).finally(() => {state.settledCreates++;});
    }
    if (path.startsWith("/api/agent-keys/") && method === "DELETE") {
      state.mutations.push({path, method, body: request.postDataJSON()});
      const selected = state.keys.find(value => path.endsWith(value.id))!;
      selected.revokedAt = "2026-09-13T12:00:00Z";
      return route.fulfill({json: {key: selected}});
    }
    state.unexpected.push(`${method} ${path}`);
    return route.fulfill({status: 409, json: {error: {message: "No provider or unlisted API action is permitted by this fixture."}}});
  });
  return state;
}
async function signalOwnerChange(page: Page) {
  // Simulate Better Auth's documented cross-tab session notification, without real sign-in/out writes.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {key: "better-auth.message", newValue: JSON.stringify({event: "session", data: {trigger: "getSession"}, timestamp: Date.now()})})));
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
}

test("API reference is readable, has executable placeholder examples and never starts work while browsing", async ({page}, testInfo) => {
  const state = await fixture(page); state.owner = null;
  await page.goto("/docs/api");
  await expect(page.getByRole("heading", {level: 1, name: "Folio Agent API"})).toBeVisible();
  await expect(page.getByRole("link", {name: "Sign in to manage keys"})).toBeVisible();
  await expect(page.getByRole("link", {name: "OpenAPI schema"})).toHaveAttribute("href", "/api/openapi.json");
  await expect(page.getByRole("link", {name: /Markdown for agents/})).toHaveAttribute("href", "/docs/api/reference.md");
  expect(await page.locator(".api-lead").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(15);
  await noOverflow(page);
  await page.screenshot({path: testInfo.outputPath("api-reference-opening.png"), fullPage: false});
  const nav = page.getByRole("navigation", {name: "API reference navigation"}), endpoint = page.locator("#api-endpoint");
  await nav.getByRole("link", {name: /Read the latest saved result/}).click();
  await expect(endpoint.getByRole("heading", {name: "Read the latest saved result", exact: true})).toBeVisible();
  await expect(endpoint.locator("pre").first()).toContainText("$FOLIO_BASE_URL/api/v1/observations?kind=keyword&caseId=case_example&maxAgeSeconds=86400");
  await expect(endpoint.locator("pre").first()).not.toContainText("-X POST");
  await page.getByRole("button", {name: "Copy request example"}).click();
  expect(await page.evaluate(() => (window as Window & {copiedFixtureText?: string}).copiedFixtureText)).toContain("Authorization: Bearer $FOLIO_API_KEY");
  await nav.getByRole("link", {name: /Get a fresh observation/}).click();
  await expect(endpoint).toContainText("This request can incur usage charges.");
  await page.getByLabel("Example language", {exact: true}).selectOption("javascript");
  await page.getByRole("button", {name: "Copy request example"}).click();
  const javascript = await page.evaluate(() => (window as Window & {copiedFixtureText?: string}).copiedFixtureText);
  expect(javascript).toContain('method: "POST"'); expect(javascript).toContain('"Idempotency-Key": "research-request-001"');
  expect(javascript).toContain("process.env.FOLIO_API_KEY"); expect(javascript).not.toContain(FIXTURE_TOKEN);
  // Parse the copied JavaScript without executing fetch or evaluating any provider action.
  expect(() => new Function(`return async function(){${javascript}}`)).not.toThrow();
  await page.getByText("Reading outcomes and progress", {exact: true}).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("details.api-contract")).toHaveAttribute("open", "");
  const tableStyles = await page.locator(".api-parameters th, .api-parameters td").evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return {fontSize: Number.parseFloat(style.fontSize), letterSpacing: style.letterSpacing};
  }));
  expect(tableStyles.length).toBeGreaterThan(0);
  for (const style of tableStyles) {
    expect(style.fontSize).toBeGreaterThanOrEqual(12);
    expect(["normal", "0px"]).toContain(style.letterSpacing);
  }
  await noOverflow(page);
  await page.screenshot({path: testInfo.outputPath("api-reference-request-example.png"), fullPage: false});
  expect(state.mutations).toEqual([]); expect(state.unexpected).toEqual([]); expect(state.lists).toBe(0);
});

test("key permissions default to read and tokens appear only after explicit creation, can hide and revoke", async ({page}, testInfo) => {
  const state = await fixture(page);
  await page.goto("/docs/api#api-keys");
  await expect(page.locator(".api-key-list strong").filter({hasText: "Alice private key"})).toBeVisible();
  const allow = page.getByRole("checkbox", {name: /Allow this key to start evaluations/});
  await expect(allow).not.toBeChecked();
  await expect(page.getByLabel("New Folio API key", {exact: true})).toHaveCount(0);
  expect(state.mutations).toEqual([]);
  await page.getByLabel("Key name", {exact: true}).fill("Read fixture");
  await page.getByRole("button", {name: "Create API key", exact: true}).click();
  const token = page.getByLabel("New Folio API key", {exact: true});
  await expect(token).toHaveValue(FIXTURE_TOKEN); await expect(token).toHaveAttribute("type", "password");
  expect(state.mutations).toEqual([{path: "/api/agent-keys", method: "POST", body: {name: "Read fixture", scopes: ["read"], expiresInDays: 30}}]);
  await page.getByRole("button", {name: "Copy key", exact: true}).click();
  expect(await page.evaluate(() => (window as Window & {copiedFixtureText?: string}).copiedFixtureText)).toBe(FIXTURE_TOKEN);
  await page.getByRole("button", {name: "I saved it · hide key", exact: true}).click();
  await expect(token).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".api-key-list strong").filter({hasText: "Read fixture"})).toBeVisible(); await expect(token).toHaveCount(0);
  await page.getByLabel("Key name", {exact: true}).fill("Evaluate fixture");
  await allow.check(); await expect(page.getByText(/Can incur usage charges/)).toBeVisible();
  await page.getByRole("button", {name: "Create API key", exact: true}).click();
  await expect(token).toHaveValue(FIXTURE_TOKEN); await expect(allow).not.toBeChecked();
  expect(state.mutations[1].body.scopes).toEqual(["read", "evaluate"]);
  await page.getByRole("button", {name: "Revoke Evaluate fixture", exact: true}).click();
  await expect(page.getByRole("status")).toContainText("Key revoked."); await expect(token).toHaveCount(0);
  await expect(page.getByRole("button", {name: "Revoke Evaluate fixture", exact: true})).toHaveCount(0);
  expect(state.mutations[2]).toEqual({path: "/api/agent-keys/fixture-key-2", method: "DELETE", body: {}});
  await noOverflow(page);
  await page.screenshot({path: testInfo.outputPath("api-reference-fixture-keys.png"), fullPage: false});
  expect(state.unexpected).toEqual([]);
});

test("an owner change aborts and ignores the previous owner's delayed key listing", async ({page}) => {
  const state = await fixture(page, {holdFirstList: true});
  await page.goto("/docs/api#api-keys"); await expect.poll(() => state.heldLists).toBeGreaterThan(0);
  state.owner = "owner-bob"; state.keys = [key("Bob private key", "bob-key")];
  await signalOwnerChange(page);
  await expect(page.locator(".api-key-list strong").filter({hasText: "Bob private key"})).toBeVisible();
  state.releaseList();
  await expect.poll(() => state.settledLists).toBe(state.heldLists);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator(".api-key-list strong").filter({hasText: "Alice private key"})).toHaveCount(0);
  await expect(page.getByLabel("New Folio API key", {exact: true})).toHaveCount(0);
  state.owner = null; await signalOwnerChange(page);
  await expect(page.getByRole("link", {name: "Sign in to manage keys"})).toBeVisible();
  await expect(page.locator(".api-key-list strong").filter({hasText: "Bob private key"})).toHaveCount(0);
  expect(state.mutations).toEqual([]); expect(state.unexpected).toEqual([]);
});

test("an owner change clears pending key creation and never displays its late token", async ({page}) => {
  const state = await fixture(page, {holdCreate: true});
  await page.goto("/docs/api#api-keys");
  await expect(page.locator(".api-key-list strong").filter({hasText: "Alice private key"})).toBeVisible();
  await page.getByLabel("Key name", {exact: true}).fill("Alice pending private key");
  await page.getByRole("button", {name: "Create API key", exact: true}).click();
  await expect.poll(() => state.mutations.length).toBe(1);
  state.owner = "owner-bob"; state.keys = [key("Bob private key", "bob-key")];
  await signalOwnerChange(page); await expect(page.locator(".api-key-list strong").filter({hasText: "Bob private key"})).toBeVisible();
  state.releaseCreate();
  await expect.poll(() => state.settledCreates).toBe(1);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByLabel("New Folio API key", {exact: true})).toHaveCount(0);
  await expect(page.locator(".api-key-list strong").filter({hasText: "Alice pending private key"})).toHaveCount(0);
  await expect(page.getByLabel("Key name", {exact: true})).toHaveValue("");
  expect(state.mutations).toHaveLength(1); expect(state.unexpected).toEqual([]);
});

test("public reference endpoints work without cookies while every unauthenticated v1 operation returns 401", async ({playwright, baseURL}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API HTTP contract is viewport-independent");
  const client = await playwright.request.newContext({baseURL, storageState: {cookies: [], origins: []}});
  try {
    const schema = await client.get("/api/openapi.json"); expect(schema.status()).toBe(200); expect(await schema.json()).toEqual(agentOpenApiSpec());
    const markdown = await client.get("/docs/api/reference.md"); expect(markdown.status()).toBe(200); expect(await markdown.text()).toBe(agentApiMarkdown());
    for (const path of ["/auth/status", "/sites", "/benchmark-cases", "/observations?kind=keyword&caseId=fixture", "/runs/keyword/fixture"]) {
      const response = await client.get(`/api/v1${path}`);
      expect(response.status(), path).toBe(401); expect((await response.json()).error.code).toBe("unauthorized");
      expect(response.headers()["cache-control"]).toContain("no-store"); expect(response.headers()["www-authenticate"]).toBe("Bearer");
    }
    for (const path of ["/observations/ensure", "/runs/keyword/fixture/reconcile", "/runs/keyword/fixture/cancel"]) {
      const response = await client.post(`/api/v1${path}`, {data: {}});
      expect(response.status(), path).toBe(401); expect((await response.json()).error.code).toBe("unauthorized");
    }
  } finally {await client.dispose();}
});
