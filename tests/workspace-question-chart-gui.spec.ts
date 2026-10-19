import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const alpha = { id: "chart-alpha", name: "Alpha fixture business", url: "https://chart-alpha-fixture.dev/" };
const beta = { id: "chart-beta", name: "Beta fixture business", url: "https://chart-beta-fixture.dev/" };
function suite(id: string, name: string, site: typeof alpha, count: number): KeywordBenchmarkSuite {
  return { id, name, description: "Browser fixture only", createdAt: at, cases: Array.from({ length: count }, (_, index) => ({
    id: `${id}-question-${index}`, suiteId: id, query: `${name}: which service helps with customer need ${index + 1}?`, targetUrl: site.url,
    searchMode: "open-web", revision: 0, createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture",
  })) };
}
const primary = suite("chart-primary", "Primary questions", alpha, 5);
const secondary = suite("chart-secondary", "Alternate questions", alpha, 1);
const foreign = suite("chart-foreign", "Beta private questions", beta, 2);
function run(index: number, status: KeywordBenchmarkRun["status"], changed = false): KeywordBenchmarkRun {
  return { id: `chart-run-${index}`, suiteId: primary.id, caseId: primary.cases[index].id, case: { ...primary.cases[index], ...(changed ? { query: "Earlier question wording" } : {}) }, kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "fixture-model", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture", status,
    sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at, revision: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null,
    answer: status === "completed" ? { text: "A recorded fixture answer.", mentions: [{ name: alpha.name, url: alpha.url }], citations: [{ url: alpha.url, title: "Fixture source" }], limitations: ["Fixture only"] } : null };
}
async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, runs: [run(0, "completed"), run(1, "queued"), run(2, "failed"), run(3, "completed", true)],
    writes: [] as string[], reads: [] as string[], historyError: false, historyHold: null as Promise<void> | null, historyCompleted: 0, nextCursor: null as string | null };
  const user = () => ({ id: state.owner!, name: "Fixture owner", email: `${state.owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at });
  const sites = () => state.owner === "alice" ? [alpha, beta] : state.owner ? [beta] : [];
  const suites = () => state.owner === "alice" ? [primary, secondary, foreign] : state.owner ? [foreign] : [];
  await page.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: user(), session: { id: `fixture-${state.owner}`, userId: state.owner, token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/sign-in/email") { state.owner = "bob"; return route.fulfill({ json: { user: user(), token: "fixture", redirect: false } }); }
    if (request.method() !== "GET") { state.writes.push(`${request.method()} ${path}`); return route.fulfill({ status: 409, json: { error: "Fixture prohibits all provider and application writes" } }); }
    state.reads.push(request.url());
    if (path === "/api/sites") return route.fulfill({ json: { sites: sites() } });
    if (path === "/api/onboarding") return route.fulfill({ json: { profile: null } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: suites().map(value => ({ ...value, cases: undefined, caseCount: value.cases.length })), templates: [],
      access: { configured: false, authorized: false, canRun: false, maxRunsPerDay: 3, maxActiveRuns: 1 }, usage: { attemptsLast24Hours: 0, remainingRuns: 3, activeRuns: 0, remainingActiveRuns: 1 } } });
    const selectedSuite = suites().find(value => path === `/api/benchmarks/${value.id}`);
    if (selectedSuite) return route.fulfill({ json: { suite: selectedSuite } });
    if (path === "/api/benchmarks/runs") {
      const matching = state.runs.filter(value => state.owner === "alice" && (!url.searchParams.has("suiteId") || value.suiteId === url.searchParams.get("suiteId"))
        && (!url.searchParams.has("websiteId") || value.case.targetUrl === (url.searchParams.get("websiteId") === alpha.id ? alpha.url : beta.url))
        && (!url.searchParams.has("searchMode") || value.case.searchMode === url.searchParams.get("searchMode")));
      const json = { runs: matching.map(({ answer, ...value }) => ({ ...value, answerCharacters: answer?.text.length ?? 0, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0 })), models: ["fixture-model"], nextCursor: state.nextCursor };
      const fail = state.historyError;
      if (state.historyHold) await state.historyHold;
      await route.fulfill(fail ? { status: 503, json: { error: "Fixture history unavailable" } } : { json }).catch(() => {}); state.historyCompleted++; return;
    }
    if (path.startsWith("/api/benchmarks/runs/")) {
      const value = state.owner === "alice" ? state.runs.find(item => path.endsWith(item.id)) : null;
      return route.fulfill(value ? { json: { run: value } } : { status: 404, json: { error: "Not found" } });
    }
    if (path === "/api/benchmarks/comparison") return route.fulfill({ json: { snapshots: [], failedReads: 0 } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    return route.fulfill({ status: 404, json: { error: "Fixture has no other API" } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}
const map = (page: Page) => page.getByRole("region", { name: "Your saved question map", exact: true });
const workspaceHref = `/overview?view=workspace&website=${alpha.id}`;

async function expectChart(page: Page, counts: number[]) {
  const chart = map(page).getByRole("img", { name: /^Research progress across saved questions/ });
  await expect(chart).toBeVisible();
  const labels = ["Answer recorded", "Awaiting answer", "Needs attention", "Inputs changed", "Not run"];
  const legend = map(page).getByRole("list", { name: "Research progress counts", exact: true });
  for (const [index, label] of labels.entries())
    await expect(legend.getByRole("listitem").filter({ hasText: label }).locator("strong")).toHaveText(String(counts[index]));
  await expect(map(page).locator(".saved-question-chart")).toContainText("Each question appears once in the chart.");
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(await map(page).locator(".saved-question-map-grid > li").count());
}

// Chart assertions are added against the shared component's accessible category counts.
test("workspace maps one owned suite at a time and opens exact saved runs or questions without spending", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(`${workspaceHref}&suite=${foreign.id}`);
  await expect(map(page)).toContainText("1 of 5 saved questions have recorded answers");
  await expect(page.getByRole("combobox", { name: "Workspace question suite", exact: true })).toHaveValue(primary.id);
  await expectChart(page, [1, 1, 1, 1, 1]);
  const completed = map(page).getByRole("link", { name: /^Question 1:/ });
  await expect(completed).toHaveAttribute("href", new RegExp(`suite=${primary.id}.*case=${primary.cases[0].id}.*website=${alpha.id}.*run=chart-run-0`));
  await expect(map(page).getByRole("link", { name: /^Question 4:/ })).toContainText("Inputs changed");
  await completed.click();
  await expect(page.getByRole("region", { name: "Recorded answer", exact: true })).toContainText("A recorded fixture answer.");
  await page.reload(); await expect(map(page)).toContainText("1 of 5 saved questions have recorded answers");
  await page.goBack(); await expect(map(page)).toContainText("1 of 5 saved questions have recorded answers");
  await page.getByRole("combobox", { name: "Workspace question suite", exact: true }).selectOption(secondary.id);
  await expect(map(page)).toContainText("0 of 1 saved questions have recorded answers");
  await expectChart(page, [0, 0, 0, 0, 1]);
  expect(new URL(page.url()).searchParams.get("suite")).toBe(secondary.id);
  await page.reload(); await expect(map(page)).toContainText("0 of 1 saved questions have recorded answers");
  await page.goBack(); await expect(map(page)).toContainText("1 of 5 saved questions have recorded answers");
  await page.goForward(); await expect(map(page)).toContainText("0 of 1 saved questions have recorded answers");
  await page.getByLabel("Selected website", { exact: true }).selectOption(beta.id);
  await expect(map(page)).toContainText("0 of 2 saved questions have recorded answers");
  await expect(map(page)).not.toContainText(primary.cases[0].query);
  await page.goBack(); await expect(map(page)).toContainText("0 of 1 saved questions have recorded answers");
  await map(page).getByRole("link", { name: /^Question 1:/ }).click();
  const params = new URL(page.url()).searchParams;
  expect(params.get("suite")).toBe(secondary.id); expect(params.get("case")).toBe(secondary.cases[0].id); expect(params.get("website")).toBe(alpha.id); expect(params.has("run")).toBe(false);
  await expect(page.locator(".guided-run-question")).toHaveText(secondary.cases[0].query);
  expect(state.writes).toEqual([]);
});

test("unknown workspace history never becomes a zero-answer chart and owner changes discard late counts", async ({ page }) => {
  const state = await fixture(page); state.historyError = true;
  await page.goto(workspaceHref);
  await expect(map(page)).toContainText("Saved history is not confirmed");
  await expect(map(page)).not.toContainText("0 of 5 saved questions");
  await expect(map(page).getByRole("img", { name: /^Research progress/ })).toHaveCount(0);
  await expect(map(page).getByRole("list", { name: "Research progress counts", exact: true })).toHaveCount(0);
  await expect(map(page)).toContainText("Progress counts are unavailable.");
  state.historyError = false; state.nextCursor = "older-fixture-page";
  await page.reload(); await expect(map(page)).toContainText("Saved history is not confirmed");
  await expect(map(page).getByRole("img", { name: /^Research progress/ })).toHaveCount(0);
  state.nextCursor = null;
  let release!: () => void; state.historyHold = new Promise<void>(resolve => { release = resolve; });
  await page.reload(); await expect(map(page)).toContainText("Saved history is not confirmed");
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  state.historyHold = null; release(); await expect.poll(() => state.historyCompleted).toBeGreaterThan(1);
  await page.goto("/login"); await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixture browser password only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto(`/overview?view=workspace&website=${beta.id}`);
  await expect(map(page)).toContainText("0 of 2 saved questions have recorded answers");
  await expect(map(page)).not.toContainText(primary.cases[0].query);
  await expect(page.getByRole("combobox", { name: "Workspace question suite", exact: true })).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

test("workspace chart, labels and tiles remain aligned and unclipped at3203907681440", async ({ page }, info) => {
  const state = await fixture(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(workspaceHref);
    await expect(map(page)).toContainText("1 of 5 saved questions have recorded answers");
    await expectChart(page, [1, 1, 1, 1, 1]);
    const bounds = await map(page).boundingBox(); expect(bounds).not.toBeNull();
    for (const element of await map(page).locator("h2, .saved-question-chart-bar, .saved-question-chart-legend, .saved-question-map-grid, .saved-question-map-list").all()) {
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox(); expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(bounds!.x + 15);
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width - 15);
    }
    for (const tile of await map(page).locator(".saved-question-mark").all()) {
      const box = await tile.boundingBox(); const label = await tile.locator(".saved-question-mark-label").boundingBox();
      expect(label!.x).toBeGreaterThanOrEqual(box!.x + 9); expect(label!.x + label!.width).toBeLessThanOrEqual(box!.x + box!.width - 9);
      expect(label!.y + label!.height).toBeLessThanOrEqual(box!.y + box!.height - 9);
    }
    expect(await map(page).locator(".saved-question-chart-bar").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`workspace-chart-${width}.png`), fullPage: true, animations: "disabled" });
  }
  expect(state.writes).toEqual([]);
});
