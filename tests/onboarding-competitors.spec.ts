import { expect, test, type Page } from "@playwright/test";

const at = "2026-09-13T08:00:00.000Z";
type Selection = { name: string; aliases: string[]; source?: string };

async function fixture(page: Page, indexed = false) {
  const state = { saved: [] as Selection[], saves: [] as Selection[][], forbidden: [] as string[], errors: [] as string[] };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    if (path === "/api/auth/get-session") return route.fulfill({ json: {
      user: { id: "alice", name: "Fixture owner", email: "alice@example.test", emailVerified: true, createdAt: at, updatedAt: at },
      session: { id: "fixture-session", userId: "alice", token: "non-secret-browser-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at },
    } });
    if (path === "/api/search-console" || path === "/api/github") return route.fulfill({ json: { configured: false, connected: false } });
    if (path === "/api/onboarding" && method === "GET") return route.fulfill({ json: {
      state: { siteId: "alice-site", audience: "Small teams", task: "manage projects", suiteId: "fixture-suite", competitorsSavedAt: state.saves.length ? at : null, baselineRequestedAt: null, completedAt: null },
      site: { id: "alice-site", url: "https://alice.example.test/", name: "Fixture website" },
      check: { id: "fixture-check", url: "https://alice.example.test/", host: "alice.example.test", createdAt: at, seoScore: 60, scoredChecks: 10, fixes: [],
        suggestion: { audience: "Small teams", task: "manage projects" }, competitors: { category: indexed ? "Fixture category" : null, questions: indexed ? 2 : 0, totalAnswers: indexed ? 4 : 0,
          rows: indexed ? [{ name: "Indexed company", domain: "indexed.example.test", aliases: [], aliasCounts: [], answers: 3, totalAnswers: 4, averagePosition: 1.5, isTarget: false, namedInQuestion: 0 }] : [] } },
      suite: { id: "fixture-suite", cases: [{ id: "fixture-case", query: "Which tools help a small team manage projects?" }] },
      competitors: state.saved,
    } });
    if (path === "/api/competitors" && method === "PUT") {
      const body = request.postDataJSON() as { siteId: string; competitors: Selection[] };
      expect(body.siteId).toBe("alice-site");
      state.saves.push(body.competitors);
      state.saved = body.competitors.map(({ name, aliases }) => ({ name, aliases }));
      return route.fulfill({ json: { competitors: state.saved } });
    }
    if (path === "/api/benchmarks" && method === "GET") return route.fulfill({ json: { access: { canRun: false, message: "Fixture only; no paid runs." } } });
    state.forbidden.push(`${method} ${path}`);
    return route.fulfill({ status: 409, json: { error: "No other API is available in this fixture." } });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(pattern, route => { state.forbidden.push("external provider request"); return route.abort("blockedbyclient"); });
  return state;
}

async function noProvenance(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Added by you|From the starter pack/);
  expect(await page.locator("main").ariaSnapshot()).not.toMatch(/Added by you|From the starter pack/);
}

async function noWorkOrOverflow(page: Page, state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.forbidden).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test("manually added competitors have no provenance label before saving or on revisits", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto("/start?step=6");
  await expect(page.getByRole("heading", { name: "Who do you want to watch?" })).toBeVisible();
  await page.getByLabel("Company name", { exact: true }).fill("Manual company");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const manual = page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: "Track Manual company", exact: true }) });
  await expect(manual).toContainText("Manual company");
  await expect(manual.locator("small")).toHaveCount(0);
  await noProvenance(page);
  await page.getByRole("button", { name: "Add another", exact: true }).click();
  await page.getByLabel("Company name", { exact: true }).fill("Alias company");
  await page.getByRole("textbox", { name: /^Other names \(optional\)/ }).fill("alias.example.test");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Also matches alias.example.test", { exact: true })).toBeVisible();
  await noProvenance(page);
  await page.getByRole("button", { name: "Track these 2", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask AI your 1 question now." })).toBeVisible();
  expect(state.saves[0]).toEqual([
    { name: "Manual company", aliases: [], source: "manual" },
    { name: "Alias company", aliases: ["alias.example.test"], source: "manual" },
  ]);
  // Desktop offers step navigation; mobile revisits via the saved step URL.
  if (info.project.name === "desktop") await page.getByRole("button", { name: "Back to Competitors", exact: true }).click();
  else await page.goto("/start?step=6");
  await expect(page.getByRole("checkbox", { name: "Track Manual company", exact: true })).toBeChecked();
  await noProvenance(page);
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Track Manual company", exact: true })).toBeChecked();
  await expect(page.getByText("Also matches alias.example.test", { exact: true })).toBeVisible();
  await noProvenance(page);
  await page.getByRole("checkbox", { name: "Track Alias company", exact: true }).uncheck();
  await page.getByRole("button", { name: "Track 1 competitor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask AI your 1 question now." })).toBeVisible();
  expect(state.saves[1]).toEqual([{ name: "Manual company", aliases: [] }]);
  await noWorkOrOverflow(page, state);
});

test("indexed counts remain visible without provenance labels and resuming does not submit a fabricated manual source", async ({ page }) => {
  const state = await fixture(page, true);
  await page.goto("/start?step=6");
  await expect(page.getByRole("heading", { name: "Here is who AI already recommends." })).toBeVisible();
  await expect(page.getByText("3 of 4 answers", { exact: true })).toBeVisible();
  await expect(page.getByText("1.5", { exact: true })).toBeVisible();
  await noProvenance(page);
  await page.getByRole("button", { name: "Track 1 competitor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask AI your 1 question now." })).toBeVisible();
  expect(state.saves[0]).toEqual([{ name: "Indexed company", aliases: [], source: "public-index" }]);
  await page.goto("/start?step=6");
  await expect(page.getByRole("checkbox", { name: "Track Indexed company", exact: true })).toBeChecked();
  await noProvenance(page);
  await page.getByRole("button", { name: "Track 1 competitor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ask AI your 1 question now." })).toBeVisible();
  expect(state.saves[1]).toEqual([{ name: "Indexed company", aliases: [] }]);
  await noWorkOrOverflow(page, state);
});
