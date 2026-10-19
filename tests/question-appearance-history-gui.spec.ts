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
const primary = suite("chart-primary", "Primary questions", alpha, 2);
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
  const first = run(0, "completed"); first.id = "timeline-1"; first.createdAt = "2026-10-01T08:00:00.000Z";
  first.answer = { text: "First recorded answer.", mentions: [{ name: "Other fixture", url: beta.url }], citations: [{ url: beta.url }], limitations: ["Fixture only"] };
  const second = run(0, "completed"); second.id = "timeline-2"; second.createdAt = "2026-10-02T08:00:00.000Z";
  second.answer = { text: "Second recorded answer.", mentions: [{ name: "Other fixture", url: beta.url }], citations: [{ url: alpha.url }], limitations: ["Fixture only"] };
  const third = run(0, "completed"); third.id = "timeline-3"; third.createdAt = "2026-10-03T08:00:00.000Z";
  const pending = run(0, "queued"); pending.id = "timeline-pending"; pending.createdAt = "2026-10-04T08:00:00.000Z";
  const failed = run(0, "failed"); failed.id = "timeline-failed"; failed.createdAt = "2026-10-05T08:00:00.000Z";
  const otherQuestion = run(1, "completed"); otherQuestion.id = "timeline-other-question"; otherQuestion.createdAt = "2026-10-02T08:00:00.000Z";
  return [failed, third, first, pending, otherQuestion, second];
}

async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, runs: appearanceRuns(),
    writes: [] as string[], reads: [] as string[], detailReads: [] as string[], detailFailures: new Set<string>(), tamperDetail: false, detailsHold: null as Promise<void> | null, detailsCompleted: 0, historyError: false, historyHold: null as Promise<void> | null, historyCompleted: 0, nextCursor: null as string | null };
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



const timeline = (page: Page) => page.getByRole("region", { name: "Website appearance over time", exact: true });
const scroll = (page: Page) => timeline(page).getByRole("region", { name: "Dated website appearance observations", exact: true });
const lane = (page: Page, index: number) => timeline(page).locator("tbody > tr").nth(index);
async function loaded(page: Page) { await expect(timeline(page)).toBeVisible(); await expect(timeline(page).getByRole("status")).toHaveCount(0); }

function completedBatch(count: number): KeywordBenchmarkRun[] {
  return Array.from({ length: count }, (_, index) => {
    const value = run(0, "completed"); value.id = `history-cap-${index}`; value.createdAt = `2026-10-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`;
    return value;
  });
}

