import { expect, test, type Page } from "@playwright/test";

const at = "2026-09-13T08:00:00.000Z";
const sites = [
  { id: "website-codegraff", name: "Codegraff fixture", url: "https://www.codegraff.com/docs", createdAt: at, isPublic: false, seoScore: null, lastScannedAt: null },
  { id: "website-other", name: "Other fixture", url: "https://other.example.com/", createdAt: at, isPublic: false, seoScore: null, lastScannedAt: null },
];
function report(id: string, domain: string, backlinks: number) {
  return { id, domain, createdAt: at, retrievedAt: at, publication: "private", state: "complete", result: {
    id: `result-${id}`, domain, provider: "DataForSEO", fetchedAt: at, status: "complete", totalCostUsd: 0.04, knownCostUsd: 0.04, costIsComplete: true,
    organic: { status: "success", data: { organicKeywords: 73, estimatedMonthlyTraffic: 129 }, taskId: "PRIVATE_TASK_ID", costUsd: 0.01 },
    backlinks: { status: "success", data: { backlinks, referringDomains: 18 }, taskId: "PRIVATE_TASK_ID", costUsd: 0.03 },
  } };
}
const codegraff = report("saved-codegraff", "codegraff.com", 142);
const other = report("saved-other", "other.example.com", 921);
const sibling = report("saved-subdomain", "docs.codegraff.com", 9999);

async function setup(page: Page, options: { delayFirst?: Promise<void>; delayUpdate?: Promise<void> } = {}) {
  const state = { posts: 0, reads: [] as string[], signedIn: true };
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: state.signedIn ? {
      user: {id: "PRIVATE_OWNER_ID", name: "Website reviewer", email: "website-reviewer@example.test", emailVerified: true},
      session: {id: "fixture-session", userId: "PRIVATE_OWNER_ID", expiresAt: "2099-01-01T00:00:00Z"},
    } : null });
    if (pathname === "/api/auth/sign-out") { state.signedIn = false; return route.fulfill({json: {success: true}}); }
    if (pathname === "/api/sites") return route.fulfill({json: {sites: state.signedIn ? sites : []}});
    if (pathname === "/api/seo-data") {
      if (method === "POST") {
        state.posts++;
        expect(route.request().postDataJSON()).toEqual({domain: "codegraff.com"});
        if (options.delayUpdate) await options.delayUpdate;
        return route.fulfill({json: {...codegraff.result, fetchedAt: "2026-09-13T09:00:00.000Z", backlinks: {...codegraff.result.backlinks, data: {backlinks: 176, referringDomains: 24}}, reportId: "saved-update", saved: true}}).catch(() => undefined);
      }
      return route.fulfill({json: {configured: true, authorized: true, reason: "DataForSEO credentials are configured for PRIVATE_OWNER_ID", provider: "DataForSEO"}});
    }
    if (pathname === "/api/seo-reports") return route.fulfill({json: {reports: [sibling, other, codegraff].map(({result, ...saved}) => ({...saved, status: result.status, totalCostUsd: result.totalCostUsd, knownCostUsd: result.knownCostUsd, costIsComplete: result.costIsComplete}))}});
    if (pathname.startsWith("/api/seo-reports/")) {
      const id = pathname.split("/").at(-1)!; state.reads.push(id);
      if (id === codegraff.id && options.delayFirst) await options.delayFirst;
      return route.fulfill({json: {report: id === codegraff.id ? codegraff : id === other.id ? other : sibling}}).catch(() => undefined);
    }
    if (method !== "GET") return route.fulfill({status: 403, json: {error: "Unplanned mutations are blocked in browser fixtures."}});
    if (pathname === "/api/scans") return route.fulfill({json: {scans: []}});
    if (pathname === "/api/evaluations") return route.fulfill({json: {runs: []}});
    if (pathname === "/api/agents/status") return route.fulfill({json: {configured: false, authorized: false, canRun: false, status: "disconnected", model: "gpt-6-astra", message: "Fixture"}});
    if (pathname === "/api/search-console/status") return route.fulfill({json: {configured: false, connected: false}});
    if (pathname === "/api/search-console/reports") return route.fulfill({json: {reports: []}});
    return route.fulfill({json: {}});
  });
  return state;
}

