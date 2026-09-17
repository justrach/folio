import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { EVAL_SUITE } from "../src/lib/evals";
import { isKeywordBenchmarkBlocking, KEYWORD_BENCHMARK_SURFACE, type KeywordBenchmarkRun, type KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-09-13T08:00:00.000Z";
const target = "https://codegraff-fixture.dev/";
const suite: KeywordBenchmarkSuite = {
  id: "suite-fixture", name: "Developer questions fixture", description: "Illustrative browser-test questions.", createdAt: at,
  cases: [{ id: "case-fixture", suiteId: "suite-fixture", revision: 0, createdAt: at, updatedAt: at,
    query: "Which tool explains a codebase?", targetUrl: target, language: "en", locale: "US", rubricVersion: "keyword-observation-v1" }],
};
function run(id = "baseline-fixture", kind: "baseline" | "fresh" = "baseline"): KeywordBenchmarkRun {
  return { id, suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind,
    baselineRunId: kind === "fresh" ? "baseline-fixture" : null, surface: KEYWORD_BENCHMARK_SURFACE,
    publication: "private", model: "fixture-model", harnessVersion: "fixture-harness", environmentType: "none", environmentFingerprint: "fixture-config",
    status: "completed", sessionId: "fixture-session", createAttemptAt: at, allowedDomains: ["codegraff-fixture.dev"],
    deadlineAt: "2026-09-13T08:03:00.000Z", cancelAttemptAt: null, cancelAcknowledgedAt: null, createdAt: at, updatedAt: at, revision: 1,
    answer: { text: kind === "fresh" ? "Fresh fixture answer." : "Baseline fixture answer.",
      mentions: [{ name: kind === "fresh" ? "New fixture tool" : "Baseline fixture tool", url: target }],
      citations: [{ url: target, title: "Fixture source", quote: "A recorded source excerpt." }], limitations: ["Illustrative fixture, not a live agent answer."] },
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    providerMetadata: { environmentId: null, requestId: null, turnId: null }, error: null };
}
function summary(value: KeywordBenchmarkRun) {
  return { ...value, answer: undefined, answerCharacters: value.answer?.text.length ?? 0,
    mentionCount: value.answer?.mentions.length ?? 0, citationCount: value.answer?.citations.length ?? 0 };
}
async function fixture(page: Page, initialRuns: KeywordBenchmarkRun[] = [], saved = true) {
  const state = { owner: "alice" as string | null, saved, suites: [suite], runs: initialRuns, starts: [] as Record<string, unknown>[], saves: [] as Record<string, unknown>[],
    forbidden: [] as string[], detailReads: [] as string[], finishedReads: [] as string[], reconciles: [] as string[], cancels: [] as string[],
    openWebModels: undefined as undefined | { id: string; label: string; validation: "validated" | "experimental" }[],
    holdDetail: null as Promise<void> | null, completeOnReconcile: false, failReceipt: false, unmetered: false };
  const connection = { configured: false, authorized: false, canRun: false, model: "fixture-model", allowedTargets: [], message: "Browser fixture only." };
  const user = () => ({ id: state.owner!, name: "Fixture owner", email: `${state.owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at });
  await page.route("**/api/**", async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname; const method = req.method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: user(), session: {
      id: `fixture-session-${state.owner}`, userId: state.owner, token: "fixture-token", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at } } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/sign-in/email") { state.owner = "bob"; return route.fulfill({ json: { user: user(), token: "fixture-token", redirect: false } }); }
    if (path === "/api/public/benchmarks" && method === "GET") return route.fulfill({ json: buildPublicDashboard({ format: "folio-public-search-rankings-v1", queries: [], observations: [] }, { format: "folio-public-search-progress-v1", updatedAt: at, queries: [] }) });
    if (path === "/api/sites" && method === "GET") return route.fulfill({ json: { sites: state.owner ? [
      { id: "owned-codegraff", name: "Codegraff fixture", url: target, isPublic: false, createdAt: at, seoScore: null, lastScannedAt: null },
      { id: "other-owned-site", name: "Other fixture site", url: "https://other.example.test/", isPublic: false, createdAt: at, seoScore: null, lastScannedAt: null },
    ] : [] } });
    if (path.startsWith("/api/benchmarks") && !state.owner) return route.fulfill({ status: 401, json: { error: "Sign in required." } });
    if (path === "/api/benchmarks" && method === "GET") return route.fulfill({ json: {
      suites: state.saved ? state.suites.map(item => ({ ...item, cases: undefined, caseCount: item.cases.length })) : [],
      templates: [{ id: "template-fixture", name: "Developer questions fixture", description: "Saved questions only.", cases: suite.cases }],
      access: { openWebModels: state.openWebModels, configured: true, authorized: true, canRun: true, model: "fixture-model", maxRunsPerDay: state.unmetered ? null : 6, maxActiveRuns: 1 },
      usage: { attemptsLast24Hours: state.starts.length, remainingRuns: state.unmetered ? null : 6 - state.starts.length,
        activeRuns: state.runs.filter(isKeywordBenchmarkBlocking).length,
        remainingActiveRuns: state.runs.some(isKeywordBenchmarkBlocking) ? 0 : 1 },
    } });
    if (path === "/api/benchmarks" && method === "POST") { state.saves.push(req.postDataJSON()); state.saved = true; return route.fulfill({ status: 201, json: { suite } }); }
    const selectedSuite = state.suites.find(item => path === `/api/benchmarks/${item.id}`);
    if (selectedSuite && method === "GET") return route.fulfill({ json: { suite: selectedSuite } });
    if (path === "/api/benchmarks/runs" && method === "GET") return route.fulfill({ json: { runs: state.runs.map(summary) } });
    if (path === "/api/benchmarks/runs" && method === "POST") {
      const body = req.postDataJSON(); state.starts.push(body);
      const value = run(`${body.kind}-created`, body.kind);
      value.case = state.suites.flatMap(item => item.cases).find(item => item.id === body.caseId) ?? value.case;
      if (body.model) value.model = body.model;
      if (body.kind === "baseline") { value.status = "running"; value.answer = null; }
      if (state.failReceipt) {
        state.runs.unshift({ ...value, sessionId: null, status: "requires_action" });
        return route.fulfill({ status: 503, json: { error: "The outcome could not be saved. Do not start a replacement.",
          recovery: { runId: value.id, sessionId: value.sessionId }, run: { ...value, status: "requires_action" } } });
      }
      state.runs.unshift(value); return route.fulfill({ status: 201, json: { run: value } });
    }
    const match = path.match(/^\/api\/benchmarks\/runs\/([^/]+)(?:\/(reconcile|cancel))?$/);
    if (match) {
      const id = match[1], operation = match[2]; const value = state.runs.find(item => item.id === id);
      if (!value) return route.fulfill({ status: 404, json: { error: "Saved observation not found." } });
      if (method === "GET" && !operation) {
        state.detailReads.push(id); const snapshot = structuredClone(value); const held = state.holdDetail;
        if (held) await held;
        await route.fulfill({ json: { run: snapshot } }).catch(() => {}); state.finishedReads.push(id); return;
      }
      if (method === "POST" && operation === "reconcile") {
        state.reconciles.push(id);
        if (state.completeOnReconcile) { value.status = "completed"; value.answer = run().answer; value.revision++; }
        return route.fulfill({ json: { run: value } });
      }
      if (method === "POST" && operation === "cancel") {
        state.cancels.push(id); value.cancelAttemptAt = at; value.cancelAcknowledgedAt = at; value.revision++;
        return route.fulfill({ json: { run: value } });
      }
    }
    if (method !== "GET") { state.forbidden.push(`${method} ${path}`); return route.fulfill({ status: 409, json: { error: "Unrelated or paid work is forbidden in this fixture." } }); }
    if (path === "/api/agents/status") return route.fulfill({ json: connection });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [], connection, suite: EVAL_SUITE } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/seo-data") return route.fulfill({ json: { configured: false, authorized: false } });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: false, signedIn: !!state.owner, connected: false } });
    if (path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "This browser fixture has no other API." } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}
function report(page: Page) { return page.getByRole("region", { name: "Keyword observation", exact: true }); }
async function noOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.inner).toBeLessThanOrEqual(dimensions.width + 1);
}
async function navigate(page: Page, path: string) {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
}

test("saving questions binds an existing private site; only one explicit baseline starts work", async ({ page }) => {
  const state = await fixture(page, [], false);
  await page.goto(`/benchmarks?target=${encodeURIComponent(target)}`);
  await expect(page.getByRole("combobox", { name: "Saved website", exact: true })).toHaveValue("owned-codegraff");
  expect(state.starts).toEqual([]); expect(state.saves).toEqual([]);
  await page.getByRole("button", { name: "Save keyword suite", exact: true }).click();
  await expect(page.getByRole("heading", { name: suite.cases[0].query, exact: true })).toBeVisible();
  expect(state.saves).toEqual([{ templateId: "template-fixture", websiteId: "owned-codegraff" }]);
  expect(state.starts).toEqual([]);
  await expect(page.getByRole("button", { name: "Run fresh observation", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Run baseline", exact: true }).click();
  await expect(report(page)).toContainText("The answer is not available yet.");
  expect(state.starts).toEqual([{ caseId: "case-fixture", kind: "baseline" }]);
  await report(page).getByRole("button", { name: "Prepare another observation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeDisabled();
  await expect(report(page)).toContainText("Closing this page stops these checks");
  expect(state.forbidden).toEqual([]); await noOverflow(page);
});

test("a fresh answer compares with its completed baseline and saved navigation starts nothing", async ({ page }, info) => {
  const state = await fixture(page, [run()]);
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await expect(page.getByRole("button", { name: "Run fresh observation", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Run fresh observation", exact: true }).click();
  const comparison = page.getByRole("region", { name: "Baseline comparison", exact: true });
  await expect(comparison).toContainText("The recorded inputs and run settings match.");
  await expect(comparison).toContainText("New fixture tool");
  await comparison.screenshot({path:info.outputPath("keyword-comparison.png"),animations:"disabled"});
  expect(state.starts).toEqual([{ caseId: "case-fixture", kind: "fresh", baselineRunId: "baseline-fixture" }]);
  await expect(report(page)).toContainText("Ordered as returned by fixture-model for this question.");
  await page.getByRole("button", { name: `Open baseline observation for ${suite.cases[0].query}`, exact: true }).click();
  await expect(report(page)).toContainText("Baseline fixture answer.");
  await page.goBack(); await expect(report(page)).toContainText("Fresh fixture answer.");
  await page.reload(); await expect(report(page)).toContainText("Fresh fixture answer.");
  expect(state.starts).toHaveLength(1); expect(state.reconciles).toEqual([]); expect(state.forbidden).toEqual([]);
  await noOverflow(page);
});

test("incompatible observations retain both answers and suppress change claims", async ({ page }) => {
  const baseline = run(), fresh = run("fresh-fixture", "fresh"); fresh.model = "different-fixture-model";
  const state = await fixture(page, [fresh, baseline]);
  await page.goto(`/benchmarks?suite=${suite.id}&run=${fresh.id}`);
  const comparison = page.getByRole("region", { name: "Baseline comparison", exact: true });
  await expect(comparison).toContainText("a direct change comparison is unavailable");
  await expect(comparison).toContainText("Baseline fixture answer."); await expect(comparison).toContainText("Fresh fixture answer.");
  await expect(comparison.getByText("New mentions", { exact: true })).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.reconciles).toEqual([]); expect(state.forbidden).toEqual([]);
  await noOverflow(page);
});

test("active polling retrieves an existing task and cancellation acknowledgement stays nonterminal", async ({ page }) => {
  await page.clock.install();
  const ongoing = run(); ongoing.status = "running"; ongoing.answer = null;
  const state = await fixture(page, [ongoing]);
  await page.goto(`/benchmarks?suite=${suite.id}&run=${ongoing.id}`);
  await expect(report(page)).toContainText("The answer is not available yet.");
  expect(state.reconciles).toEqual([]);
  await page.clock.runFor(10_100);
  await expect.poll(() => state.reconciles.length).toBe(1);
  await page.getByRole("button", { name: "Cancel observation", exact: true }).click();
  await expect(report(page)).toContainText("Cancellation was requested; stopping is not yet confirmed.");
  await expect(page.getByRole("button", { name: "Cancel observation", exact: true })).toBeDisabled();
  await expect(report(page)).toContainText("Working");
  expect(state.cancels).toEqual([ongoing.id]);
  state.completeOnReconcile = true;
  await page.clock.runFor(10_100);
  await expect(report(page)).toContainText("Completed");
  await expect(report(page)).toContainText("Baseline fixture answer.");
  await expect(report(page)).toContainText("Reported cost: Not available");
  const retrieved = state.reconciles.length;
  await page.clock.runFor(20_100);
  expect(state.reconciles).toHaveLength(retrieved);
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("logout clears private observations and delayed former-owner data stays hidden", async ({ page }) => {
  const state = await fixture(page, [run()]);
  let release: () => void = () => {};
  state.holdDetail = new Promise<void>(resolve => { release = resolve; });
  await page.goto(`/benchmarks?suite=${suite.id}&run=baseline-fixture`);
  await expect.poll(() => state.detailReads).toContain("baseline-fixture");
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => state.owner).toBeNull();
  await navigate(page, "/benchmarks");
  await expect(page.getByRole("link", { name: "Sign in to your workspace", exact: true })).toBeVisible();
  await expect(report(page)).toHaveCount(0);
  state.runs = []; state.saved = false; state.holdDetail = null;
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await navigate(page, "/benchmarks");
  await expect(page.getByText("Save a suite to begin.", { exact: true })).toBeVisible();
  release(); await expect.poll(() => state.finishedReads).toContain("baseline-fixture");
  await expect(report(page)).toHaveCount(0);
  await expect(page.getByText("Baseline fixture answer.", { exact: true })).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]); await noOverflow(page);
});

test("a failed receipt save preserves a separate private recovery download without retrying", async ({ page }) => {
  const state = await fixture(page); state.failReceipt = true;
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await page.getByRole("button", { name: "Run baseline", exact: true }).click();
  const recovery = page.getByRole("region", { name: "Unsaved observation recovery", exact: true });
  await expect(recovery).toContainText("it is not a confirmed saved report");
  await expect(recovery).toContainText("Do not start a replacement.");
  await expect(report(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeDisabled();
  const downloaded = page.waitForEvent("download");
  await recovery.getByRole("button", { name: "Download private recovery snapshot", exact: true }).click();
  const file = await downloaded;
  const body = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(body).toMatchObject({ format: "folio-private-keyword-recovery-v1", persisted: false,
    recovery: { runId: "baseline-created", sessionId: "fixture-session" },
    run: { id: "baseline-created", sessionId: "fixture-session", publication: "private" } });
  await recovery.getByRole("button", { name: "Open saved reservation", exact: true }).click();
  await expect(report(page)).toContainText("The answer is not available yet.");
  await expect(recovery).toBeVisible();
  expect(state.starts).toEqual([{ caseId: "case-fixture", kind: "baseline" }]);
  expect(state.forbidden).toEqual([]); await noOverflow(page);
});

test("sign-in preserves valid private selection IDs and drops unsafe or repeated hints", async ({ page }) => {
  const state = await fixture(page); state.owner = null;
  await page.goto(`/benchmarks?suite=${suite.id}&run=baseline-fixture&website=owned-codegraff`);
  const signIn = page.getByRole("link", { name: "Sign in to your workspace", exact: true });
  const href = await signIn.getAttribute("href");
  expect(new URL(href!, "http://localhost:3001").searchParams.get("next"))
    .toBe(`/benchmarks?suite=${suite.id}&run=baseline-fixture&website=owned-codegraff`);
  await page.goto("/benchmarks?suite=first&suite=second&run=%2F%2Fevil.example&website=owned-codegraff");
  const invalidHref = await signIn.getAttribute("href");
  expect(new URL(invalidHref!, "http://localhost:3001").searchParams.get("next"))
    .toBe("/benchmarks?website=owned-codegraff");
  expect(state.detailReads).toEqual([]); expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("no daily limit still requires an explicit start and permits only one active observation", async ({ page }) => {
  const state = await fixture(page); state.unmetered = true;
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await expect(page.getByRole("region", { name: "Keyword questions", exact: true })).toContainText("No daily limit");
  const baseline = page.getByRole("button", { name: "Run baseline", exact: true });
  await expect(baseline).toBeEnabled();
  expect(state.starts).toEqual([]);
  await baseline.click();
  await expect(report(page)).toContainText("Working");
  await report(page).getByRole("button", { name: "Prepare another observation", exact: true }).click();
  await expect(baseline).toBeDisabled();
  expect(state.starts).toEqual([{ caseId: "case-fixture", kind: "baseline" }]);
  expect(state.forbidden).toEqual([]);
});

test("selected observation leads with target matching, ordered tools and inspectable sources", async ({ page }, info) => {
  const saved = run();
  saved.model = "gpt-6-astra";
  saved.answer!.mentions = [
    { name: "Another fixture tool", url: "https://another-fixture.dev/", reason: "A recorded alternative, not an independent quality verdict.", citationUrls: ["https://docs-fixture.dev/source"] },
    { name: "Target fixture tool", url: target, reason: "The answer named the target for a bounded fixture reason.", citationUrls: [target] },
  ];
  saved.answer!.citations.push({ url: "https://docs-fixture.dev/source", title: "Alternative source", quote: "Fixture reference only." });
  const history = Array.from({length:5},(_,index)=>({...run(`older-${index}`),case:{...saved.case,query:`Long saved question number ${index}: which tool helps with a large repository?`}}));
  const state = await fixture(page, [saved,...history]);
  await page.goto(`/benchmarks?suite=${suite.id}&run=${saved.id}`);
  const selected = report(page);
  await expect(selected).toBeVisible();
  const box = await selected.boundingBox();
  expect(box!.y).toBeLessThan(info.project.name === "mobile" ? 520 : 410);
  const targetPresence = selected.getByRole("region", {name:"Target presence",exact:true});
  await expect(targetPresence).toContainText("Target in recommendationsYes");
  await expect(targetPresence).toContainText("position 2");
  await expect(targetPresence).toContainText("Target cited as a sourceYes");
  await expect(selected.getByRole("region",{name:"Observation method",exact:true})).toContainText("Reviewed documentation");
  await expect(selected).toContainText("Search was limited to reviewed domains");
  await expect(page.getByRole("combobox",{name:"Saved website",exact:true})).toBeHidden();
  await expect(page.getByRole("button",{name:"Run baseline",exact:true})).toBeHidden();
  const recommendations = selected.getByRole("region",{name:"Returned recommendations",exact:true});
  const rows = recommendations.locator("ol>li>details>summary");
  await expect(rows.nth(0)).toContainText("Another fixture tool");
  await expect(rows.nth(1)).toContainText("Target fixture tool");
  await rows.nth(1).focus(); await page.keyboard.press("Enter");
  await expect(recommendations.getByText("The answer named the target for a bounded fixture reason.",{exact:true})).toBeVisible();
  await expect(recommendations.getByRole("list",{name:"Sources returned for Target fixture tool",exact:true}).getByRole("link")).toHaveAttribute("href",target);
  await expect(selected.getByRole("region",{name:"Provider coverage",exact:true})).toContainText("Not connected · unmeasured");
  await selected.locator("summary").filter({hasText:"Read the full recorded answer"}).click();
  await expect(selected.getByText("Baseline fixture answer.",{exact:true})).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:info.outputPath("keyword-observation.png"),fullPage:true,animations:"disabled"});
  expect(state.starts).toEqual([]); expect(state.reconciles).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("ambiguous recommendation identity remains unknown even when the target is cited", async ({ page }) => {
  const saved=run(); saved.case={...saved.case,searchMode:"open-web"};
  saved.answer!.mentions=[{name:"Could be the target",url:null,reason:"No website identity was supplied."}];
  const state=await fixture(page,[saved]);
  await page.goto(`/benchmarks?suite=${suite.id}&run=${saved.id}`);
  const presence=report(page).getByRole("region",{name:"Target presence",exact:true});
  await expect(presence).toContainText("Target in recommendationsUnknown");
  await expect(presence).toContainText("Target cited as a sourceYes");
  await expect(presence).not.toContainText("Not listed");
  await expect(report(page).getByRole("region",{name:"Observation method",exact:true})).toContainText("OpenAI web search");
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]); await noOverflow(page);
});

test("search-scope mismatch keeps comparisons descriptive and hides added or removed citations", async ({ page }) => {
  const baseline=run(),fresh=run("open-web-fresh","fresh"); fresh.case={...fresh.case,searchMode:"open-web"};
  const state=await fixture(page,[fresh,baseline]);
  await page.goto(`/benchmarks?suite=${suite.id}&run=${fresh.id}`);
  const comparison=page.getByRole("region",{name:"Baseline comparison",exact:true});
  await expect(comparison).toContainText("a direct change comparison is unavailable");
  await expect(comparison).toContainText("search mode changed");
  await expect(comparison.locator("summary").filter({hasText:"Citation and recommendation changes"})).toHaveCount(0);
  await comparison.locator("summary").filter({hasText:"Read both recorded answers"}).click();
  await expect(comparison.getByText("Baseline fixture answer.",{exact:true})).toBeVisible();
  await expect(comparison.getByText("Fresh fixture answer.",{exact:true})).toBeVisible();
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]); await noOverflow(page);
});

test("website handoff selects only an exactly matching private suite", async ({ page }) => {
  const state=await fixture(page);
  state.suites.unshift({...suite,id:"different-site-suite",name:"Different site",cases:suite.cases.map(item=>({...item,id:"different-case",suiteId:"different-site-suite",targetUrl:"https://different-fixture.dev/"}))});
  await page.goto("/benchmarks?website=owned-codegraff");
  await expect(page.getByRole("combobox",{name:"Keyword suite",exact:true})).toHaveValue(suite.id);
  await expect(page.getByRole("region",{name:"Keyword questions",exact:true})).toContainText(target);
  await page.goto("/benchmarks?website=other-owned-site");
  await expect(page.getByRole("combobox",{name:"Keyword suite",exact:true})).toHaveValue("");
  await expect(page.getByText("Choose a saved suite. No suite was selected automatically for this website.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Run baseline",exact:true})).toHaveCount(0);
  expect(state.starts).toEqual([]);expect(state.saves).toEqual([]);expect(state.forbidden).toEqual([]);
});

test("a released unknown creation permits a different question while its original question stays blocked", async ({ page }) => {
  const held = { ...run(), status: "requires_action" as const, sessionId: null, answer: null,
    holdReleasedAt: at, holdReleaseReason: "owner-acknowledged-unknown-creation-cost" as const };
  const state = await fixture(page, [held]);
  state.suites = [{ ...suite, cases: [...suite.cases, { ...suite.cases[0], id: "different-question", query: "Which tools suit a different task?" }] }];
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeDisabled();
  await expect(page.getByText("This question has an unresolved earlier attempt. Choose a different question while it is reviewed.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Which tools suit a different task?", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run baseline", exact: true })).toBeEnabled();
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("sandbox SEO is off by default and only the explicit start carries authorization", async ({ page }) => {
  const state = await fixture(page);
  state.suites = [{ ...suite, cases: suite.cases.map(item => ({ ...item, searchMode: "open-web" })) }];
  await page.goto(`/benchmarks?suite=${suite.id}`);
  const checkbox = page.getByRole("checkbox", { name: /Let this agent look up search and backlinks/ });
  await expect(checkbox).not.toBeChecked();
  expect(state.starts).toHaveLength(0);
  await checkbox.check(); expect(state.starts).toHaveLength(0);
  await page.getByRole("button", { name: "Run baseline", exact: true }).click();
  await expect.poll(() => state.starts.length).toBe(1);
  expect(state.starts[0]).toMatchObject({ caseId: suite.cases[0].id, kind: "baseline", useSeoTools: true });
});


test("private report compares matching public context without publishing or starting work", async ({ page }) => {
  const value = run("public-context", "baseline");
  value.case = { ...value.case, searchMode: "open-web" };
  const state = await fixture(page, [value]);
  const query = { id: "public-query", audience: "Learning", category: "Fixture", query: value.case.query, language: value.case.language, locale: value.case.locale };
  const observation = { id: "public-observation", queryId: query.id, observedAt: at, status: "completed", model: value.model, surface: value.surface,
    searchMode: "open-web", harnessVersion: value.harnessVersion, environmentType: value.environmentType,
    recommendations: [{ position: 1, name: "Public fixture recommendation", url: "https://example.com", citationUrls: [] }], citations: [], limitations: ["Fixture only"] };
  let available = true;
  await page.route("**/api/public/benchmarks", route => route.fulfill({ json: buildPublicDashboard({ format: "folio-public-search-rankings-v1", queries: [query], observations: available ? [observation] : [] },
    { format: "folio-public-search-progress-v1", updatedAt: at, queries: [{ queryId: query.id, status: available ? "completed" : "not-started", ...(available ? { observationId: observation.id } : {}) }] }) }));
  await page.goto(`/benchmarks?suite=${suite.id}&run=${value.id}`);
  const comparison = page.getByRole("region", { name: "Compare with the public index", exact: true });
  await expect(comparison).toContainText("Public fixture recommendation");
  await expect(comparison).toContainText("no change score");
  await expect(comparison.getByRole("link", { name: "Inspect the public question, sources and history" })).toHaveAttribute("href", "/overview?query=public-query");
  available = false;
  await comparison.getByRole("button", { name: "Refresh public comparison" }).click();
  await expect(comparison).toContainText("no published observation with the same model");
  await expect(comparison.getByText("Public fixture recommendation")).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.saves).toEqual([]); expect(state.forbidden).toEqual([]);
});

test("publication requires a reviewed preview; withdrawal clears the shared result without a paid start", async ({page})=>{
 const state=await fixture(page,[run()]);
 const payload={format:"folio-public-search-rankings-v1",queries:[{id:"shared-fixture",audience:"Software & work",category:"Planning",query:suite.cases[0].query,language:"en",locale:"US"}],observations:[]};
 const actions:string[]=[];let published=false,revision=0;
 await page.route("**/api/benchmarks/runs/*/publication",async route=>{
  const request=route.request();
  if(request.method()==="GET")return route.fulfill({json:{published,revision,payload:published?payload:null}});
  const body=request.postDataJSON();actions.push(body.action);
  if(body.action==="preview")return route.fulfill({json:{payload,reviewHash:"reviewed-fixture",revision}});
  if(body.action==="publish") {expect(body.reviewHash).toBe("reviewed-fixture");published=true;revision++;}
  if(body.action==="withdraw"){expect(body.revision).toBe(revision);published=false;revision++;}
  return route.fulfill({json:{published,revision,payload:published?payload:null}});
 });
 await page.goto("/benchmarks?run=baseline-fixture");
 const sharing=page.getByRole("region",{name:"Public index sharing"});
 await sharing.getByRole("button",{name:"Share this result with the public index"}).click();
 await sharing.getByLabel("Category",{exact:true}).fill("Planning");
 await sharing.getByRole("button",{name:"Preview public fields"}).click();
 await expect(sharing.getByRole("heading",{name:"Exactly what will be published"})).toBeVisible();
 expect(actions).toEqual(["preview"]);expect(published).toBe(false);
 await noOverflow(page);
 await sharing.getByRole("button",{name:"Cancel preview"}).click();
 await expect(sharing.getByRole("button",{name:"Publish these fields"})).toHaveCount(0);
 await sharing.getByRole("button",{name:"Preview public fields"}).click();
 await sharing.getByRole("button",{name:"Publish these fields"}).click();
 await expect(sharing.getByRole("link",{name:"View in the public index"})).toHaveAttribute("href","/overview?query=shared-fixture");
 await sharing.getByRole("button",{name:"Withdraw from public index"}).click();
 await expect(sharing.getByRole("button",{name:"Preview public fields"})).toBeVisible();
 expect(actions).toEqual(["preview","preview","publish","withdraw"]);expect(state.starts).toEqual([]);expect(state.forbidden).toEqual([]);
 await noOverflow(page);
});

const modelOptions = [
  { id: "gpt-6-astra", label: "Astra", validation: "validated" as const },
  { id: "gpt-5.6-luna", label: "Luna", validation: "experimental" as const },
];
test("open-web model selection starts nothing until an explicit paid start", async ({ page }) => {
  const state = await fixture(page);
  state.openWebModels = modelOptions;
  state.suites = [{ ...suite, cases: suite.cases.map(item => ({ ...item, searchMode: "open-web" })) }];
  await page.goto(`/benchmarks?suite=${suite.id}`);
  const select = page.getByRole("combobox", { name: "Model for the next observation", exact: true });
  await expect(select).toHaveValue("gpt-6-astra");
  const seo = page.getByRole("checkbox", { name: /Let this agent look up search and backlinks/ });
  await seo.check();
  await select.selectOption("gpt-5.6-luna");
  await expect(seo).not.toBeChecked();
  await expect(seo).toBeDisabled();
  await expect(page.getByText(/Search and backlink tools are available only with Astra/)).toBeVisible();
  await select.selectOption("gpt-6-astra");
  await expect(seo).toBeEnabled();
  await expect(seo).not.toBeChecked();
  await select.selectOption("gpt-5.6-luna");
  await expect(page.getByText(/Luna is experimental in this workflow/)).toBeVisible();
  expect(state.starts).toEqual([]);
  await noOverflow(page);
  await page.getByRole("button", { name: "Run baseline", exact: true }).click();
  await expect.poll(() => state.starts.length).toBe(1);
  expect(state.starts[0]).toEqual({ caseId: suite.cases[0].id, kind: "baseline", model: "gpt-5.6-luna" });
  expect(state.forbidden).toEqual([]);
});

test("reviewed documentation omits the open-web model from a paid start", async ({ page }) => {
  const state = await fixture(page); state.openWebModels = modelOptions;
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await expect(page.getByRole("combobox", { name: "Model for the next observation", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Run baseline", exact: true }).click();
  await expect.poll(() => state.starts.length).toBe(1);
  expect(state.starts[0]).toEqual({ caseId: suite.cases[0].id, kind: "baseline" });
});

test("changing model preserves the fresh baseline link and explains mismatched context", async ({ page }) => {
  const baseline = run(); baseline.model = "gpt-6-astra"; baseline.case = { ...baseline.case, searchMode: "open-web" };
  const state = await fixture(page, [baseline]); state.openWebModels = modelOptions;
  state.suites = [{ ...suite, cases: [{ ...suite.cases[0], ...baseline.case }] }];
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await page.getByRole("combobox", { name: "Model for the next observation", exact: true }).selectOption("gpt-5.6-luna");
  await expect(page.getByText(/The selected baseline uses a different model/)).toBeVisible();
  expect(state.starts).toEqual([]);
  await page.getByRole("button", { name: "Run fresh observation", exact: true }).click();
  await expect.poll(() => state.starts.length).toBe(1);
  expect(state.starts[0]).toMatchObject({ model: "gpt-5.6-luna", kind: "fresh", baselineRunId: baseline.id });
  await expect(page.getByText("Ordered as returned by gpt-5.6-luna for this question.")).toBeVisible();
});

test("model selection resets when a different owner signs in", async ({ page }) => {
  const state = await fixture(page); state.openWebModels = modelOptions;
  state.suites = [{ ...suite, cases: suite.cases.map(item => ({ ...item, searchMode: "open-web" })) }];
  await page.goto(`/benchmarks?suite=${suite.id}`);
  await page.getByRole("combobox", { name: "Model for the next observation", exact: true }).selectOption("gpt-5.6-luna");
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => state.owner).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await navigate(page, "/benchmarks");
  await expect(page.getByRole("combobox", { name: "Model for the next observation", exact: true })).toHaveValue("gpt-6-astra");
  expect(state.starts).toEqual([]); expect(state.forbidden).toEqual([]);
});
