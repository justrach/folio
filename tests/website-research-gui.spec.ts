import { expect, test, type Page } from "@playwright/test";
import type { KeywordBenchmarkRun } from "../src/lib/keyword-benchmark-types";

const at = "2026-09-13T08:00:00.000Z";
const sites = [
  { id: "research-target", name: "Research fixture", url: "https://target.example.com/", isPublic: false, seoScore: null },
  { id: "research-other", name: "Other fixture", url: "https://other.example.com/", isPublic: false, seoScore: null },
];
const editedQuery = "Which documentation tools support small design teams?";
function discovery(id = "discovery-fixture", targetUrl = sites[0].url): KeywordBenchmarkRun {
  return {
    id, suiteId: "research-suite", caseId: `case-${id}`, kind: "fresh", baselineRunId: null,
    surface: "openai-managed-agents", publication: "private", model: "fixture-managed-model",
    harnessVersion: "fixture", environmentType: "none", environmentFingerprint: "fixture",
    case: { query: "Discover customer queries", targetUrl, language: "en", locale: "US", rubricVersion: "fixture", searchMode: "open-web", websiteResearch: { stage: "query-discovery" } },
    status: "completed", sessionId: "fixture-provider-session", createAttemptAt: at, allowedDomains: [], deadlineAt: null,
    cancelAttemptAt: null, cancelAcknowledgedAt: null, createdAt: at, updatedAt: at, revision: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    providerMetadata: { environmentId: null, requestId: null, turnId: null }, error: null,
    answer: { text: "Illustrative saved research fixture", mentions: [], citations: [{ url: targetUrl }], limitations: ["Illustrative GUI fixture; no provider validation."],
      websiteResearch: { stage: "query-discovery", targetUrl, siteSummary: "Illustrative target documentation software for small teams.", sourceUrls: [targetUrl],
        queries: [{ query: "Best documentation tools for teams", intent: "Compare team documentation tools", fit: "Relevant to the target's documentation product", sourceUrls: [targetUrl] },
          { query: "Which tools help design teams share documentation?", intent: "Compare design-team workflows", fit: "Relevant to team collaboration", sourceUrls: [targetUrl] }] } },
  };
}
function competitor(): KeywordBenchmarkRun {
  const origin = discovery();
  return { ...origin, id: "competitor-fixture", caseId: "competitor-case",
    case: { ...origin.case, query: editedQuery, websiteResearch: { stage: "competitor-research", discoveryRunId: origin.id } },
    answer: { text: "Illustrative competitor brief", mentions: [{ name: "Second alphabetically", url: "https://zeta.example.com/" }, { name: "First alphabetically", url: "https://alpha.example.com/" }],
      citations: [{ url: "https://zeta.example.com/design" }, { url: "https://alpha.example.com/teams" }],
      limitations: ["Target pricing page could not be inspected. Sources are not exhaustive.", "Illustrative GUI fixture; no provider validation."],
      websiteResearch: { stage: "competitor-research", targetUrl: sites[0].url, query: editedQuery, targetSourceUrls: [], competitors: [
        { position: 1, name: "Second alphabetically", url: "https://zeta.example.com/", sourceUrls: ["https://zeta.example.com/design"], strengths: [{ finding: "Provides a source-linked design handoff guide.", sourceUrls: ["https://zeta.example.com/design"], targetSourceUrls: [], comparison: "target_not_established", suggestion: "Review whether a concrete handoff example would help target customers." }] },
        { position: 2, name: "First alphabetically", url: "https://alpha.example.com/", sourceUrls: ["https://alpha.example.com/teams"], strengths: [{ finding: "Documents small-team onboarding.", sourceUrls: ["https://alpha.example.com/teams"], targetSourceUrls: [], comparison: "target_not_established", suggestion: "Consider documenting the target's onboarding workflow." }] },
      ] } },
  };
}
type StartBody = { stage: string; query?: string; discoveryRunId?: string; model?: string; requestKey: string; confirmSpend: boolean };
async function fixture(page: Page, options: { saved?: boolean; failFirstStart?: boolean; failFirstSave?: boolean; delayDiscovery?: Promise<void> } = {}) {
  const state = { sites: [...sites], saves: [] as { url: string }[], owner: "research-owner-a" as string | null, starts: [] as StartBody[], mutations: [] as string[], reads: [] as string[], runs: options.saved ? [competitor(), discovery()] : [] as KeywordBenchmarkRun[] };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: state.owner ? {
      user: { id: state.owner, name: "Fixture reviewer", email: "research-fixture@example.test", emailVerified: true },
      session: { id: "fixture-session", userId: state.owner, expiresAt: "2099-01-01T00:00:00Z" },
    } : null });
    if (path === "/api/auth/sign-out") { state.owner = null; return route.fulfill({ json: { success: true } }); }
    if (path === "/api/sites") {
      if (method === "POST") {
        const body = route.request().postDataJSON() as { url: string }; state.saves.push(body);
        if (options.failFirstSave && state.saves.length === 1) return route.fulfill({ status: 503, json: { error: "Fixture: website could not be saved yet." } });
        const site = { id: "new-saved-site", name: "Saved URL fixture", url: body.url, isPublic: false, seoScore: null };
        state.sites = [site, ...state.sites.filter(item => item.id !== site.id)];
        return route.fulfill({ status: 201, json: { site } });
      }
      return route.fulfill({ json: { sites: state.owner ? state.sites : [] } });
    }
    const site = state.sites.find(item => path === `/api/sites/${item.id}/research`);
    if (site) {
      if (method === "POST") {
        const body = route.request().postDataJSON() as StartBody; state.starts.push(body);
        const run = body.stage === "query-discovery" ? discovery() : competitor();
        if (!state.runs.some(item => item.id === run.id)) state.runs.unshift(run);
        if (options.failFirstStart && state.starts.length === 1) return route.fulfill({ status: 503, json: { error: "Unknown HTTP outcome. A private receipt may already exist." } });
        return route.fulfill({ json: { run } });
      }
      return route.fulfill({ json: {
        runs: state.runs.filter(run => run.case.targetUrl === site.url).map(({ answer, ...run }) => ({ ...run, answerCharacters: answer?.text.length ?? 0, mentionCount: answer?.mentions.length ?? 0, citationCount: answer?.citations.length ?? 0 })), nextCursor: null,
        access: { configured: true, authorized: true, canRun: true, openWebModels: [{ id: "fixture-managed-model", label: "Managed fixture model" }], maxRunsPerDay: 5, maxActiveRuns: 1 },
      } });
    }
    if (path.startsWith("/api/benchmarks/runs/")) {
      const id = path.split("/").at(-1)!; state.reads.push(id);
      if (method !== "GET") { state.mutations.push(path); return route.fulfill({ status: 409, json: { error: "Unexpected retrieval or mutation." } }); }
      if (id === "discovery-fixture" && options.delayDiscovery) await options.delayDiscovery;
      const run = state.runs.find(item => item.id === id);
      return route.fulfill({ status: run ? 200 : 404, json: run ? { run } : { error: "Saved fixture not found." } }).catch(() => undefined);
    }
    if (method !== "GET") { state.mutations.push(path); return route.fulfill({ status: 403, json: { error: "Unexpected mutation blocked by GUI fixture." } }); }
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/seo-data") return route.fulfill({ json: { configured: false, authorized: false } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/search-console/reports") return route.fulfill({ json: { reports: [] } });
    if (path === "/api/agents/status") return route.fulfill({ json: { configured: false, authorized: false, canRun: false, status: "disconnected", message: "Fixture only" } });
    if (path === "/api/search-console/status") return route.fulfill({ json: { configured: false, connected: false } });
    return route.fulfill({ json: {} });
  });
  for (const provider of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://accounts.google.com/**", "https://www.googleapis.com/**"])
    await page.route(provider, route => route.abort("blockedbyclient"));
  return state;
}
const panel = (page: Page) => page.getByRole("region", { name: "Private website research", exact: true });
const brief = (page: Page) => page.getByRole("region", { name: "Saved private research brief", exact: true });

