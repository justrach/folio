import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const site = { id: "guided-site", name: "Fixture business", url: "https://guided-fixture.dev/" };
const suite: KeywordBenchmarkSuite = { id: "guided-suite", name: "Saved customer questions", description: "Browser fixtures only", createdAt: at,
  cases: ["Which service explains a codebase?", "Which service maps dependencies?"].map((query, index) => ({ id: `guided-question-${index}`, suiteId: "guided-suite", query,
    targetUrl: site.url, searchMode: "open-web", revision: 0, createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture" })) };
const href = (index = 0) => `/evaluations?view=search&suite=${suite.id}&website=${site.id}&case=${suite.cases[index].id}`;
function savedRun(status: KeywordBenchmarkRun["status"] = "queued"): KeywordBenchmarkRun {
  return { id: "guided-run", suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind: "baseline", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "gpt-6-luna", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture",
    status, sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at, revision: 1,
    answer: status === "completed" ? { text: "A private fixture answer.", mentions: [{ name: "Fixture business", url: site.url }], citations: [{ url: site.url, title: "Fixture source" }], limitations: ["Fixture only"] } : null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null };
}
async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, starts: [] as Record<string, unknown>[], forbidden: [] as string[], runs: [] as KeywordBenchmarkRun[],
    retrievals: [] as string[], outcome: "queued" as "queued" | "completed" | "rejected" | "ambiguous" | "missing-receipt", historyError: false, canRun: true, holdStart: null as Promise<void> | null };
  const user = () => ({ id: state.owner!, name: "Fixture owner", email: `${state.owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at });
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: user(), session: { id: `fixture-${state.owner}`, userId: state.owner, token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/sign-in/email") { state.owner = "bob"; return route.fulfill({ json: { user: user(), token: "fixture", redirect: false } }); }
    if (path === "/api/benchmarks/runs" && method === "POST") {
      const body = req.postDataJSON(); state.starts.push(body);
      if (state.holdStart) await state.holdStart;
      if (state.outcome === "rejected") return route.fulfill({ status: 403, json: { error: "Fixture provider access was rejected. No new attempt is authorized." } });
      if (state.outcome === "missing-receipt") {
        state.runs = [{ ...savedRun("requires_action"), sessionId: null }];
        return route.fulfill({ status: 503, json: { error: "Fixture creation outcome is unknown" } });
      }
      const value = savedRun(state.outcome === "completed" ? "completed" : state.outcome === "ambiguous" ? "requires_action" : "queued");
      value.caseId = body.caseId; value.case = suite.cases.find(item => item.id === body.caseId)!; value.model = body.model;
      if (state.outcome === "ambiguous") {
        state.runs = [{ ...value, sessionId: null }];
        return route.fulfill({ status: 503, json: { error: "The outcome could not be saved. Do not start a replacement.", recovery: { runId: value.id, sessionId: value.sessionId }, run: value } });
      }
      state.runs = [value]; return route.fulfill({ status: 201, json: { run: value } });
    }
    if (path === "/api/benchmarks/runs/guided-run/reconcile" && method === "POST") {
      state.retrievals.push(path); state.runs = [savedRun("completed")];
      return route.fulfill({ json: { run: state.runs[0] } });
    }
    if (method !== "GET") { state.forbidden.push(`${method} ${path}`); return route.fulfill({ status: 409, json: { error: "No other write is authorized by this fixture" } }); }
    if (path === "/api/sites") return route.fulfill({ json: { sites: state.owner ? [site] : [] } });
    if (path === "/api/benchmarks") return route.fulfill({ json: {
      suites: [{ ...suite, cases: undefined, caseCount: suite.cases.length }], templates: [],
      access: { configured: true, authorized: true, canRun: state.canRun, maxRunsPerDay: 3, maxActiveRuns: 1,
        openWebModels: [{ id: "gpt-6-luna", label: "Luna 6", validation: "validated" }, { id: "gpt-6-sol", label: "Sol 6", validation: "experimental" }],
        managedOpenWebModels: [{ id: "gpt-6-luna", label: "Luna 6", validation: "validated" }, { id: "gpt-6-sol", label: "Sol 6", validation: "experimental" }] },
      usage: { attemptsLast24Hours: state.starts.length, remainingRuns: 3 - state.starts.length, activeRuns: state.runs.filter(value => value.status === "queued").length, remainingActiveRuns: state.runs.length ? 0 : 1 },
    } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") return route.fulfill(state.historyError ? { status: 503, json: { error: "Fixture history unavailable" } }
      : { json: { runs: state.runs.map(({ answer, ...value }) => ({ ...value, answerCharacters: answer?.text.length ?? 0, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0 })) } });
    if (path === `/api/benchmarks/runs/guided-run`) return route.fulfill({ json: { run: state.runs[0] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    if (path === "/api/onboarding") return route.fulfill({ json: { profile: null } });
    return route.fulfill({ status: 404, json: { error: "Fixture has no other API" } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}
const continueReview = (page: Page) => page.getByRole("button", { name: "Continue to run review", exact: true });
const start = (page: Page) => page.getByRole("button", { name: "Start paid run", exact: true });
async function openReview(page: Page) {
  await page.goto(href());
  await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
  await continueReview(page).click();
  await expect(page.getByRole("heading", { name: "Review this paid run", exact: true })).toBeVisible();
}

test("a first question guides review before an explicit start, and navigation never starts work", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto(href());
  await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
  await expect(page.locator(".benchmark-selected-question")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).not.toBeVisible();
  await expect(page.getByText(suite.cases[0].query, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("question-review.png"), fullPage: true, animations: "disabled" });
  await continueReview(page).click();
  await expect(start(page)).toBeEnabled();
  await expect(page.getByText(/exact price is not available/i).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("paid-run-review.png"), fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.reload();
  await expect(continueReview(page)).toBeVisible();
  await continueReview(page).click(); await expect(start(page)).toBeVisible();
  await page.evaluate(next => history.pushState(null, "", next), href(1));
  await expect(continueReview(page)).toBeVisible();
  await expect(page.getByText(suite.cases[1].query, { exact: true }).first()).toBeVisible();
  await page.goBack(); await expect(continueReview(page)).toBeVisible();
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

for (const outcome of ["queued", "completed"] as const) test(`one explicit start opens its saved ${outcome} result without duplicate submission`, async ({ page }, info) => {
  const state = await fixture(page); state.outcome = outcome;
  let release!: () => void; state.holdStart = new Promise<void>(resolve => { release = resolve; });
  await openReview(page);
  await start(page).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => state.starts.length).toBe(1);
  release(); state.holdStart = null;
  await expect(page).toHaveURL(/run=guided-run/);
  await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toBeVisible();
  const report = page.getByRole("region", { name: "Keyword observation", exact: true });
  if (outcome === "queued") {
    await expect(page.getByRole("heading", { name: "Your request is saved", exact: true })).toBeVisible();
    await expect(report.getByRole("button", { name: "Refresh progress", exact: true })).toBeVisible();
    await expect(report.getByRole("button", { name: "Cancel observation", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("queued-observation.png"), fullPage: true, animations: "disabled" });
    await report.getByRole("button", { name: "Refresh progress", exact: true }).click();
    await expect.poll(() => state.retrievals.length).toBe(1);
  }
  await expect(report.getByRole("region", { name: "Recorded answer", exact: true })).toContainText("A private fixture answer.");
  await expect(report.getByRole("region", { name: "Target presence", exact: true })).toContainText("Yes");
  await expect(report.getByRole("complementary", { name: "Returned citations", exact: true })).toContainText("Fixture source");
  await expect(report.getByRole("region", { name: "Observation method", exact: true })).not.toBeVisible();
  await expect(report).toContainText("Unknown; unknown cost is not zero");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("returned-answer.png"), fullPage: true, animations: "disabled" });
  expect(state.starts).toEqual([{ caseId: suite.cases[0].id, kind: "baseline", model: "gpt-6-luna" }]);
  expect(state.forbidden).toEqual([]);
});

test("rejected and ambiguous starts retain the outcome without automatic replacement work", async ({ page }) => {
  const state = await fixture(page); state.outcome = "rejected";
  await openReview(page); await start(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture provider access was rejected" })).toBeVisible();
  await expect.poll(() => state.starts.length).toBe(1);
  await page.reload(); await expect(continueReview(page)).toBeVisible();
  expect(state.starts).toHaveLength(1);
  state.outcome = "ambiguous";
  await continueReview(page).click(); await start(page).click();
  const recovery = page.getByRole("region", { name: "Unsaved observation recovery", exact: true });
  await expect(recovery).toContainText("not a confirmed saved report");
  await expect(recovery).toContainText("Do not start a replacement");
  const downloading = page.waitForEvent("download");
  await recovery.getByRole("button", { name: "Download private recovery snapshot", exact: true }).click();
  const file = await downloading;
  expect(JSON.parse(await readFile((await file.path())!, "utf8"))).toMatchObject({ persisted: false, recovery: { runId: "guided-run", sessionId: "fixture-session" } });
  await expect(start(page)).toHaveCount(0);
  await recovery.getByRole("button", { name: "Open saved reservation", exact: true }).click();
  await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toBeVisible();
  expect(state.starts).toHaveLength(2); expect(state.forbidden).toEqual([]);
});

test("access failures and unread history cannot bypass run readiness", async ({ page }) => {
  const state = await fixture(page); state.canRun = false;
  await openReview(page); await expect(start(page)).toBeDisabled();
  state.canRun = true; state.historyError = true;
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "Fixture history unavailable" })).toBeVisible();
  await expect(continueReview(page)).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("back, model, tool and account changes require reviewing the prepared run again", async ({ page }) => {
  const state = await fixture(page);
  await openReview(page);
  await page.getByRole("button", { name: "Back to question", exact: true }).click();
  await continueReview(page).click(); await expect(start(page)).toBeVisible();
  const guide = page.getByRole("region", { name: "Guided first observation", exact: true });
  await guide.getByText("Advanced run options", { exact: true }).click();
  await guide.getByRole("combobox", { name: "Model for the next observation", exact: true }).selectOption("gpt-6-sol");
  await expect(continueReview(page)).toBeVisible();
  await continueReview(page).click(); await expect(start(page)).toBeVisible();
  await guide.getByText("Advanced run options", { exact: true }).click();
  await expect(guide.getByRole("checkbox", { name: /Check the evidence/ })).not.toBeChecked();
  await guide.getByRole("checkbox", { name: /Check the evidence/ }).click();
  await expect(continueReview(page)).toBeVisible();
  await continueReview(page).click(); await expect(start(page)).toBeVisible();

  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto(href()); await continueReview(page).click();
  await expect(start(page)).toBeVisible();
  expect(state.owner).toBe("bob"); expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("saved failed attempts and the legacy workspace remain readable without a first-run claim", async ({ page }) => {
  const state = await fixture(page); state.runs = [savedRun("failed")];
  await page.goto(href());
  await expect(continueReview(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open baseline observation/ })).toBeVisible();
  await page.goto(`/evaluations?view=search&suite=${suite.id}&run=guided-run`);
  await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toBeVisible();
  await expect(continueReview(page)).toHaveCount(0);
  state.runs = [];
  await page.goto(`/benchmarks?suite=${suite.id}&website=${site.id}`);
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeVisible();
  await expect(continueReview(page)).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});


test("an unknown creation response preserves the saved attempt and blocks a replacement", async ({ page }) => {
  const state = await fixture(page); state.outcome = "missing-receipt";
  await openReview(page); await start(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "The start could not be confirmed" })).toBeVisible();
  await expect(continueReview(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeDisabled();
  await page.reload();
  await expect(continueReview(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Open baseline observation/ })).toBeVisible();
  expect(state.starts).toHaveLength(1); expect(state.forbidden).toEqual([]);
});
