import { expect, test, type Page } from "@playwright/test";
import type { PublicCollectionStatus, PublicDashboardData, PublicDashboardQuery } from "../src/lib/public-dashboard";
import type { PublicSearchObservation } from "../src/lib/public-search-rankings";

const at = "2026-09-13T09:00:00.000Z";
const audiences = ["Shops & brands", "Software & work", "Learning", "Services & travel", "Developer tools"] as const;
const questions = [
  "Which online clothing brands offer reliable everyday basics for shoppers in the United States?",
  "Which small-team project tools make shared planning and document collaboration straightforward?",
  "Where can a beginner learn Python through structured online courses with exercises and clear explanations that remain useful when studying on a phone?",
  "Which travel services help compare flexible family accommodation?",
  "Which developer tools help explain an unfamiliar source repository?",
  ...Array.from({ length: 10 }, (_, index) => `Which useful products suit the public fixture task number ${index + 6}?`),
];
const published: PublicSearchObservation = {
  id: "fixture-public-observation", queryId: "fixture-task-1", observedAt: at, status: "completed", model: "gpt-6-astra",
  surface: "openai-managed-agents", searchMode: "open-web", harnessVersion: "keyword-open-web-v2", environmentType: "openai_hosted",
  recommendations: [
    { position: 1, name: "Beta Basics", url: "https://beta.example.com/", reason: "The returned answer highlighted its everyday clothing range.", citationUrls: ["https://beta.example.com/basics"] },
    { position: 2, name: "Alpha Clothing", url: "https://alpha.example.com/", reason: "The returned answer discussed its plain shirts and flexible sizing.", citationUrls: ["https://alpha.example.com/about"] },
    { position: 3, name: "Cedar Collection", url: null, citationUrls: [] },
  ],
  citations: [{ url: "https://beta.example.com/basics", title: "Beta product source" }, { url: "https://alpha.example.com/about", title: "Alpha company source" }],
  limitations: ["One recorded answer; its order is not a general measure of market quality."],
};
function fixture(): PublicDashboardData {
  const initialStatuses: PublicCollectionStatus[] = ["completed", "completed", "running", "failed", "unresolved", "queued", "cancelled"];
  const queries: PublicDashboardQuery[] = questions.map((query, index) => {
    const status: PublicCollectionStatus = initialStatuses[index] ?? "not-started";
    return { id: `fixture-task-${index + 1}`, audience: audiences[index % audiences.length], category: `Fixture category ${index + 1}`,
      query, language: "en", locale: "en-US", collection: { status, startedAt: status === "not-started" ? null : at,
        finishedAt: status === "completed" || status === "failed" || status === "cancelled" ? at : null },
      resultStatus: index === 0 ? "published" : index === 1 ? "awaiting-publication" : "not-published",
      latestObservation: index === 0 ? structuredClone(published) : null, observationCount: index === 0 ? 1 : 0 };
  });
  return { format: "folio-public-dashboard-v1", updatedAt: at, summary: {
    queryCount: 15, publishedQueryCount: 1, publishedObservationCount: 1, completedUnpublishedQueryCount: 1,
    collection: { notStarted: 8, queued: 1, running: 1, completed: 2, failed: 1, cancelled: 1, unresolved: 1 },
    uniqueRecommendedWebsiteCount: 2, uniqueCitedSourceCount: 2,
  }, queries, observations: [structuredClone(published)], htmlCoverage: {
    catalogWebsiteCount: 36, measuredHomepageCount: 34, unavailableHomepageCount: 1, notMeasuredHomepageCount: 1,
    generatedAt: at, suiteVersion: "readiness-v1", scope: "Public homepage fixture measurements, separate from search observations.",
  } };
}
async function setup(page: Page) {
  const state: { response: unknown; publicReads: number; forbidden: string[] } = { response: fixture(), publicReads: 0, forbidden: [] };
  await page.route("**/api/**", async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === "/api/public/benchmarks" && request.method() === "GET") {
      state.publicReads++; return route.fulfill({ json: state.response });
    }
    state.forbidden.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 403, json: { error: "Public browser fixtures block authentication, private data, and paid operations." } });
  });
  for (const url of ["https://api.openai.com/**", "https://api.dataforseo.com/**"])
    await page.route(url, route => { state.forbidden.push(`PROVIDER ${route.request().method()}`); return route.abort(); });
  return state;
}
async function selectTask(page: Page, index: number) {
  const mobileSelect = page.getByRole("combobox", { name: "Task", exact: true });
  if (await mobileSelect.isVisible()) await mobileSelect.selectOption(`fixture-task-${index + 1}`);
  else await page.getByRole("button", { name: `Open task: ${questions[index]}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/overview\\?query=fixture-task-${index + 1}$`));
  await expect(page.getByRole("region", { name: "Selected task", exact: true }).getByRole("heading", { name: questions[index], exact: true })).toBeVisible();
}
function noPrivateWork(state: Awaited<ReturnType<typeof setup>>) { expect(state.forbidden, "The public dashboard must not request identity, private records, or provider work").toEqual([]); }

