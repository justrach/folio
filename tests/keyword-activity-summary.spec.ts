import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE } from "../src/lib/evals";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";

const at = "2026-09-13T08:00:00.000Z";
function run(index: number): KeywordBenchmarkRun {
  return { id: `activity-run-${index}`, suiteId: "activity-suite", caseId: `activity-case-${index}`, kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "PRIVATE_MODEL_NAME", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture",
    case: {query: `Private keyword question ${index}`, targetUrl: "https://example.com/", language: "en", locale: "US", rubricVersion: "fixture"},
    status: "completed", sessionId: `PRIVATE_SESSION_${index}`, createAttemptAt: at, allowedDomains: ["example.com"],
    deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, createdAt: `2026-09-13T08:0${index}:00.000Z`, updatedAt: at, revision: 1,
    answer: {text: "Saved fixture keyword answer.", mentions: [], citations: [], limitations: ["Fixture only."]},
    usage: {inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null},
    providerMetadata: {environmentId: null, requestId: null, turnId: null}, error: null,
  };
}
async function fixture(page: Page) {
  const state = {signedIn: true, runs: [run(0), run(1), run(2), run(3)], reads: 0, posts: [] as string[]};
  const connection = {configured: false, authorized: false, canRun: false, model: "fixture", status: "disconnected", message: "Fixture"};
  const suite = {id: "activity-suite", name: "Fixture keyword questions", description: "Browser fixture", createdAt: at,
    cases: state.runs.map(value => ({...value.case, id: value.caseId, suiteId: value.suiteId, revision: 0, createdAt: at, updatedAt: at}))};
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/auth/get-session") return route.fulfill({json: state.signedIn ? {
      user: {id: "PRIVATE_ACTIVITY_OWNER", name: "Activity reviewer", email: "activity@example.test", emailVerified: true},
      session: {id: "fixture-session", userId: "PRIVATE_ACTIVITY_OWNER", expiresAt: "2099-01-01T00:00:00Z"},
    } : null});
    if (path === "/api/auth/sign-out") {state.signedIn = false; return route.fulfill({json: {success: true}});}
    if (request.method() !== "GET") {state.posts.push(path); return route.fulfill({status: 409, json: {error: "Fixture forbids new work"}});}
    if (path === "/api/benchmarks/runs") {state.reads++; return route.fulfill({json: {runs: state.runs.map(({answer, ...value}) => ({...value, answerCharacters: answer?.text.length ?? 0, mentionCount: 0, citationCount: 0}))}});}
    if (path.startsWith("/api/benchmarks/runs/")) return route.fulfill({json: {run: state.runs.find(value => path.endsWith(value.id))}});
    if (path === "/api/benchmarks/activity-suite") return route.fulfill({json: {suite}});
    if (path === "/api/benchmarks") return route.fulfill({json: {suites: [{...suite, cases: undefined, caseCount: 4}], templates: [],
      access: {...connection, maxRunsPerDay: 6, maxActiveRuns: 1}, usage: {attemptsLast24Hours: 4, remainingRuns: 2, activeRuns: 0, remainingActiveRuns: 1}}});
    if (path === "/api/agents/status") return route.fulfill({json: connection});
    if (path === "/api/evaluations") return route.fulfill({json: {runs: [], connection, suite: EVAL_SUITE}});
    if (path === "/api/scans") return route.fulfill({json: {scans: []}});
    if (path === "/api/sites") return route.fulfill({json: {sites: []}});
    if (path === "/api/seo-data") return route.fulfill({json: {configured: false, authorized: false}});
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({json: {reports: []}});
    return route.fulfill({status: 404, json: {error: "Unavailable in this fixture"}});
  });
  return state;
}
const activity = (page: Page) => page.getByRole("region", {name: "Keyword evaluation activity", exact: true});

test("keyword activity opens the exact saved run, shows only latest three, and clears on logout without starting work", async ({page}) => {
  const state = await fixture(page);
  await page.goto("/agents");
  const panel = activity(page);
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  await expect(panel).toContainText("Private keyword question 3");
  await expect(panel).not.toContainText("Private keyword question 0");
  await expect(panel).not.toContainText("PRIVATE_MODEL_NAME");
  await expect(panel).not.toContainText("PRIVATE_SESSION");
  await expect(panel).not.toContainText("PRIVATE_ACTIVITY_OWNER");
  const target = panel.getByRole("link", {name: "Private keyword question 3", exact: true});
  await expect(target).toHaveAttribute("href", "/benchmarks?suite=activity-suite&run=activity-run-3");
  await target.click();
  await expect(page).toHaveURL(/\/benchmarks\?suite=activity-suite&run=activity-run-3$/);
  await expect(page.getByRole("region", {name: "Keyword observation", exact: true})).toContainText("Saved fixture keyword answer.");
  expect(state.posts).toEqual([]);
  await page.goto("/settings");
  await page.getByRole("button", {name: "Sign out", exact: true}).click();
  await expect(page.getByRole("link", {name: "Sign in with Better Auth"})).toBeVisible();
  const before = state.reads;
  await page.goto("/overview");
  await expect(activity(page)).toHaveCount(0);
  await expect(page.getByText("Private keyword question 3", {exact: true})).toHaveCount(0);
  expect(state.reads).toBe(before); expect(state.posts).toEqual([]);
});

test("keyword activity polls saved GET state while active and stops when the run finishes", async ({page}) => {
  await page.clock.install();
  const state = await fixture(page);
  state.runs = [{...run(3), status: "running", answer: null}];
  await page.goto("/agents");
  await expect(activity(page)).toContainText("Running");
  expect(state.reads).toBe(1); expect(state.posts).toEqual([]);
  await page.clock.runFor(10_100);
  await expect.poll(() => state.reads).toBe(2);
  state.runs = [run(3)];
  await page.clock.runFor(10_100);
  await expect(activity(page)).toContainText("Completed");
  expect(state.reads).toBe(3);
  await page.clock.runFor(30_000);
  expect(state.reads).toBe(3); expect(state.posts).toEqual([]);
  await activity(page).getByRole("button", {name: "Refresh saved keyword activity", exact: true}).click();
  await expect.poll(() => state.reads).toBe(4);
  expect(state.posts).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});