test("a selected website opens its exact saved report privately and only a deliberate update starts a lookup", async ({page}) => {
  let releaseUpdate!: () => void;
  const delayUpdate = new Promise<void>(resolve => { releaseUpdate = resolve; });
  const state = await setup(page, {delayUpdate});
  await page.goto("/websites");
  const summary = page.getByRole("region", {name: "Website search and backlinks"});
  await expect(summary).toContainText("142");
  await expect(summary).toContainText("18");
  await expect(summary).toContainText("73");
  await expect(summary).toContainText("129");
  await expect(summary).not.toContainText("9,999");
  await expect(summary).not.toContainText("DataForSEO");
  await expect(summary).not.toContainText("PRIVATE_OWNER_ID");
  await expect(summary).not.toContainText("PRIVATE_TASK_ID");
  await expect(summary).not.toContainText("$0.04");
  expect(state.posts).toBe(0); expect(state.reads).toEqual([codegraff.id]);
  await summary.getByRole("button", {name: "Update website data", exact: true}).click();
  await expect(summary.getByRole("button", {name: "Updating website data…", exact: true})).toBeDisabled();
  expect(state.posts).toBe(1);
  releaseUpdate();
  await expect(summary).toContainText("176");
  await expect(summary).toContainText("24");
  await expect(summary.getByRole("button", {name: "Update website data", exact: true})).toBeEnabled();
  expect(state.posts).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("changing the selected website ignores the previous website's late saved response", async ({page}) => {
  let release!: () => void;
  const delayFirst = new Promise<void>(resolve => { release = resolve; });
  const state = await setup(page, {delayFirst});
  await page.goto("/websites");
  await expect.poll(() => state.reads.includes(codegraff.id)).toBe(true);
  await page.getByLabel("Selected website", {exact: true}).selectOption(sites[1].id);
  const summary = page.getByRole("region", {name: "Website search and backlinks"});
  await expect(summary).toContainText("other.example.com");
  await expect(summary).toContainText("921");
  release();
  await expect(summary).not.toContainText("142");
  await expect(summary).not.toContainText("codegraff.com");
  expect(state.posts).toBe(0);
});

test("leaving the owner session clears an in-flight website update without repeating it", async ({page}) => {
  let release!: () => void;
  const delayUpdate = new Promise<void>(resolve => { release = resolve; });
  const state = await setup(page, {delayUpdate});
  await page.goto("/websites");
  const summary = page.getByRole("region", {name: "Website search and backlinks"});
  await expect(summary).toContainText("142");
  await summary.getByRole("button", {name: "Update website data", exact: true}).click();
  await expect.poll(() => state.posts).toBe(1);
  await page.goto("/settings");
  await page.getByRole("button", {name: "Sign out", exact: true}).click();
  await expect(page.getByRole("link", {name: "Sign in with Better Auth"})).toBeVisible();
  release();
  await page.goto("/websites");
  await expect(page.locator(".website-seo-summary").getByText("142", {exact: true})).toHaveCount(0);
  await expect(page.locator(".website-seo-summary").getByText("176", {exact: true})).toHaveCount(0);
  expect(state.posts).toBe(1);
});

test("an incomplete website report keeps missing values distinct from measured zero", async ({page}) => {
  const state = await setup(page);
  await page.route(`**/api/seo-reports/${codegraff.id}`, route => route.fulfill({json: {report: {
    ...codegraff, result: {...codegraff.result, status: "partial", organic: {status: "error", data: null},
      backlinks: {status: "success", data: {backlinks: 0, referringDomains: null}}},
  }}}));
  await page.goto("/websites");
  const summary = page.getByRole("region", {name: "Website search and backlinks"});
  await expect(summary).toContainText("Some data is unavailable");
  await expect(summary.locator("dd").filter({hasText: /^0$/})).toHaveCount(1);
  await expect(summary.locator("dd").filter({hasText: /^Unavailable$/})).toHaveCount(3);
  expect(state.posts).toBe(0);
});

test("opening an existing Search Console property adds its private website without requesting new search or model work", async ({page}) => {
  const state = await setup(page);
  const connectedSite = {...sites[0], url: "https://codegraff.com/", name: "codegraff.com"};
  let connected = false, handoffs = 0;
  const paidRequests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/(?:seo-data|evaluations|search-console\/reports)$/.test(new URL(request.url()).pathname)) paidRequests.push(request.url());
  });
  await page.route("**/api/sites", route => route.fulfill({json: {sites: connected ? [connectedSite] : []}}));
  await page.route("**/api/search-console/reports", route => route.fulfill({json: {reports: [{
    id: "owned-search-report", property: "sc-domain:codegraff.com", startDate: "2026-08-14", endDate: "2026-09-10",
    fetchedAt: at, totals: null, status: "partial", warnings: [], rowLimit: 1000,
  }]}}));
  await page.route("**/api/sites/from-search-console", route => {
    handoffs++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({reportId: "owned-search-report"});
    connected = true;
    return route.fulfill({json: {site: connectedSite}});
  });
  await page.goto("/websites");
  await expect(page.getByRole("heading", {name: "Connected through Search Console", exact: true})).toBeVisible();
  expect(state.posts).toBe(0); expect(state.reads).toEqual([]);
  await page.getByRole("button", {name: "Open website", exact: true}).click();
  await expect(page).toHaveURL(/\/websites\?site=website-codegraff$/);
  await expect(page.getByRole("region", {name: "Your websites", exact: true})).toContainText("Private website");
  await expect(page.getByRole("region", {name: "Website search and backlinks"})).toContainText("142");
  await expect(page.getByRole("link", {name: "Evaluate website", exact: true})).toBeVisible();
  await expect(page.getByRole("region", {name: "Your websites", exact: true}).getByRole("link", {name: "Keyword evaluations", exact: true})).toBeVisible();
  expect(handoffs).toBe(1); expect(state.posts).toBe(0); expect(paidRequests).toEqual([]);
});