test("dated observations show separate chronological lanes and readable marks at3203907681440 without spending", async ({ page }, info) => {
  const state = await fixture(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.emulateMedia({ colorScheme: width === 320 || width === 768 ? "dark" : "light" });
    await page.setViewportSize({ width, height: 900 }); await page.goto(workspaceHref); await loaded(page);
    await expect(timeline(page)).toContainText("Showing latest 3 of 3 completed observations.");
    await expect(timeline(page)).toContainText("Oldest to newest, equally spaced.");
    await expect(timeline(page)).toContainText("Latest attempt: failed. It is not a completed observation.");
    await expect(timeline(page)).toContainText("Changes between saved answers do not establish that a website edit caused improvement");
    const headers = timeline(page).locator("thead a");
    const ids = await headers.evaluateAll(elements => elements.map(element => new URL((element as HTMLAnchorElement).href).searchParams.get("run")));
    expect(ids).toEqual(["timeline-1", "timeline-2", "timeline-3"]);
    await expect(lane(page, 0).locator("small")).toHaveText(["Not found", "Not found", "Yes"]);
    await expect(lane(page, 1).locator("small")).toHaveText(["Not found", "Yes", "Yes"]);
    const change = timeline(page).getByLabel("Change between latest two completed answers", { exact: true });
    await expect(change).toContainText("Now recommended"); await expect(change).toContainText("Unchanged · cited");
    await expect(scroll(page)).toHaveAttribute("tabindex", "0");
    for (const header of await timeline(page).locator("thead th").all()) {
      const outer = await header.boundingBox();
      for (const child of await header.locator("a, span").all()) {
        const box = await child.boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(outer!.y + outer!.height + 1);
      }
    }
    for (const mark of await timeline(page).locator(".question-history-mark").all()) {
      const box = await mark.boundingBox(); const small = await mark.locator("small").boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(small!.x).toBeGreaterThanOrEqual(box!.x - 1); expect(small!.x + small!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
      expect(small!.y + small!.height).toBeLessThanOrEqual(box!.y + box!.height + 1);
    }
    await timeline(page).screenshot({ path: info.outputPath(`history-${width}.png`), animations: "disabled" });
    await scroll(page).evaluate(element => { element.scrollLeft = element.scrollWidth; });
    const viewport = await scroll(page).boundingBox();
    for (const mark of [lane(page, 0).locator(".question-history-mark").last(), lane(page, 1).locator(".question-history-mark").last()]) {
      const box = await mark.boundingBox(); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1); expect(box!.x).toBeGreaterThanOrEqual(viewport!.x + 100);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await timeline(page).screenshot({ path: info.outputPath(`history-last-${width}.png`), animations: "disabled" });
  }
  const exact = lane(page, 0).locator(".question-history-mark").last();
  const link = new URL((await exact.getAttribute("href"))!, "http://localhost:3001");
  expect(link.searchParams.get("suite")).toBe(primary.id); expect(link.searchParams.get("case")).toBe(primary.cases[0].id); expect(link.searchParams.get("website")).toBe(alpha.id); expect(link.searchParams.get("run")).toBe("timeline-3");
  await exact.click(); await expect(page.getByRole("region", { name: "Recorded answer", exact: true })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test("a missing adjacent answer, unknown identity or changed settings cannot become an improvement claim", async ({ page }) => {
  const state = await fixture(page); state.detailFailures.add("timeline-2");
  await page.goto(workspaceHref); await loaded(page);
  await expect(lane(page, 0).locator("small")).toHaveText(["Not found", "Unavailable", "Yes"]);
  await expect(timeline(page).getByLabel("Change between latest two completed answers", { exact: true })).toContainText("Both latest completed saved answers must be available.");
  state.detailFailures.clear();
  const middle = state.runs.find(value => value.id === "timeline-2")!;
  middle.answer!.mentions = [{ name: "Unmatched identity", url: null }];
  await page.reload(); await loaded(page);
  await expect(lane(page, 0).locator("small")).toHaveText(["Not found", "Unknown", "Yes"]);
  const comparison = timeline(page).getByLabel("Change between latest two completed answers", { exact: true });
  await expect(comparison).toContainText("Comparison unavailable: a website identity is unknown.");
  await expect(comparison).toContainText("Unchanged · cited");
  state.runs.find(value => value.id === "timeline-3")!.model = "changed-fixture-model";
  await page.reload(); await loaded(page);
  await expect(comparison.locator("strong")).toHaveText(["Comparison unavailable", "Comparison unavailable"]);
  await expect(comparison).toContainText("The model changed.");
  expect(state.writes).toEqual([]);
});

test("selected question history is bounded, follows URL navigation and clears delayed details across owners", async ({ page }) => {
  const state = await fixture(page); state.runs = [...completedBatch(12), ...state.runs.filter(value => value.caseId === primary.cases[1].id)];
  await page.goto(workspaceHref); await loaded(page);
  await expect(timeline(page)).toContainText("Showing latest 10 of 12 completed observations.");
  const fetched = state.detailReads.filter(path => path.includes("history-cap-"));
  expect(new Set(fetched).size).toBe(10); expect(fetched.length).toBe(10);
  expect(fetched.some(path => path.endsWith("history-cap-0") || path.endsWith("history-cap-1"))).toBe(false);
  const selector = timeline(page).getByRole("combobox", { name: "Question appearance history", exact: true });
  await selector.selectOption(primary.cases[1].id);
  expect(new URL(page.url()).searchParams.get("case")).toBe(primary.cases[1].id);
  await expect(timeline(page)).toContainText("One completed observation. Another comparable answer is needed to see change.");
  await page.reload(); await expect(selector).toHaveValue(primary.cases[1].id);
  await page.goBack(); await expect(selector).toHaveValue(primary.cases[0].id);
  await page.goForward(); await expect(selector).toHaveValue(primary.cases[1].id);
  await page.getByRole("combobox", { name: "Workspace question suite", exact: true }).selectOption(secondary.id);
  await expect(timeline(page)).toContainText("No completed observations for this question yet.");
  await expect(timeline(page).getByRole("table")).toHaveCount(0);
  await page.goto(`${workspaceHref}&case=${primary.cases[1].id}&model=other-model`); await loaded(page);
  await expect(selector).toHaveValue(primary.cases[1].id); await expect(timeline(page)).toContainText("No completed observations for this question yet.");
  let release!: () => void; state.detailsHold = new Promise<void>(resolve => { release = resolve; });
  await page.goto(workspaceHref); await expect(timeline(page).getByRole("status")).toHaveText("Loading saved observations…");
  await selector.selectOption(primary.cases[1].id); await expect(selector).toHaveValue(primary.cases[1].id);
  await expect(timeline(page).locator(".question-history-question")).toHaveText(primary.cases[1].query);
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  state.detailsHold = null; release(); await expect.poll(() => state.detailsCompleted).toBeGreaterThan(0);
  await page.goto("/login"); await page.getByLabel("Email address", { exact: true }).fill("bob@example.test"); await page.getByLabel("Password", { exact: true }).fill("Fixture browser password only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.goto(`/overview?view=workspace&website=${beta.id}`); await loaded(page);
  await expect(timeline(page)).toContainText("No completed observations for this question yet."); await expect(timeline(page)).not.toContainText(primary.cases[0].query);
  expect(state.writes).toEqual([]);
});
