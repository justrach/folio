import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE } from "../src/lib/evals";
import { CUSTOMER_QUESTION_TEMPLATES } from "../src/lib/keyword-benchmark-catalog";
import type { KeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-types";
import type { QuestionSuiteInput } from "../src/lib/question-suite-input";

const at = "2026-09-13T08:00:00.000Z";
const template = CUSTOMER_QUESTION_TEMPLATES[0];
const templateText = template.cases.map(value => value.query).join("\n");
const site = (owner: string) => ({ id: `${owner}-site`, name: `${owner} fixture shop`, url: `https://${owner}.example.test/shop/`, isPublic: false, createdAt: at, seoScore: null, lastScannedAt: null });

async function fixture(page: Page) {
  const state = { owner: "alice" as string | null, saves: [] as QuestionSuiteInput[], suites: [] as { owner: string; suite: KeywordBenchmarkSuite }[],
    forbidden: [] as string[], providers: [] as string[], errors: [] as string[] };
  page.on("pageerror", error => state.errors.push(error.message));
  const connection = { configured: false, authorized: false, canRun: false, model: "fixture-model", allowedTargets: [], message: "Browser fixture only." };
  const user = () => ({ id: state.owner!, name: "Fixture owner", email: `${state.owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at });
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? { user: user(), session: {
      id: `${state.owner}-session`, userId: state.owner, token: "non-secret-browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at,
    } } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/auth/sign-in/email") { state.owner = "bob"; return route.fulfill({ json: { user: user(), token: "non-secret-browser-fixture", redirect: false } }); }
    if (path === "/api/sites" && method === "GET") return route.fulfill({ json: { sites: state.owner ? [site(state.owner)] : [] } });
    if (path.startsWith("/api/benchmarks") && !state.owner) return route.fulfill({ status: 401, json: { error: "Sign in required." } });
    if (path === "/api/benchmarks" && method === "GET") return route.fulfill({ json: {
      suites: state.suites.filter(value => value.owner === state.owner).map(({ suite }) => ({ id: suite.id, name: suite.name, description: suite.description, createdAt: suite.createdAt, caseCount: suite.cases.length })),
      templates: [template], access: { configured: true, authorized: true, canRun: true, model: "fixture-model", maxRunsPerDay: 6, maxActiveRuns: 1 },
      usage: { attemptsLast24Hours: 0, remainingRuns: 6, activeRuns: 0, remainingActiveRuns: 1 },
    } });
    if (path === "/api/benchmarks" && method === "POST") {
      const input = request.postDataJSON() as QuestionSuiteInput;
      state.saves.push(input);
      if (!Array.isArray(input.questions) || input.websiteId !== site(state.owner!).id)
        return route.fulfill({ status: 400, json: { error: "Expected edited questions for the signed-in fixture owner." } });
      const id = `saved-suite-${state.saves.length}`;
      const suite: KeywordBenchmarkSuite = { id, name: input.name, description: "Synthetic saved draft response.", createdAt: at,
        cases: input.questions.map((query, index) => ({ id: `saved-case-${index}`, suiteId: id, revision: 0, createdAt: at, updatedAt: at,
          query, targetUrl: site(state.owner!).url, language: input.language, locale: input.locale, searchMode: "open-web", rubricVersion: "keyword-open-web-v1" })) };
      state.suites.push({ owner: state.owner!, suite });
      return route.fulfill({ status: 201, json: { suite } });
    }
    if (path === "/api/benchmarks/runs" && method === "GET") return route.fulfill({ json: { runs: [] } });
    const saved = state.suites.find(value => value.owner === state.owner && path === `/api/benchmarks/${value.suite.id}`);
    if (saved && method === "GET") return route.fulfill({ json: { suite: saved.suite } });
    if (method !== "GET") {
      state.forbidden.push(`${method} ${path}`);
      return route.fulfill({ status: 409, json: { error: "Question editing must not submit evaluation or provider work." } });
    }
    if (path === "/api/agents/status") return route.fulfill({ json: connection });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [], connection, suite: EVAL_SUITE } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/seo-data") return route.fulfill({ json: { configured: false, authorized: false } });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/search-console") return route.fulfill({ json: { configured: false, signedIn: !!state.owner, connected: false } });
    if (path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 404, json: { error: "No other API is available in this browser fixture." } });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(pattern, route => { state.providers.push(route.request().url()); return route.abort("blockedbyclient"); });
  return state;
}

function editor(page: Page) { return page.getByRole("form", { name: "Write a question suite", exact: true }); }
async function openEditor(page: Page, owner = "alice") {
  await expect(page.getByRole("combobox", { name: "Saved website", exact: true })).toHaveValue(site(owner).id);
  await page.getByRole("button", { name: "Write or edit these questions", exact: true }).click();
  await expect(editor(page)).toBeVisible();
}
async function navigate(page: Page, path: string) {
  const opener = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`.nav-link[href="${path}"]`).click();
}
async function noWorkOrOverflow(page: Page, state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.forbidden).toEqual([]);
  expect(state.providers).toEqual([]);
  expect(state.errors).toEqual([]);
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, inner: innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.inner).toBeLessThanOrEqual(dimensions.width + 1);
}

test("edited multiline questions save the exact trimmed draft and leave each observation unstarted", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto(`/benchmarks?target=${encodeURIComponent(site("alice").url)}`);
  await openEditor(page);
  await expect(editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true })).toHaveValue(templateText);
  const questions = ["Which shops have clear delivery dates?", "How do return windows compare?", "Quels frais faut-il prévoir ?"];
  await editor(page).getByLabel("Suite name", { exact: true }).fill("  Buying questions  ");
  await editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true }).fill(`  ${questions[0]}  \n\n${questions[1]}\n  ${questions[2]}\n`);
  await editor(page).getByLabel("Answer language", { exact: true }).fill(" Français ");
  await editor(page).getByLabel("Customer location", { exact: true }).fill(" Québec ");
  await expect(editor(page)).toContainText("3 / 10 questions");
  await editor(page).screenshot({ path: info.outputPath("edited-question-suite.png"), animations: "disabled" });
  await editor(page).getByRole("button", { name: "Save questions", exact: true }).click();
  await expect(page.getByText("Questions saved. No observation has been started.", { exact: true })).toBeVisible();
  expect(state.saves).toEqual([{ name: "Buying questions", websiteId: "alice-site", questions, language: "Français", locale: "Québec" }]);
  await expect(editor(page)).toHaveCount(0);
  const saved = page.getByRole("region", { name: "Keyword questions", exact: true });
  await expect(saved).toContainText("0 of 3 questions have a completed answer");
  for (const question of questions) await expect(saved.getByRole("button", { name: question, exact: true })).toContainText("Draft · not started");
  await noWorkOrOverflow(page, state);
});

test("duplicate questions are rejected in the editor without saving and cancel discards the draft", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/benchmarks");
  await openEditor(page);
  await editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true }).fill("How much does delivery cost?\n  HOW MUCH DOES DELIVERY COST?  ");
  await editor(page).getByRole("button", { name: "Save questions", exact: true }).click();
  await expect(editor(page).getByRole("alert")).toHaveText("Remove duplicate questions from this suite.");
  expect(state.saves).toEqual([]);
  await editor(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor(page)).toHaveCount(0);
  await openEditor(page);
  await expect(editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true })).toHaveValue(templateText);
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await noWorkOrOverflow(page, state);
});

test("logout discards the unsaved draft and a different owner starts with only their website", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/benchmarks");
  await openEditor(page);
  const privateQuestion = "ALICE_PRIVATE_DRAFT: which supplier terms can we offer?";
  await editor(page).getByLabel("Suite name", { exact: true }).fill("Alice private draft");
  await editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true }).fill(privateQuestion);
  await navigate(page, "/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect.poll(() => state.owner).toBeNull();
  await navigate(page, "/benchmarks");
  await expect(page.getByRole("link", { name: "Sign in to your workspace", exact: true })).toBeVisible();
  await expect(editor(page)).toHaveCount(0);
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill("bob@example.test");
  await page.getByLabel("Password", { exact: true }).fill("browser-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await navigate(page, "/benchmarks");
  await openEditor(page, "bob");
  await expect(editor(page).getByLabel("Suite name", { exact: true })).toHaveValue(template.name);
  await expect(editor(page).getByRole("textbox", { name: "Questions, one per line", exact: true })).toHaveValue(templateText);
  await expect(page.getByRole("combobox", { name: "Saved website", exact: true })).not.toContainText("alice");
  await expect(page.locator("body")).not.toContainText(privateQuestion);
  expect(state.saves).toEqual([]);
  await noWorkOrOverflow(page, state);
});