test("saving a URL retries readably and prepares private website research without capture or paid work", async ({ page }) => {
  const state = await fixture(page, { failFirstSave: true }); state.sites = [];
  await page.goto("/websites");
  const form = page.getByRole("form", { name: "Save a website", exact: true });
  await expect(form).toContainText("No page capture, audit, query generation, or paid research");
  await form.getByLabel("Website URL", { exact: true }).fill("https://saved-target.example.com/");
  await form.getByRole("button", { name: "Save website", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("website could not be saved yet");
  await expect(form.getByLabel("Website URL", { exact: true })).toHaveValue("https://saved-target.example.com/");
  await form.getByRole("button", { name: "Save website", exact: true }).click();
  await expect(page).toHaveURL(/site=new-saved-site/);
  await expect(page.getByLabel("Selected website", { exact: true })).toHaveValue("new-saved-site");
  await expect(panel(page)).toContainText("Target: https://saved-target.example.com/");
  await expect(form.getByRole("status")).toContainText("no audit or paid research has started");
  await page.getByRole("link", { name: "Open website research", exact: true }).click();
  await expect(page).toHaveURL(/#website-research$/);
  await expect(panel(page).getByRole("list", { name: "Research steps" }).locator('[aria-current="step"]')).toContainText("Discover queries");
  expect(state.saves).toEqual([{ url: "https://saved-target.example.com/" }, { url: "https://saved-target.example.com/" }]);
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
});

test("two deliberate paid starts preserve the reviewed query and separate discovery provenance", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/websites");
  const research = panel(page);
  const generate = research.getByRole("button", { name: "Generate suggested queries (paid)", exact: true });
  await expect(generate).toBeEnabled();
  expect(state.starts).toEqual([]);
  await generate.focus(); await expect(generate).toBeFocused(); await page.keyboard.press("Enter");
  await expect(research.getByLabel("Suggested query 1", { exact: true })).toHaveValue("Best documentation tools for teams");
  expect(state.starts).toHaveLength(1);
  expect(state.starts[0]).toMatchObject({ stage: "query-discovery", confirmSpend: true, model: "fixture-managed-model" });
  await expect(research.getByRole("list", { name: "Research steps" }).locator('[aria-current="step"]')).toContainText("Review one query");
  await research.getByLabel("Suggested query 1", { exact: true }).fill("A retained discovery draft");
  await research.getByLabel("Choose a suggested query", { exact: true }).selectOption("1");
  await expect(research.getByRole("textbox")).toHaveCount(1);
  await research.getByLabel("Suggested query 2", { exact: true }).fill(editedQuery);
  await research.getByLabel("Choose a suggested query", { exact: true }).selectOption("0");
  await research.getByRole("button", { name: "Refresh saved history", exact: true }).click();
  await expect(research.getByLabel("Suggested query 1", { exact: true })).toHaveValue("A retained discovery draft");
  await research.getByLabel("Choose a suggested query", { exact: true }).selectOption("1");
  await expect(research.getByLabel("Suggested query 2", { exact: true })).toHaveValue(editedQuery);
  await expect(research.getByRole("button", { name: "Research competitors (paid)", exact: true })).toHaveCount(1);
  await research.getByRole("button", { name: "Research competitors (paid)", exact: true }).click();
  await expect(brief(page)).toContainText(editedQuery);
  expect(state.starts).toHaveLength(2);
  expect(state.starts[1]).toMatchObject({ stage: "competitor-research", confirmSpend: true, discoveryRunId: "discovery-fixture", query: editedQuery, model: "fixture-managed-model" });
  expect(state.starts[1].requestKey).not.toBe(state.starts[0].requestKey);
  expect(state.mutations).toEqual([]);
});

test("saved direct entry, refresh, back/forward and private download never start paid work", async ({ page }) => {
  const state = await fixture(page, { saved: true });
  await page.goto("/websites?site=research-target");
  await panel(page).getByRole("button", { name: "Open latest saved brief", exact: true }).click();
  await expect(brief(page)).toContainText(editedQuery);
  expect(await page.evaluate(() => !!(document.querySelector('[aria-label="Saved private research brief"]')!.compareDocumentPosition(document.querySelector('.website-research-stages')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await panel(page).getByRole("button", { name: /^Query discovery ·/ }).click();
  await expect(page).toHaveURL(/research=discovery-fixture/);
  await expect(brief(page)).toContainText("Discover customer queries");
  await page.goBack(); await expect(brief(page)).toContainText(editedQuery);
  await page.goForward(); await expect(brief(page)).toContainText("Discover customer queries");
  await page.reload(); await expect(brief(page)).toContainText("discovery-fixture");
  const downloadPromise = page.waitForEvent("download");
  await brief(page).getByRole("button", { name: "Download private JSON brief", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("private-website-research-discovery-fixture.json");
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
});

test("saved brief keeps returned order, linked evidence, missing target evidence and unknown costs on desktop and mobile", async ({ page }) => {
  const state = await fixture(page, { saved: true });
  await page.goto("/websites?site=research-target&research=competitor-fixture");
  const saved = brief(page);
  await expect(saved).toContainText("Saved run ID for agents: competitor-fixture");
  await expect(saved).toContainText("fixture-managed-model");
  await expect(saved).toContainText("Unknown charges");
  await expect(saved).toContainText("Target evidence not established — this does not prove the target lacks this strength.");
  await expect(saved).toContainText("Target pricing page could not be inspected");
  await expect(saved).toContainText("not a consumer ChatGPT or Google ranking");
  await expect(saved).toContainText("not verified outcomes");
  const candidates = saved.locator(".website-research-competitors > li");
  await expect(candidates).toHaveCount(2);
  await expect(candidates.nth(0)).toContainText("Second alphabetically");
  await expect(candidates.nth(1)).toContainText("First alphabetically");
  await expect(candidates.nth(0).getByRole("link", { name: "Second alphabetically", exact: true })).toHaveAttribute("href", "https://zeta.example.com/");
  await expect(candidates.nth(0).getByRole("link", { name: /https:\/\/zeta.example.com\/design/ }).first()).toHaveAttribute("href", "https://zeta.example.com/design");
  await expect(candidates.nth(0)).toContainText("Review whether a concrete handoff example would help target customers.");
  await expect(panel(page).getByRole("button", { name: /publish|share/i })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
});

test("an unknown HTTP outcome retains the same request key and blocks replacement paid starts", async ({ page }) => {
  const state = await fixture(page, { failFirstStart: true });
  await page.goto("/websites");
  const research = panel(page);
  await research.getByRole("button", { name: "Generate suggested queries (paid)", exact: true }).click();
  await expect(research.getByRole("alert")).toContainText("Unknown HTTP outcome");
  await expect(research.getByRole("button", { name: "Generate suggested queries (paid)", exact: true })).toBeDisabled();
  await research.getByRole("button", { name: "Refresh saved history", exact: true }).click();
  await research.getByRole("button", { name: /^Query discovery ·/ }).click();
  await expect(brief(page)).toContainText("discovery-fixture");
  expect(state.starts).toHaveLength(1);
  await research.getByRole("button", { name: "Retry same attempt", exact: true }).click();
  await expect(research.getByRole("button", { name: "Retry same attempt", exact: true })).toHaveCount(0);
  expect(state.starts).toHaveLength(2);
  expect(state.starts[1]).toEqual(state.starts[0]);
  expect(state.mutations).toEqual([]);
});

test("website selection aborts late saved reads and clears the previous research selection and drafts", async ({ page }) => {
  let release!: () => void;
  const delayDiscovery = new Promise<void>(resolve => { release = resolve; });
  const state = await fixture(page, { saved: true, delayDiscovery });
  await page.goto("/websites?site=research-target&research=discovery-fixture");
  await expect.poll(() => state.reads.includes("discovery-fixture")).toBe(true);
  await page.getByLabel("Selected website", { exact: true }).selectOption("research-other");
  await expect(panel(page)).toContainText("Target: https://other.example.com/");
  await expect(page).not.toHaveURL(/research=/);
  release();
  await expect(brief(page)).toHaveCount(0);
  await expect(panel(page).getByLabel("Suggested query 1", { exact: true })).toHaveCount(0);
  await expect(panel(page)).not.toContainText("Illustrative target documentation software");
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
});

test("saved unresolved creation survives refresh without replacement spending or automatic provider retrieval", async ({ page }) => {
  const state = await fixture(page);
  state.runs = [{ ...discovery(), status: "requires_action", sessionId: null, answer: null, error: "Creation outcome unknown; provider cost may exist." }];
  await page.goto("/websites?site=research-target");
  await panel(page).getByRole("button", { name: "Open unresolved attempt", exact: true }).click();
  await expect(brief(page)).toContainText("Creation outcome unknown");
  await expect(brief(page)).toContainText("Unknown charges");
  await expect(panel(page).getByRole("button", { name: "Generate suggested queries (paid)", exact: true })).toBeDisabled();
  await expect(brief(page).getByRole("button", { name: "Retrieve saved provider progress", exact: true })).toBeDisabled();
  const readsBeforeReload = state.reads.length;
  expect(readsBeforeReload).toBeGreaterThan(0);
  await page.reload();
  await expect(brief(page)).toContainText("No saved provider session is available");
  await expect(panel(page).getByRole("button", { name: "Generate suggested queries (paid)", exact: true })).toBeDisabled();
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
  expect(state.reads.length).toBeGreaterThan(readsBeforeReload);
  expect(state.reads.every(id => id === "discovery-fixture")).toBe(true);
});

test("leaving an owner clears pending research before a different owner reopens the website", async ({ page }) => {
  let release!: () => void;
  const delayDiscovery = new Promise<void>(resolve => { release = resolve; });
  const state = await fixture(page, { saved: true, delayDiscovery });
  await page.goto("/websites?site=research-target&research=discovery-fixture");
  await expect.poll(() => state.reads.includes("discovery-fixture")).toBe(true);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("link", { name: "Sign in with Better Auth" })).toBeVisible();
  state.owner = "research-owner-b"; state.runs = [];
  release();
  await page.goto("/websites");
  await expect(panel(page)).toContainText("No saved research yet.");
  await expect(brief(page)).toHaveCount(0);
  await expect(panel(page).getByLabel("Suggested query 1", { exact: true })).toHaveCount(0);
  expect(state.starts).toEqual([]); expect(state.mutations).toEqual([]);
});