test("signed-out overview presents public task coverage and the original recorded ranking with evidence", async ({ page }) => {
  const state = await setup(page); await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Benchmark dashboard", exact: true })).toBeVisible();
  const publicResults = page.getByRole("region", { name: "Public benchmark results", exact: true });
  await expect(publicResults).toBeVisible();
  await expect(publicResults.getByRole("progressbar", { name: "Tasks with published answers", exact: true })).toHaveAttribute("aria-valuemax", "15");
  await expect(publicResults.getByRole("progressbar", { name: "Tasks with published answers", exact: true })).toHaveAttribute("aria-valuenow", "1");
  const mobileSelect = page.getByRole("combobox", { name: "Task", exact: true });
  if (await mobileSelect.isVisible()) await expect(mobileSelect.locator('option[value^="fixture-task-"]')).toHaveCount(15);
  else await expect(page.getByRole("button", { name: /^Open task: / })).toHaveCount(15);
  const detail = page.getByRole("region", { name: "Selected task", exact: true });
  await expect(detail.getByRole("heading", { name: questions[0], exact: true })).toBeVisible();
  const table = detail.getByRole("figure", { name: "Returned recommendations", exact: true });
  await expect(table).toBeVisible();
  await expect(table.getByText("Recommendation order", { exact: true })).toBeVisible();
  const rows = table.locator(".ranked-search-row"); await expect(rows).toHaveCount(3);
  await expect(rows.locator(".ranked-search-position")).toHaveText(["1", "2", "3"]);
  await expect(rows.nth(0).getByRole("link", { name: "Beta Basics", exact: true })).toHaveAttribute("href", "https://beta.example.com/");
  await expect(rows.nth(1).getByRole("link", { name: "Alpha Clothing", exact: true })).toBeVisible();
  await expect(rows.nth(2)).toContainText("Cedar Collection"); await expect(rows.nth(2)).toContainText("Website URL not returned");
  await expect(rows.nth(2)).toContainText("No source attached");
  await rows.nth(0).getByText("Returned reason", { exact: true }).click();
  await expect(rows.nth(0)).toContainText(published.recommendations[0].reason!);
  await expect(rows.nth(0).getByRole("link", { name: "Beta product source", exact: true })).toHaveAttribute("href", "https://beta.example.com/basics");
  await detail.getByText("About this observation", { exact: true }).click();
  await expect(detail).toContainText("OpenAI managed Agents API"); await expect(detail).toContainText(published.harnessVersion);
  await expect(detail).toContainText(published.limitations[0]);
  expect(state.publicReads).toBeGreaterThan(0); noPrivateWork(state);
});

