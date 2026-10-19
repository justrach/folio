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
const primary = suite("chart-primary", "Primary questions", alpha, 10);
const secondary = suite("chart-secondary", "Alternate questions", alpha, 1);
const foreign = suite("chart-foreign", "Beta private questions", beta, 2);
function run(index: number, status: KeywordBenchmarkRun["status"], changed = false): KeywordBenchmarkRun {
  return { id: `chart-run-${index}`, suiteId: primary.id, caseId: primary.cases[index].id, case: { ...primary.cases[index], ...(changed ? { query: "Earlier question wording" } : {}) }, kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "fixture-model", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture", status,
    sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at, revision: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null,
    answer: status === "completed" ? { text: "A recorded fixture answer.", mentions: [{ name: alpha.name, url: alpha.url }], citations: [{ url: alpha.url, title: "Fixture source" }], limitations: ["Fixture only"] } : null };
}
function appearanceRuns(): KeywordBenchmarkRun[] {
  const values = [0, 1, 2, 3, 6, 7, 8, 9].map(index => run(index, "completed", index === 6));
  values[0].answer!.mentions.push({ name: "Unmatched other entry", url: null });
  values[0].answer!.citations.push({ url: "unavailable-source", title: "Unmatched citation" });
  values.find(value => value.caseId === primary.cases[1].id)!.answer!.mentions = [{ name: "Other fixture", url: beta.url }];
  values.find(value => value.caseId === primary.cases[2].id)!.answer = { text: "Other returned answer.", mentions: [{ name: "Other fixture", url: beta.url }], citations: [{ url: beta.url }], limitations: ["Fixture only"] };
  values.find(value => value.caseId === primary.cases[3].id)!.answer = { text: "An unresolved identity answer.", mentions: [{ name: "Unmatched fixture", url: null }], citations: [{ url: "unavailable-source" }], limitations: ["Fixture only"] };
  values.find(value => value.caseId === primary.cases[8].id)!.answer!.citations = [];
  values.find(value => value.caseId === primary.cases[9].id)!.answer = { text: "No recommendations or source links were returned.", mentions: [], citations: [], limitations: ["Fixture only"] };
  const older = run(7, "completed"); older.id = "chart-run-7-older"; older.createdAt = "2026-10-17T08:00:00.000Z";
  const anotherModel = run(0, "completed"); anotherModel.id = "chart-other-model"; anotherModel.model = "other-model"; anotherModel.createdAt = "2026-10-17T08:00:00.000Z";
  anotherModel.answer = { text: "Other model fixture answer.", mentions: [{ name: "Other fixture", url: beta.url }], citations: [{ url: beta.url }], limitations: ["Fixture only"] };
  return [...values, run(4, "queued"), older, anotherModel];
}

