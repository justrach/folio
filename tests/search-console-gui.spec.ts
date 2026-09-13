import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE } from "../src/lib/evals";

const timestamp = "2026-09-13T08:00:00.000Z";
const alphaProperty = "https://alpha.example.com/";
const betaProperty = "sc-domain:beta.example.com";
type SearchRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
type Report = {
  id: string; property: string; startDate: string; endDate: string; fetchedAt: string;
  totals: Omit<SearchRow, "keys"> | null; daily: SearchRow[]; queries: SearchRow[]; pages: SearchRow[];
  status: "complete" | "partial"; warnings: string[]; rowLimit: number;
};

function report(id = "search-console-alpha", property = alphaProperty, query = "alpha private search"): Report {
  return {
    id, property, startDate: "2026-08-14", endDate: "2026-09-10", fetchedAt: timestamp,
    totals: { clicks: 123, impressions: 1230, ctr: 0.1, position: 4.5 },
    daily: [{ keys: ["2026-09-10"], clicks: 12, impressions: 120, ctr: 0.1, position: 4.5 }],
    queries: [{ keys: [query], clicks: 25, impressions: 250, ctr: 0.1, position: 3.5 }],
    pages: [{ keys: [`${property.startsWith("https:") ? property : "https://beta.example.com/"}pricing`], clicks: 31, impressions: 310, ctr: 0.1, position: 4.1 }],
    status: "complete", warnings: [], rowLimit: 1000,
  };
}

function summary(value: Report) {
  return { ...value, daily: undefined, queries: undefined, pages: undefined };
}

