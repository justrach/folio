import { expect, test, type Locator, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun, KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";

const at = "2026-10-18T08:00:00.000Z";
const target = "https://spacing-fixture.dev/";
const longQuestion = `WhichService${"ExplainsCodeAndSources".repeat(9)}?`;
const questions = [longQuestion, "Which service helps a small team verify a returned answer?"];
const suite: KeywordBenchmarkSuite = { id: "spacing-suite", name: "Spacing fixture customer questions", description: "Browser fixture only", createdAt: at,
  cases: questions.map((query, index) => ({ id: `spacing-question-${index}`, suiteId: "spacing-suite", query, targetUrl: target, searchMode: "open-web", revision: 0,
    createdAt: at, updatedAt: at, language: "en", locale: "US", rubricVersion: "fixture" })) };
function run(status: "queued" | "completed"): KeywordBenchmarkRun {
  return { id: "spacing-run", suiteId: suite.id, caseId: suite.cases[0].id, case: suite.cases[0], kind: "baseline", baselineRunId: null, surface: "openai-managed-agents",
    publication: "private", model: "gpt-6-luna", harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture", status,
    sessionId: "fixture-session", createAttemptAt: at, deadlineAt: at, cancelAttemptAt: null, cancelAcknowledgedAt: null, allowedDomains: [], createdAt: at, updatedAt: at, revision: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, providerMetadata: { requestId: null, turnId: null, environmentId: null }, error: null,
    answer: status === "completed" ? { text: `A returned answer with a long unbroken token: ${"RecordedEvidence".repeat(18)}.`,
      mentions: [{ name: "Spacing fixture business", url: target, reason: "A returned explanation with sources to review.", citationUrls: [target] }],
      citations: [{ url: target, title: `ReturnedSource${"Evidence".repeat(12)}`, quote: "A returned excerpt, not independently verified." }], limitations: ["Browser fixture only"] } : null };
}
async function fixture(page: Page) {
  const state = { owner: null as string | null, saved: false, authError: true, setupError: true, paidWrites: [] as string[], localWrites: [] as string[], runs: [] as KeywordBenchmarkRun[], suite: structuredClone(suite), historyError: false, historyHold: null as Promise<void> | null, historyCompleted: 0, historyRequested: 0, signInOwner: "spacing-owner" };
  const profile = () => ({ id: "spacing-profile", websiteId: "spacing-site", suiteId: suite.id, websiteUrl: target,
    businessName: "A deliberately long fixture business name for collaborative software research teams",
    description: "A fixture business helping small teams understand code, inspect citations and compare returned answers. ".repeat(4),
    audience: "Engineering teams evaluating tools and recorded evidence.", capabilities: "Inspecting sources, comparing answers and preparing questions.", competitors: [], questions, savedAt: at });
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname, method = req.method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: { id: state.owner, name: "Spacing fixture owner", email: "fixture@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "spacing-session", userId: state.owner, token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (path === "/api/auth/sign-out") {
      state.owner = null; state.saved = false; state.runs = [];
      return route.fulfill({ json: { success: true } });
    }
    if (path === "/api/auth/sign-in/email" && method === "POST") {
      state.localWrites.push(path);
      if (state.authError) return route.fulfill({ status: 401, json: { code: "INVALID_EMAIL_OR_PASSWORD", message: `FixtureSignInError${"PleaseReviewYourDetails".repeat(7)}` } });
      state.owner = state.signInOwner; return route.fulfill({ json: { token: "fixture", redirect: false, user: { id: state.owner } } });
    }
    if (path === "/api/onboarding" && method === "PUT") {
      state.localWrites.push(path);
      if (state.setupError) return route.fulfill({ status: 503, json: { error: `FixtureSetupSaveError${"RefreshBeforeTryingAgain".repeat(7)}` } });
      state.saved = true; return route.fulfill({ json: { profile: profile() } });
    }
    if (method !== "GET") { state.paidWrites.push(`${method} ${path}`); return route.fulfill({ status: 409, json: { error: "No paid work is authorized in this fixture" } }); }
    if (path === "/api/onboarding") return route.fulfill({ json: { profile: state.saved ? profile() : null } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: state.saved ? [{ id: "spacing-site", name: profile().businessName, url: target }] : [] } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { suites: state.saved ? [{ ...state.suite, cases: undefined, caseCount: state.suite.cases.length }] : [], templates: [],
      access: { configured: true, authorized: true, canRun: true, maxRunsPerDay: 3, maxActiveRuns: 1, openWebModels: [{ id: "gpt-6-luna", label: "Luna 6", validation: "validated" }], managedOpenWebModels: [{ id: "gpt-6-luna", label: "Luna 6", validation: "validated" }] },
      usage: { attemptsLast24Hours: 0, remainingRuns: 3, activeRuns: state.runs.some(value => value.status === "queued") ? 1 : 0, remainingActiveRuns: state.runs.some(value => value.status === "queued") ? 0 : 1 } } });
    if (path === `/api/benchmarks/${suite.id}`) return route.fulfill({ json: { suite: state.suite } });
    if (path === "/api/benchmarks/runs") {
      state.historyRequested++;
      if (state.historyError) return route.fulfill({ status: 503, json: { error: "Fixture saved history could not be loaded" } });
      const json = { runs: state.runs.map(({ answer, ...value }) => ({ ...value, answerCharacters: answer?.text.length ?? 0, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0 })), models: [], nextCursor: null };
      if (state.historyHold) await state.historyHold;
      await route.fulfill({ json }).catch(() => {}); state.historyCompleted++; return;
    }
    if (path === "/api/benchmarks/runs/spacing-run") return route.fulfill({ json: { run: state.runs[0] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/seo-reports" || path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, message: "Fixture" } });
    return route.fulfill({ status: 404, json: { error: "Fixture has no other API" } });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}
async function alignedInputs(container: Locator) {
  const heading = await container.getByRole("heading", { level: 2 }).boundingBox(); expect(heading).not.toBeNull();
  for (const field of await container.locator("input:not([type=checkbox]), textarea").all()) {
    const box = await field.boundingBox(); if (!box) continue;
    expect(Math.abs(box.x - heading!.x)).toBeLessThanOrEqual(2);
    const card = await container.boundingBox(); expect(card).not.toBeNull();
    expect(box.x + box.width).toBeLessThanOrEqual(card!.x + card!.width - 14);
  }
}

test("long-content onboarding through saved results retains spacing at3203907681440 without provider writes", async ({ page }, info) => {
  test.setTimeout(180_000);
  const state = await fixture(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    state.owner = null; state.saved = false; state.authError = true; state.setupError = true; state.runs = [];
    await page.goto("/onboarding"); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    const card = page.locator(".setup-card");
    await page.getByLabel("Website URL", { exact: true }).fill(target);
    await page.getByLabel("Business name", { exact: true }).fill("A deliberately long fixture business name for collaborative software research teams");
    await alignedInputs(card); await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`website-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue →", exact: true }).click();
    await page.getByLabel("What does your business do?", { exact: true }).fill("A fixture business helping small teams understand code, inspect citations and compare returned answers. ".repeat(4));
    await page.getByLabel("Who is it for?", { exact: true }).fill("Engineering teams evaluating tools and recorded evidence.");
    await alignedInputs(card); await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`business-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue →", exact: true }).click();
    await page.getByLabel("Customer questions, one per line", { exact: true }).fill(questions.join("\n"));
    await alignedInputs(card); await noOverflow(page);
    await page.screenshot({ path: info.outputPath(`questions-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue →", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your workspace setup", exact: true })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`setup-review-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Sign in to save privately →", exact: true }).click();
    for (const control of [page.locator(".back-demo"), page.locator(".auth-switch button")]) {
      const box = await control.boundingBox(); expect(box).not.toBeNull(); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel("Email address", { exact: true }).fill("fixture@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Fixture browser password only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "FixtureSignInError" })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`login-error-${width}.png`), fullPage: true });
    state.authError = false; await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your workspace setup", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Save to my workspace", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "FixtureSetupSaveError" })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`setup-error-${width}.png`), fullPage: true });
    state.setupError = false; await page.getByRole("button", { name: "Save to my workspace", exact: true }).click();
    await page.getByRole("link", { name: "Open your workspace →", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your next step", exact: true })).toBeVisible();
    await page.getByText("Business details & saved questions", { exact: true }).click();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`workspace-expanded-${width}.png`), fullPage: true });
    await page.getByRole("link", { name: "Review this question", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`question-review-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Continue to run review", exact: true }).click();
    await page.getByText("Advanced run options", { exact: true }).click();
    const options = page.locator(".guided-run-options");
    const tools = await options.locator(".research-tool-card").all();
    expect(tools).toHaveLength(2);
    const first = await tools[0].boundingBox(), second = await tools[1].boundingBox();
    expect(second!.y - first!.y - first!.height).toBeGreaterThanOrEqual(10);
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`run-options-${width}.png`), fullPage: true });
    state.runs = [run("queued")];
    const runHref = `/evaluations?view=search&suite=${suite.id}&run=spacing-run&website=spacing-site`;
    await page.goto(runHref);
    const activity = page.getByRole("region", { name: "Observation progress", exact: true });
    await expect(activity).toBeVisible();
    const copy = await activity.locator(".research-activity-copy").boundingBox(); expect(copy).not.toBeNull();
    expect(copy!.width).toBeGreaterThanOrEqual(120); expect(copy!.height).toBeLessThan(400);
    await activity.getByRole("button", { name: "Recorded milestones", exact: false }).click();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`progress-expanded-${width}.png`), fullPage: true });
    state.runs = [run("completed")]; await page.reload();
    const report = page.getByRole("region", { name: "Keyword observation", exact: true });
    await expect(report.getByRole("region", { name: "Recorded answer", exact: true })).toBeVisible();
    await report.getByRole("region", { name: "Returned recommendations", exact: true }).locator("summary").click();
    await report.getByText("Run details", { exact: true }).click();
    await noOverflow(page); await page.screenshot({ path: info.outputPath(`result-expanded-${width}.png`), fullPage: true });
    expect(state.paidWrites).toEqual([]);
  }
});


const map = (page: Page) => page.getByRole("region", { name: "Your saved question map", exact: true });
const resultHref = `/evaluations?view=search&suite=${suite.id}&run=spacing-run&website=spacing-site`;

test("question map preserves owned selection, answer identity and native navigation without starting work", async ({ page }) => {
  const state = await fixture(page); state.owner = "spacing-owner"; state.saved = true; state.runs = [run("completed")];
  await page.goto(resultHref);
  await expect(map(page)).toContainText("1 of 2 saved questions have recorded answers");
  await expect(map(page).getByRole("button", { name: /^Question 1:/ })).toHaveAttribute("aria-current", "true");
  await expect(map(page).getByRole("button", { name: /^Question 1:/ })).toContainText("Answer recorded");
  await expect(map(page).getByRole("button", { name: /^Question 2:/ })).toContainText("Not run");
  await map(page).getByRole("button", { name: /^Question 2:/ }).click();
  const selected = new URL(page.url()).searchParams;
  expect(selected.get("suite")).toBe(suite.id); expect(selected.get("case")).toBe(suite.cases[1].id); expect(selected.get("website")).toBe("spacing-site"); expect(selected.has("run")).toBe(false);
  await expect(page.getByRole("heading", { name: "Review your question", exact: true })).toBeVisible();
  await expect(page.locator(".guided-run-question")).toHaveText(questions[1]);
  await page.reload(); await expect(map(page).getByRole("button", { name: /^Question 2:/ })).toHaveAttribute("aria-current", "true");
  await page.goBack(); await expect(page.getByRole("region", { name: "Recorded answer", exact: true })).toBeVisible();
  await expect(map(page).getByRole("button", { name: /^Question 1:/ })).toHaveAttribute("aria-current", "true");
  await map(page).getByText("Read all saved questions", { exact: true }).click();
  await expect(map(page).locator(".saved-question-map-list")).toContainText(longQuestion);
  await noOverflow(page); expect(state.paidWrites).toEqual([]);
});

test("question map distinguishes changed frozen inputs from revision counters and unconfirmed reads", async ({ page }) => {
  const state = await fixture(page); state.owner = "spacing-owner"; state.saved = true; state.runs = [run("completed")];
  state.runs[0].revision = 80; state.suite.cases[0].revision = 4;
  await page.goto(resultHref); await expect(map(page)).toContainText("1 of 2 saved questions have recorded answers");
  state.suite.cases[0].query = "A newly edited customer question with no matching answer";
  await page.reload(); await expect(map(page)).toContainText("0 of 2 saved questions have recorded answers");
  await expect(map(page).getByRole("button", { name: /^Question 1:/ })).toContainText("Inputs changed · no matching answer");
  state.historyError = true; await page.reload();
  await expect(map(page)).toContainText("Saved history is not confirmed. Answer counts are unavailable.");
  await expect(map(page).getByRole("button", { name: /^Question 2:/ })).toContainText("History not confirmed");
  await expect(map(page)).not.toContainText("0 of 2 saved questions");
  expect(state.paidWrites).toEqual([]);
});

test("late question history cannot restore a previous owner's map after account change", async ({ page }) => {
  const state = await fixture(page); state.owner = "spacing-owner"; state.saved = true; state.runs = [run("completed")];
  let release!: () => void; state.historyHold = new Promise<void>(resolve => { release = resolve; });
  await page.goto(`/evaluations?view=search&suite=${suite.id}&website=spacing-site&case=${suite.cases[1].id}`);
  await expect.poll(() => state.historyRequested).toBeGreaterThan(0);
  await expect(map(page)).toHaveCount(0);
  await page.goto("/settings"); await page.getByRole("button", { name: "Sign out", exact: true }).click();
  state.historyHold = null; release(); await expect.poll(() => state.historyCompleted).toBeGreaterThan(0);
  state.authError = false; state.signInOwner = "another-owner";
  await page.goto("/login"); await page.getByLabel("Email address", { exact: true }).fill("another@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Fixture browser password only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.goto("/evaluations?view=search");
  await expect(map(page)).toHaveCount(0);
  await expect(page.getByText(longQuestion, { exact: true })).toHaveCount(0);
  expect(state.owner).toBe("another-owner"); expect(state.paidWrites).toEqual([]);
});