async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, runs: appearanceRuns(),
    writes: [] as string[], reads: [] as string[], detailReads: [] as string[], detailFailures: new Set(["chart-run-7"]), tamperDetail: false, detailsHold: null as Promise<void> | null, detailsCompleted: 0, historyError: false, historyHold: null as Promise<void> | null, historyCompleted: 0, nextCursor: null as string | null };
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
        && (!url.searchParams.has("searchMode") || value.case.searchMode === url.searchParams.get("searchMode"))
        && (!url.searchParams.has("model") || value.model === url.searchParams.get("model")));
      const json = { runs: matching.map(({ answer, ...value }) => ({ ...value, answerCharacters: answer?.text.length ?? 0, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0 })), models: ["fixture-model", "other-model"], nextCursor: state.nextCursor };
      const fail = state.historyError;
      if (state.historyHold) await state.historyHold;
      await route.fulfill(fail ? { status: 503, json: { error: "Fixture history unavailable" } } : { json }).catch(() => {}); state.historyCompleted++; return;
    }
    if (path.startsWith("/api/benchmarks/runs/")) {
      const value = structuredClone(state.owner === "alice" ? state.runs.find(item => path.endsWith(item.id)) : null);
      state.detailReads.push(path);
      if (state.detailsHold) await state.detailsHold;
      if (value && state.tamperDetail && value.id === "chart-run-0") value.model = "mismatched-detail-model";
      await route.fulfill(value && !state.detailFailures.has(value.id) ? { json: { run: value } } : { status: 503, json: { error: "Fixture latest answer detail unavailable" } }).catch(() => {});
      state.detailsCompleted++; return;
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


const chart = (page: Page) => page.getByRole("region", { name: "Your website in saved answers", exact: true });
const row = (page: Page, index: number) => chart(page).locator("tbody > tr").nth(index);
async function values(page: Page, index: number, recommended: string, cited: string) {
  const cells = row(page, index).getByRole("cell");
  await expect(cells.nth(0).locator(".question-appearance-value")).toHaveText(new RegExp(`${recommended}$`));
  await expect(cells.nth(1).locator(".question-appearance-value")).toHaveText(new RegExp(`${cited}$`));
}
async function loaded(page: Page) {
  await expect(chart(page)).toBeVisible();
  await expect(chart(page).getByRole("status")).toHaveCount(0);
}

test("workspace shows independent website recommendation and citation observations at3203907681440", async ({ page }, info) => {
  const state = await fixture(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.emulateMedia({ colorScheme: width === 320 || width === 768 ? "dark" : "light" });
    await page.setViewportSize({ width, height: 900 }); await page.goto(workspaceHref); await loaded(page);
    await expect(chart(page).getByRole("table")).toBeVisible();
    await expect(chart(page).getByRole("table")).toHaveAccessibleName("Appearance across your current saved questions");
    await values(page, 0, "Yes", "Yes");
    await values(page, 1, "Not found", "Yes");
    await values(page, 2, "Not found", "Not found");
    await values(page, 3, "Unknown", "Unknown");
    await values(page, 4, "Unmeasured", "Unmeasured"); await expect(row(page, 4)).toContainText("Latest attempt pending");
    await values(page, 5, "Unmeasured", "Unmeasured"); await expect(row(page, 5)).toContainText("No completed answer for this question");
    await values(page, 6, "Unmeasured", "Unmeasured"); await expect(row(page, 6)).toContainText("Inputs changed");
    await values(page, 7, "Unavailable", "Unavailable"); await expect(row(page, 7)).toContainText("Latest completed run’s saved answer is unavailable");
    await values(page, 8, "Yes", "Not found"); await values(page, 9, "Not found", "Not found");
    await expect(row(page, 0)).toContainText(/fixture-model · Started (?:18 Oct 2026|Oct 18, 2026)/);
    await expect(chart(page)).toContainText("This is not a Google ranking or a consumer AI visibility score.");
    for (const element of await chart(page).locator("h2, table, .question-appearance-footer").all()) {
      const outer = await chart(page).boundingBox(); const box = await element.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(outer!.x + 15); expect(box!.x + box!.width).toBeLessThanOrEqual(outer!.x + outer!.width - 15);
    }
    for (const cell of await chart(page).locator(".question-appearance-value").all()) {
      await cell.scrollIntoViewIfNeeded(); await expect(cell).toBeVisible();
      const box = await cell.boundingBox(); expect(box!.width).toBeGreaterThan(35); expect(box!.height).toBeGreaterThanOrEqual(18);
    }
    for (const recordRow of await chart(page).locator("tbody > tr").all()) {
      const heading = recordRow.getByRole("rowheader"); const headingBox = await heading.boundingBox();
      for (const content of await heading.locator("a, .question-appearance-run, .question-appearance-note").all()) {
        const box = await content.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(headingBox!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(headingBox!.x + headingBox!.width + 1);
        expect(box!.y + box!.height).toBeLessThanOrEqual(headingBox!.y + headingBox!.height + 1);
      }
      const cells = await recordRow.getByRole("cell").all();
      for (const cell of cells) {
        const cellBox = await cell.boundingBox(); const content = await cell.locator(".question-appearance-value").boundingBox();
        expect(content!.x).toBeGreaterThanOrEqual(cellBox!.x - 1);
        expect(content!.x + content!.width).toBeLessThanOrEqual(cellBox!.x + cellBox!.width + 1);
        if (width <= 700) expect(cellBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height - 1);
      }
    }
    const boxes = await chart(page).locator("tbody > tr").evaluateAll(rows => rows.map(element => { const box = element.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; }));
    for (let index = 1; index < boxes.length; index++) expect(boxes[index].top).toBeGreaterThanOrEqual(boxes[index - 1].bottom - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await chart(page).screenshot({ path: info.outputPath(`actual-appearance-${width}.png`), animations: "disabled" });
  }
  const answer = row(page, 0).getByRole("link", { name: "Open saved answer", exact: false });
  const href = new URL((await answer.getAttribute("href"))!, "http://localhost:3001");
  expect(href.searchParams.get("suite")).toBe(primary.id); expect(href.searchParams.get("case")).toBe(primary.cases[0].id);
  expect(href.searchParams.get("website")).toBe(alpha.id); expect(href.searchParams.get("run")).toBe("chart-run-0");
  await answer.click(); await expect(page.getByRole("region", { name: "Recorded answer", exact: true })).toContainText("A recorded fixture answer.");
  expect(state.writes).toEqual([]);
});

test("appearance uses selected suite, site and model and never replaces failed latest detail with an older answer", async ({ page }) => {
  const state = await fixture(page);
  await page.goto(workspaceHref); await loaded(page);
  await values(page, 7, "Unavailable", "Unavailable");
  await expect(row(page, 7).getByRole("link", { name: "Open saved answer", exact: false })).toHaveAttribute("href", /run=chart-run-7$/);
  state.tamperDetail = true; await page.reload(); await loaded(page);
  await values(page, 0, "Unavailable", "Unavailable");
  state.tamperDetail = false;
  await page.goto(`${workspaceHref}&model=other-model`); await loaded(page);
  await values(page, 0, "Not found", "Not found"); await expect(row(page, 0)).toContainText("other-model");
  await expect(row(page, 0).getByRole("link", { name: "Open saved answer", exact: false })).toHaveAttribute("href", /run=chart-other-model$/);
  await page.getByRole("combobox", { name: "Workspace question suite", exact: true }).selectOption(secondary.id);
  await expect(chart(page)).toContainText("No completed answers for these current question inputs yet.");
  await expect(chart(page).getByRole("table")).toHaveCount(0);
  await page.reload(); await expect(chart(page)).toContainText("No completed answers for these current question inputs yet.");
  await page.getByLabel("Selected website", { exact: true }).selectOption(beta.id);
  await expect(chart(page)).toContainText("No completed answers for these current question inputs yet.");
  await expect(map(page)).toContainText(foreign.cases[0].query);
  await expect(chart(page)).not.toContainText(primary.cases[0].query);
  expect(state.writes).toEqual([]);
});

test("partial history stays unavailable and delayed private answer details clear on owner change", async ({ page }) => {
  const state = await fixture(page); state.nextCursor = "older-page";
  await page.goto(workspaceHref); await loaded(page);
  await expect(chart(page)).toContainText("Saved history is not confirmed. Website appearance is unavailable.");
  await expect(chart(page).getByRole("table")).toHaveCount(0);
  state.nextCursor = null;
  let release!: () => void; state.detailsHold = new Promise<void>(resolve => { release = resolve; });
  await page.reload(); await expect.poll(() => state.detailReads.length).toBeGreaterThan(0);
  await expect(chart(page).getByRole("status")).toHaveText("Loading saved answers…");
  await values(page, 0, "Loading", "Loading");
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  state.detailsHold = null; release(); await expect.poll(() => state.detailsCompleted).toBeGreaterThan(0);
  await page.goto("/login"); await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixture browser password only"); await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto(`/overview?view=workspace&website=${beta.id}`); await loaded(page);
  await expect(chart(page)).toContainText("No completed answers for these current question inputs yet.");
  await expect(chart(page).getByRole("table")).toHaveCount(0);
  await expect(chart(page)).not.toContainText(primary.cases[0].query); expect(state.writes).toEqual([]);
});
