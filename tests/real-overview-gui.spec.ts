import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-09-13T08:00:00.000Z";
const alpha = { id: "site-alpha", name: "Alpha fixture", url: "https://alpha-fixture.dev/" };
const beta = { id: "site-beta", name: "Beta fixture", url: "https://beta-fixture.dev/" };
const suite: KeywordBenchmarkSuite = { id: "suite-overview", name: "Fixture questions", description: "Browser fixtures only", createdAt: at,
  cases: [
    { id: "question-one", query: "Which tool explains a codebase?", targetUrl: alpha.url, searchMode: "open-web" },
    { id: "question-two", query: "Which tool maps dependencies?", targetUrl: alpha.url, searchMode: "open-web" },
    { id: "question-unrun", query: "Which tool finds callers?", targetUrl: alpha.url, searchMode: "open-web" },
    { id: "question-legacy", query: "Legacy documentation question", targetUrl: alpha.url, searchMode: "reviewed-domains" },
    { id: "question-beta", query: "Beta private question", targetUrl: beta.url, searchMode: "open-web" },
  ].map(value => ({ ...value, searchMode: value.searchMode as "open-web" | "reviewed-domains", suiteId: "suite-overview", revision: 0, createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture" })) };
function run(id: string, index: number, present: boolean, time = at): KeywordBenchmarkRun {
  const item = suite.cases[index];
  return { id, suiteId: suite.id, caseId: item.id, case: item, kind: "baseline", baselineRunId: null, surface: "openai-managed-agents", publication: "private",
    model: "fixture-model", harnessVersion: "fixture-harness", environmentType: "none", environmentFingerprint: "fixture-settings", status: "completed",
    sessionId: "fixture-session", createAttemptAt: time, deadlineAt: time, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [],
    createdAt: time, updatedAt: time, revision: 1,
    answer: { text: "Fixture saved answer", mentions: [{ name: "Other fixture", url: "https://other-fixture.dev/" }, ...(present ? [{ name: "Target fixture", url: item.targetUrl }] : [])],
      citations: [{ url: present ? item.targetUrl! : "https://other-fixture.dev/", title: "Fixture source" }], limitations: ["Illustrative test data"] },
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null };
}
async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, failRuns: false, failDetails: false, holdDetails: null as Promise<void> | null, detailReads: [] as string[], writes: [] as string[],
    runs: [run("answer-one", 0, true), run("answer-two", 1, false), run("legacy-answer", 3, true), run("beta-answer", 4, true)], loginNext: "" };
  state.runs.unshift({ ...run("unfinished-one", 0, true, "2026-09-13T09:00:00.000Z"), status: "requires_action", answer: null, sessionId: null });
  state.runs.unshift({ ...run("failed-two", 1, false, "2026-09-13T10:00:00.000Z"), status: "failed", answer: null });
  const user = () => ({ id: state.owner!, name: "Fixture owner", email: `${state.owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at });
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: user(), session: { id: "fixture-session", userId: state.owner, token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/sign-in/email") { state.owner = "bob"; return route.fulfill({ json: { user: user(), token: "fixture", redirect: false } }); }
    if (req.method() !== "GET") { state.writes.push(`${req.method()} ${path}`); return route.fulfill({ status: 409, json: { error: "Fixture prohibits new work" } }); }
    if (path === "/api/sites") return route.fulfill({ json: { sites: state.owner === "alice" ? [alpha, beta] : state.owner ? [beta] : [] } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: [{ ...suite, cases: undefined, caseCount: suite.cases.length }], templates: [], access: { configured: false, canRun: false }, usage: {} } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite } });
    if (path === "/api/benchmarks/runs") return route.fulfill(state.failRuns ? { status: 503, json: { error: "Fixture read failure" } } : { json: { runs: state.runs.filter(value => state.owner === "alice" || value.case.targetUrl === beta.url).map(({ answer, ...value }) => ({ ...value, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0, answerCharacters: answer?.text.length ?? 0 })) } });
    if (path.startsWith("/api/benchmarks/runs/")) {
      const value = structuredClone(state.runs.find(item => path.endsWith(item.id))); state.detailReads.push(path);
      if (state.holdDetails) await state.holdDetails;
      await route.fulfill(state.failDetails ? { status: 503, json: { error: "Fixture read failure" } } : { json: { run: value } }).catch(() => {}); return;
    }
    if (path === "/api/scans") return route.fulfill({ json: { scans: [{ id: "scan-alpha", url: alpha.url, createdAt: at, seoScore: 61, checks: [], patches: [], title: "Alpha fixture", description: "Fixture", wordCount: 10 }] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [
      { id: "evaluation-alpha", siteName: "Alpha saved evaluation", targetUrl: alpha.url, status: "failed", mode: "live", createdAt: "2026-09-10T08:00:00Z", result: null },
      ...[1, 2, 3].map(index => ({ id: `evaluation-beta-${index}`, siteName: `Beta saved evaluation ${index}`, targetUrl: beta.url, status: "failed", mode: "live", createdAt: at, result: null })),
    ].filter(value => state.owner === "alice" || value.targetUrl === beta.url) } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [{ id: "seo-alpha", domain: "alpha-fixture.dev", createdAt: at }, { id: "seo-beta", domain: "beta-fixture.dev", createdAt: at }] } });
    if (path === "/api/search-console/reports") return route.fulfill({ json: { reports: [{ id: "gsc-alpha", property: alpha.url, fetchedAt: at }] } });
    return route.fulfill({ status: 404, json: { error: "Unavailable in browser fixture" } });
  });
  return state;
}
const search = (page: Page) => page.getByRole("region", { name: "Saved search overview", exact: true });
const metric = (page: Page, label: string) => page.locator(".real-overview-metrics > div").filter({ has: page.getByText(label, { exact: true }) });

async function login(page: Page) {
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("overview uses exact selected-site observations, preserves completed answers beside unknown attempts, and navigates without spending", async ({ page }, info) => {
  const state = await fixture(page);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto("/overview?website=site-alpha");
  await expect(metric(page, "Appeared in answers").locator("dd")).toHaveText("50%");
  await expect(metric(page, "Appeared in answers")).toContainText("1 of 2 completed answers");
  await expect(metric(page, "Questions with completed answers").locator("dd")).toHaveText("2 / 3 loaded");
  await expect(metric(page, "Distinct cited pages").locator("dd")).toHaveText("2");
  await expect(page.getByLabel("Latest attempt states")).toContainText("1 need attention");
  await expect(page.getByLabel("Latest attempt states")).toContainText("1 not run");
  await expect(page.getByLabel("Latest attempt states")).toContainText("1 failed");
  const evaluations = page.getByRole("region", { name: "Workspace evaluations", exact: true });
  await expect(evaluations.getByRole("heading", { level: 3 })).toHaveText(["Alpha saved evaluation"]);
  const first = search(page).locator("article").filter({ hasText: suite.cases[0].query });
  await expect(first).toContainText("#2"); await expect(first).toContainText("Needs attention");
  await expect(first.getByRole("link", { name: `Open observation for ${suite.cases[0].query}` })).toHaveAttribute("href", "/benchmarks?suite=suite-overview&run=answer-one");
  await expect(first.getByRole("link", { name: `Review latest attempt for ${suite.cases[0].query}` })).toHaveAttribute("href", "/benchmarks?suite=suite-overview&run=unfinished-one");
  await expect(search(page)).not.toContainText("Legacy documentation question");
  await expect(search(page)).not.toContainText("Beta private question");
  const evidence = page.getByRole("region", { name: "Separate website evidence" });
  await expect(evidence).toContainText("1 saved audit"); await expect(evidence).toContainText("61/100");
  await page.screenshot({ path: info.outputPath("real-overview.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByText("Details and history", { exact: true }).click();
  await expect(page.locator(".real-overview-history")).toContainText("No comparable history");
  await page.getByRole("button", { name: "Reviewed documentation", exact: true }).click();
  await expect(search(page)).toContainText("Legacy documentation question");
  await expect(metric(page, "Appeared in answers").locator("dd")).toHaveText("100%");
  await page.getByRole("button", { name: "Open-web observations", exact: true }).click();
  await page.getByLabel("Selected website", { exact: true }).selectOption(beta.id);
  expect(new URL(page.url()).searchParams.get("view")).toBe("workspace");
  await expect(search(page)).toContainText("Beta private question"); await expect(search(page)).not.toContainText(suite.cases[0].query);
  await expect(evaluations.getByRole("listitem")).toHaveCount(3);
  await expect(evaluations).not.toContainText("Alpha saved evaluation");
  await expect(page.locator(".breadcrumb")).not.toContainText("alpha-fixture.dev");
  await expect(evidence).toContainText("0 saved audits"); await expect(evidence).toContainText("0 saved snapshots");
  await page.goBack(); await expect(page.getByLabel("Selected website", { exact: true })).toHaveValue(alpha.id);
  await expect(metric(page, "Appeared in answers").locator("dd")).toHaveText("50%");
  await page.reload(); await expect(metric(page, "Appeared in answers").locator("dd")).toHaveText("50%");
  await first.getByRole("link", { name: `Open observation for ${suite.cases[0].query}` }).click();
  await expect(page).toHaveURL(/\/benchmarks\?suite=suite-overview&run=answer-one$/);
  expect(state.writes).toEqual([]); expect(errors).toEqual([]);
});

test("signed-out overview offers private login, samples require selection, and login returns safely", async ({ page }) => {
  const state = await fixture(page); state.owner = null;
  await page.goto("/overview?view=workspace");
  await expect(page.getByRole("heading", { name: "Sign in to see your website’s results" })).toBeVisible();
  await expect(page.locator(".metric-card")).toHaveCount(0);
  await expect(page.locator(".workspace-switch")).not.toContainText("Acme workspace");
  await expect(page.locator(".profile")).not.toContainText("Alex Morgan");
  await expect(page.locator(".nav-count")).toHaveCount(0);
  await page.getByRole("link", { name: "Demo report", exact: true }).click();
  await expect(page).toHaveURL(/\/overview\?view=demo$/);
  await expect(page.locator(".metric-card").first()).toContainText("AI visibility");
  await page.goBack(); await page.getByRole("link", { name: "Sign in to your workspace" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Foverview%3Fview%3Dworkspace$/);
  await login(page); await expect(page).toHaveURL(/\/overview\?view=workspace$/);
  await expect(page.getByLabel("Selected website", { exact: true })).toHaveValue(beta.id);
  expect(state.writes).toEqual([]);
});

test("legacy website and scope hints return to the exact private workspace after sign-in", async ({ page }) => {
  const state = await fixture(page); state.owner = null;
  await page.goto("/overview?website=site-beta&scope=reviewed-domains&query=unrelated-public-task");
  const signIn = page.getByRole("link", { name: "Sign in to your workspace", exact: true });
  const href = new URL((await signIn.getAttribute("href"))!, "http://localhost:3001");
  expect(href.searchParams.get("next")).toBe("/overview?view=workspace&website=site-beta&scope=reviewed-domains");
  await signIn.click(); await login(page);
  await expect(page).toHaveURL(/\/overview\?view=workspace&website=site-beta&scope=reviewed-domains$/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("view")).toBe("workspace"); expect(params.get("website")).toBe(beta.id);
  expect(params.get("scope")).toBe("reviewed-domains"); expect(params.has("query")).toBe(false);
  await expect(page.getByLabel("Selected website", { exact: true })).toHaveValue(beta.id);
  await expect(page.getByRole("button", { name: "Reviewed documentation", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.writes).toEqual([]);
});

test("missing reads remain unavailable, unknown identities are excluded, and refresh is GET only", async ({ page }) => {
  const state = await fixture(page); state.failRuns = true;
  await page.goto("/overview?view=workspace");
  await expect(search(page).getByRole("alert")).toContainText("No search metrics are available");
  await expect(page.locator(".real-overview-metrics")).toHaveCount(0);
  state.failRuns = false; state.runs.push({ ...run("pending-third", 2, false), status: "queued", answer: null });
  state.runs.find(value => value.id === "answer-one")!.answer!.mentions = [{ name: "Ambiguous fixture", url: null }];
  await page.getByRole("button", { name: "Refresh saved overview" }).click();
  await expect(metric(page, "Appeared in answers").locator("dd")).toHaveText("0%");
  await expect(metric(page, "Appeared in answers")).toContainText("0 of 1 completed answers");
  await expect(metric(page, "Appeared in answers")).toContainText("1 unknown identity is excluded");
  await expect(search(page).locator("article").filter({ hasText: suite.cases[0].query })).toContainText("Unknown");
  await expect(page.getByLabel("Latest attempt states")).toContainText("1 pending");
  expect(state.writes).toEqual([]);
});

test("delayed previous-owner answers are discarded after logout and a new owner sees only their site", async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void; state.holdDetails = new Promise<void>(resolve => { release = resolve; });
  await page.goto("/overview?view=workspace"); await expect.poll(() => state.detailReads.length).toBe(2);
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Better Auth" })).toBeVisible();
  release(); state.holdDetails = null;
  await page.goto("/overview?view=workspace"); await expect(page.locator(".real-overview-metrics")).toHaveCount(0);
  await expect(page.getByText(suite.cases[0].query, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in to your workspace" }).click(); await login(page);
  await expect(page.getByLabel("Selected website", { exact: true })).toHaveValue(beta.id);
  await expect(search(page)).toContainText("Beta private question"); await expect(search(page)).not.toContainText(suite.cases[0].query);
  expect(state.writes).toEqual([]);
});

for (const view of ["search", "page"] as const) {
  test(`login preserves validated ${view} evaluation context without starting work`, async ({ page }) => {
    const state = await fixture(page); state.owner = null;
    const next = view === "search"
      ? "/evaluations?view=search&suite=suite-overview&run=beta-answer&website=site-beta&baseline=unrelated"
      : `/evaluations?view=page&target=${encodeURIComponent(beta.url)}`;
    await page.goto(`/login?next=${encodeURIComponent(next)}`); await login(page);
    await expect(page).toHaveURL(/\/evaluations\?/);
    const params = new URL(page.url()).searchParams;
    expect(params.get("view")).toBe(view);
    if (view === "search") {
      expect(params.get("suite")).toBe(suite.id); expect(params.get("run")).toBe("beta-answer"); expect(params.get("website")).toBe(beta.id);
      expect(params.has("baseline")).toBe(false);
      await expect(page.getByRole("button", { name: "Search questions", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("region", { name: "Keyword observation", exact: true })).toContainText("Beta private question");
    } else {
      await expect(page.getByRole("button", { name: "Page evidence", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByLabel("Website to evaluate", { exact: true })).toHaveValue(beta.url);
    }
    expect(state.writes).toEqual([]);
  });
}