test("task selection preserves deep links and browser history without inventing pending ranks", async ({ page }) => {
  const state = await setup(page); await page.goto("/overview?query=fixture-task-3");
  const detail = page.getByRole("region", { name: "Selected task", exact: true });
  await expect(detail.getByRole("heading", { name: questions[2], exact: true })).toBeVisible();
  await expect(detail).toContainText(/running|in progress/i); await expect(detail.getByRole("table")).toHaveCount(0);
  const question = detail.getByRole("heading", { name: questions[2], exact: true });
  const bounds = await question.boundingBox(); expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  expect(await question.evaluate(node => getComputedStyle(node).whiteSpace)).not.toBe("nowrap");
  await selectTask(page, 0); await expect(detail.getByRole("figure", { name: "Returned recommendations" })).toBeVisible();
  await page.goBack(); await expect(page).toHaveURL(/\/overview\?query=fixture-task-3$/);
  await expect(detail.getByRole("heading", { name: questions[2], exact: true })).toBeVisible();
  await expect(detail.getByRole("table")).toHaveCount(0);
  await page.goForward(); await expect(detail.getByRole("heading", { name: questions[0], exact: true })).toBeVisible();
  await page.reload(); await expect(detail.getByRole("figure", { name: "Returned recommendations" })).toBeVisible();
  await selectTask(page, 1); await expect(detail).toContainText("The answer is being prepared for publication");
  await expect(detail.getByRole("table")).toHaveCount(0); await expect(detail).not.toContainText("Beta Basics");
  await selectTask(page, 4); await expect(detail).toContainText("The run has no confirmed result");
  await expect(detail.getByRole("table")).toHaveCount(0);
  await selectTask(page, 5); await expect(detail).toContainText(/queued/i);
  await expect(detail.getByRole("table")).toHaveCount(0);
  await selectTask(page, 6); await expect(detail).toContainText(/cancelled|canceled/i);
  await expect(detail.getByRole("table")).toHaveCount(0);
  await selectTask(page, 7); await expect(detail).toContainText("This task has not started yet");
  await expect(detail.getByRole("table")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  noPrivateWork(state);
});

test("public filters search full questions and retain all actual collection states", async ({ page }) => {
  const state = await setup(page); await page.goto("/overview");
  await expect(page.getByRole("region", { name: "Selected task", exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search tasks", exact: true });
  await search.fill("structured online courses");
  await selectTask(page, 2);
  await search.fill("");
  await page.getByRole("combobox", { name: "Audience", exact: true }).selectOption("Developer tools");
  await page.getByRole("combobox", { name: "Task status", exact: true }).selectOption("Needs attention");
  await selectTask(page, 4);
  await expect(page.getByRole("region", { name: "Selected task", exact: true })).toContainText("The run has no confirmed result");
  await search.fill("A query that is not in the public fixture");
  await expect(page.getByText(/no tasks match/i)).toBeVisible();
  noPrivateWork(state);
});

test("refresh retrieves only public GET state and an invalid payload fails safely", async ({ page }) => {
  const state = await setup(page); await page.goto("/overview?query=fixture-task-3");
  const detail = page.getByRole("region", { name: "Selected task", exact: true });
  await expect(detail).toContainText(/running|in progress/i);
  const next = fixture(); next.updatedAt = "2026-09-13T09:03:00.000Z";
  next.queries[2].collection = { status: "failed", startedAt: at, finishedAt: next.updatedAt };
  next.summary.collection.running = 0; next.summary.collection.failed = 2;
  state.response = next; const reads = state.publicReads;
  await page.getByRole("button", { name: "Refresh public results", exact: true }).click();
  await expect.poll(() => state.publicReads).toBeGreaterThan(reads);
  await expect(detail).toContainText(/failed/i); await expect(detail.getByRole("table")).toHaveCount(0);
  state.response = { format: "invalid", summary: { queryCount: 9999 }, privateOwnerId: "PRIVATE_RESPONSE_SENTINEL" };
  await page.getByRole("button", { name: "Refresh public results", exact: true }).click();
  await expect(page.getByRole("region", { name: "Public benchmark results", exact: true }).getByRole("alert")).toContainText("The last saved results are still shown");
  await expect(detail).toContainText(/failed/i);
  await expect(page.locator("body")).not.toContainText("PRIVATE_RESPONSE_SENTINEL");
  await expect(page.locator("body")).not.toContainText("9999");
  noPrivateWork(state);
});

test("background publication updates totals without replacing the task already being read", async ({ page }) => {
  const state = await setup(page);
  await page.clock.install({ time: new Date(at) });
  await page.goto("/overview");
  const detail = page.getByRole("region", { name: "Selected task", exact: true });
  await expect(detail.getByRole("heading", { name: questions[0], exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/overview$/);

  const next = fixture();
  const newer: PublicSearchObservation = {
    ...structuredClone(published), id: "fixture-newer-observation", queryId: "fixture-task-2", observedAt: "2026-09-13T09:05:00.000Z",
    recommendations: [{ position: 1, name: "Gamma Planner", url: "https://gamma.example.com/", reason: "The returned answer described shared planning features.", citationUrls: ["https://gamma.example.com/planning"] }],
    citations: [{ url: "https://gamma.example.com/planning", title: "Gamma planning source" }],
  };
  next.updatedAt = newer.observedAt;
  next.observations.push(newer);
  next.queries[1].latestObservation = structuredClone(newer);
  next.queries[1].resultStatus = "published";
  next.queries[1].observationCount = 1;
  next.queries[1].collection.finishedAt = newer.observedAt;
  next.summary.publishedQueryCount = 2;
  next.summary.publishedObservationCount = 2;
  next.summary.completedUnpublishedQueryCount = 0;
  next.summary.uniqueRecommendedWebsiteCount = 3;
  next.summary.uniqueCitedSourceCount = 3;
  state.response = next;
  const reads = state.publicReads;

  await page.clock.runFor(15_100);
  await expect.poll(() => state.publicReads).toBeGreaterThan(reads);
  await expect(page.getByRole("progressbar", { name: "Tasks with published answers", exact: true })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.locator('dl[aria-label="Benchmark totals"]').locator("dd")).toHaveText(["2 / 15", "1", "3", "3"]);
  await expect(detail.getByRole("heading", { name: questions[0], exact: true })).toBeVisible();
  await expect(detail.getByRole("link", { name: "Beta Basics", exact: true })).toBeVisible();
  await expect(detail).not.toContainText("Gamma Planner");
  await expect(page).toHaveURL(/\/overview$/);
  noPrivateWork(state);
});


test("leaderboard loads publicly without consulting identity or private APIs", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/leaderboard?view=workspace&website=private-hint");
  await expect(page.getByRole("heading", { name: "The Folio Index", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search rankings", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "HTML page checks", exact: true }).click();
  await expect(page.getByRole("region", { name: "HTML page checks", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "The Folio Index", exact: true })).toBeVisible();
  noPrivateWork(state);
});