async function fixture(page: Page, initialReports: Report[] = []) {
  const state = {
    owner: "alice" as string | null, configured: true, connected: true,
    reports: initialReports, imported: report(), imports: [] as unknown[],
    propertyReads: 0, historyReads: 0, detailReads: [] as string[], finishedDetailReads: [] as string[], disconnects: 0,
    socialSignIns: [] as Record<string, unknown>[], socialLinks: [] as Record<string, unknown>[],
    forbiddenWrites: [] as string[], unexpectedRequests: [] as string[],
    holdDetail: null as Promise<void> | null,
  };
  const connection = {
    provider: "OpenAI Agents API", configured: false, status: "disconnected", model: "fixture-model",
    canRun: false, authorized: false, maxRunsPerDay: 1, allowedTargets: ["example.com"],
    message: "Browser fixture: providers cannot run.",
  };
  const user = () => ({ id: state.owner!, email: `${state.owner}@example.test`, name: `${state.owner} reviewer`,
    emailVerified: true, createdAt: timestamp, updatedAt: timestamp });
  // Every application API is mocked so neither local account records nor providers are used.
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (pathname === "/api/auth/get-session") return route.fulfill({ json: state.owner ? {
      user: user(), session: { id: `session-${state.owner}`, userId: state.owner, token: "browser-fixture",
        expiresAt: "2099-01-01T00:00:00Z", createdAt: timestamp, updatedAt: timestamp },
    } : null });
    if (pathname === "/api/auth/sign-out") {
      state.owner = null;
      return route.fulfill({ json: { success: true } });
    }
    if (pathname === "/api/auth/sign-in/email") {
      state.owner = "bob";
      return route.fulfill({ json: { token: "browser-fixture-bob", user: user(), redirect: false } });
    }
    if (pathname === "/api/auth/sign-in/social") {
      state.socialSignIns.push(route.request().postDataJSON());
      return route.fulfill({ json: { redirect: false } });
    }
    if (pathname === "/api/auth/link-social") {
      state.socialLinks.push(route.request().postDataJSON());
      return route.fulfill({ json: { redirect: false } });
    }
    if (pathname === "/api/search-console" && method === "GET") return route.fulfill({ json: {
      configured: state.configured, signedIn: !!state.owner, connected: !!state.owner && state.connected,
      message: state.owner && state.connected ? "Google Search Console is connected." : "Sign in with Google to connect Search Console.",
    } });
    if (pathname === "/api/github" && method === "GET") return route.fulfill({ json: { configured: false, signedIn: !!state.owner, connected: false } });
    if (pathname === "/api/search-console/properties" && method === "GET") {
      state.propertyReads++;
      return route.fulfill({ json: { properties: [
        { siteUrl: alphaProperty, permissionLevel: "siteOwner" },
        { siteUrl: betaProperty, permissionLevel: "siteFullUser" },
      ] } });
    }
    if (pathname === "/api/search-console/reports" && method === "GET") {
      state.historyReads++;
      return route.fulfill({ json: { reports: state.owner ? state.reports.map(summary) : [] } });
    }
    if (pathname === "/api/search-console/reports" && method === "POST") {
      state.imports.push(route.request().postDataJSON());
      state.reports = [state.imported, ...state.reports.filter(item => item.id !== state.imported.id)];
      return route.fulfill({ status: 201, json: { report: state.imported } });
    }
    if (pathname.startsWith("/api/search-console/reports/") && method === "GET") {
      const id = decodeURIComponent(pathname.split("/").at(-1)!);
      state.detailReads.push(id);
      const owned = state.owner ? state.reports.find(item => item.id === id) : undefined;
      const held = state.holdDetail;
      if (held) await held;
      // Logout and navigation intentionally abort reads; their route can be closed already.
      await route.fulfill(owned ? { json: { report: owned } }
        : { status: 404, json: { error: "Search Console report not found." } }).catch(() => {});
      state.finishedDetailReads.push(id);
      return;
    }
    if (pathname === "/api/search-console/connection" && method === "DELETE") {
      state.disconnects++;
      state.connected = false;
      return route.fulfill({ json: { success: true, disconnected: true } });
    }
    if (method !== "GET") {
      state.forbiddenWrites.push(`${method} ${pathname}`);
      return route.fulfill({ status: 409, json: { error: "This fixture forbids unrelated or paid work." } });
    }
    if (pathname === "/api/agents/status") return route.fulfill({ json: connection });
    if (pathname === "/api/evaluations") return route.fulfill({ json: { runs: [], connection, suite: EVAL_SUITE } });
    if (pathname === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (pathname === "/api/sites") return route.fulfill({ json: { sites: [] } });
    if (pathname === "/api/seo-data") return route.fulfill({ json: { configured: false, authorized: false } });
    if (pathname === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    state.unexpectedRequests.push(`${method} ${pathname}`);
    return route.fulfill({ status: 404, json: { error: "No other API is enabled in this browser fixture." } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://accounts.google.com/**", "https://www.googleapis.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}

async function navigate(page: Page, path: string) {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
}

function results(page: Page) {
  return page.getByRole("region", { name: "Search Console report", exact: true });
}

test("Search Console imports only after property selection and one explicit action", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/search-console");
  const load = page.getByRole("button", { name: "Load Search Console properties", exact: true });
  await expect(load).toBeEnabled();
  const setup = page.getByRole("list", { name: "Search Console setup", exact: true });
  await expect(setup.getByRole("listitem")).toHaveCount(3);
  await expect(setup.locator('[aria-current="step"]')).toHaveText("3Import website");
  expect(state.propertyReads).toBe(0);
  expect(state.imports).toEqual([]);
  await load.click();
  await page.getByLabel("Search Console property", { exact: true }).selectOption(alphaProperty);
  expect(state.imports).toEqual([]);
  await page.getByRole("button", { name: "Import search data", exact: true }).click();
  await expect(results(page)).toContainText("alpha private search");
  await expect(results(page)).toBeFocused();
  await expect(results(page).getByRole("heading", { name: alphaProperty, exact: true })).toBeInViewport();
  await expect(page).toHaveURL(/\/search-console\?report=search-console-alpha$/);
  for (const name of ["Top searches", "Top pages", "Daily performance"])
    await expect(results(page).getByRole("heading", { name, exact: true })).toBeVisible();
  expect(state.imports).toEqual([{ property: alphaProperty }]);
  expect(state.propertyReads).toBe(1);
  expect(state.forbiddenWrites).toEqual([]);
  expect(state.unexpectedRequests).toEqual([]);
  await noOverflow(page);
});

test("saved Search Console reports survive direct entry, reopen, refresh, and browser history without importing", async ({ page }) => {
  const alpha = report();
  const beta = report("search-console-beta", betaProperty, "beta private search");
  const state = await fixture(page, [alpha, beta]);
  await page.goto(`/search-console?report=${alpha.id}`);
  await expect(results(page)).toContainText("alpha private search");
  await expect(results(page)).not.toBeFocused();
  await page.getByRole("button", { name: `Open Search Console report for ${beta.property}`, exact: true }).click();
  await expect(results(page)).toContainText("beta private search");
  await expect(results(page)).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(/report=search-console-alpha$/);
  await expect(results(page)).toContainText("alpha private search");
  await page.goForward();
  await expect(results(page)).toContainText("beta private search");
  await page.reload();
  await expect(results(page)).toContainText("beta private search");
  await expect(results(page)).not.toBeFocused();
  await navigate(page, "/settings");
  await navigate(page, "/search-console");
  await page.getByRole("button", { name: `Open Search Console report for ${alpha.property}`, exact: true }).click();
  await expect(results(page)).toContainText("alpha private search");
  expect(state.detailReads).toContain(alpha.id);
  expect(state.detailReads).toContain(beta.id);
  expect(state.propertyReads).toBe(0);
  expect(state.imports).toEqual([]);
  expect(state.forbiddenWrites).toEqual([]);
  await noOverflow(page);
});

test("partial Search Console evidence keeps unavailable totals distinct from zero", async ({ page }) => {
  const partial: Report = { ...report(), totals: null, queries: [], status: "partial",
    warnings: ["Fixture: total metrics could not be retrieved; available daily and page rows are retained."] };
  const state = await fixture(page, [partial]);
  await page.goto(`/search-console?report=${partial.id}`);
  await expect(results(page)).toBeVisible();
  await expect(results(page)).toContainText(/partial/i);
  await expect(results(page)).toContainText(partial.warnings[0]);
  await expect(results(page)).toContainText("Not available");
  await expect(results(page)).toContainText("https://alpha.example.com/pricing");
  await expect(results(page).getByRole("heading", { name: "Top searches", exact: true })).toBeVisible();
  expect(state.imports).toEqual([]);
  expect(state.forbiddenWrites).toEqual([]);
  await noOverflow(page);
});

test("disconnecting Search Console retains private saved report access without new imports", async ({ page }) => {
  const saved = report();
  const state = await fixture(page, [saved]);
  await page.goto("/search-console");
  await page.locator(".gsc-access summary").filter({ hasText: "Manage access" }).click();
  await page.getByRole("button", { name: "Disconnect Search Console", exact: true }).click();
  await expect.poll(() => state.disconnects).toBe(1);
  const reopen = page.getByRole("button", { name: `Open Search Console report for ${saved.property}`, exact: true });
  await expect(reopen).toBeVisible();
  await reopen.click();
  await expect(results(page)).toContainText("alpha private search");
  expect(state.imports).toEqual([]);
  expect(state.propertyReads).toBe(0);
  expect(state.forbiddenWrites).toEqual([]);
});

test("signed-out Search Console entry suppresses owner data and import requests", async ({ page }) => {
  const state = await fixture(page, [report()]);
  state.owner = null;
  await page.goto("/search-console?report=search-console-alpha");
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Search Console setup", exact: true }).locator('[aria-current="step"]'))
    .toHaveText("1Sign in");
  await expect(results(page)).toHaveCount(0);
  await expect(page.getByText("alpha private search", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Open Search Console report for / })).toHaveCount(0);
  expect(state.historyReads).toBe(0);
  expect(state.detailReads).toEqual([]);
  expect(state.propertyReads).toBe(0);
  expect(state.imports).toEqual([]);
  expect(state.forbiddenWrites).toEqual([]);
  await noOverflow(page);
});

test("Google sign-in and explicit Search Console linking use separate permission requests", async ({ page }) => {
  const state = await fixture(page);
  state.owner = null;
  state.connected = false;
  await page.goto("/login?next=%2Fsearch-console");
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect.poll(() => state.socialSignIns.length).toBe(1);
  expect(state.socialSignIns[0]).toMatchObject({ provider: "google", callbackURL: "/search-console" });
  expect(state.socialSignIns[0].scopes).toBeUndefined();
  expect(state.socialLinks).toEqual([]);

  state.owner = "alice";
  await page.goto("/search-console");
  await expect(page.getByRole("list", { name: "Search Console setup", exact: true }).locator('[aria-current="step"]'))
    .toHaveText("2Connect Google");
  await page.getByRole("button", { name: "Connect Google Search Console", exact: true }).click();
  await expect.poll(() => state.socialLinks.length).toBe(1);
  expect(state.socialLinks[0]).toMatchObject({ provider: "google", callbackURL: "/api/search-console/finish",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    additionalParams: { prompt: "consent", access_type: "offline" },
  });
  expect(state.imports).toEqual([]);
  expect(state.propertyReads).toBe(0);
  expect(state.forbiddenWrites).toEqual([]);
});

test("an explicit report selection moves focus only after its saved data arrives", async ({ page }) => {
  const saved = report();
  const state = await fixture(page, [saved]);
  let release: () => void = () => {};
  state.holdDetail = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/search-console");
  const open = page.getByRole("button", { name: `Open Search Console report for ${saved.property}`, exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => state.detailReads).toContain(saved.id);
  await expect(open).toBeFocused();
  await expect(results(page)).toHaveCount(0);
  release();
  await expect(results(page)).toBeFocused();
  await expect(results(page).getByRole("heading", { name: saved.property, exact: true })).toBeInViewport();
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(results(page)).toBeFocused();
  expect(state.imports).toEqual([]);
  expect(state.forbiddenWrites).toEqual([]);
});

test("logout clears Search Console evidence and late previous-owner reads stay cleared after another sign-in", async ({ page }) => {
  const alpha = report();
  const beta = report("search-console-bob", betaProperty, "bob private search");
  const state = await fixture(page, [alpha]);
  let release: () => void = () => {};
  state.holdDetail = new Promise<void>(resolve => { release = resolve; });
  await page.goto(`/search-console?report=${alpha.id}`);
  await expect.poll(() => state.detailReads).toContain(alpha.id);
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => state.owner).toBeNull();
  await navigate(page, "/search-console");
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toBeVisible();
  await expect(results(page)).toHaveCount(0);
  state.reports = [beta];
  state.holdDetail = null;
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => state.owner).toBe("bob");
  await expect(page).toHaveURL(/\/websites$/);
  await navigate(page, "/search-console");
  await page.getByRole("button", { name: `Open Search Console report for ${beta.property}`, exact: true }).click();
  await expect(results(page)).toContainText("bob private search");
  release();
  await expect.poll(() => state.finishedDetailReads).toContain(alpha.id);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(results(page)).not.toContainText("alpha private search");
  await expect(page.getByRole("button", { name: `Open Search Console report for ${alpha.property}`, exact: true })).toHaveCount(0);
  expect(state.imports).toEqual([]);
  expect(state.forbiddenWrites).toEqual([]);
});
