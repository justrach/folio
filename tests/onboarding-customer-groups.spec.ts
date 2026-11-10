import { expect, test, type Page } from "@playwright/test";

const groups = ["small design teams", "freelance designers", "design agencies", "in-house product teams"];
const multilineGroup = "  small design teams\n\tcomparing prototype feedback\nacross distributed projects\nwith  detailed requirements\nfor international customers\nincluding 日本の購入者\nand sharing client decisions  ";
const normalized = (value: string) => value.trim().replace(/\s+/g, " ");
const at = "2026-09-13T08:00:00.000Z";

type Saved = { audience: string; customerGroups?: string[]; task: string; suiteId: string | null };
async function fixture(page: Page, holdAlice = false) {
  const state = {
    owner: "alice" as string | null,
    saved: { alice: { audience: groups[0], task: "collect feedback on prototypes", suiteId: null }, bob: { audience: "Bob buyers", customerGroups: ["Bob buyers"], task: "compare products", suiteId: null } } as Record<string, Saved>,
    writes: [] as Record<string, unknown>[], questions: [] as string[], forbidden: [] as string[], errors: [] as string[],
    aliceRead: false, releaseAlice: () => {},
  };
  const gate = new Promise<void>(resolve => { state.releaseAlice = resolve; });
  page.on("pageerror", error => state.errors.push(error.message));
  const summary = (owner: string) => ({ state: { siteId: `${owner}-site`, ...state.saved[owner], competitorsSavedAt: null, baselineRequestedAt: null }, site: { id: `${owner}-site`, url: `https://${owner}.example.test/`, name: "Fictional business" }, check: null, suite: state.saved[owner].suiteId ? { id: state.saved[owner].suiteId, cases: state.questions.map((query, i) => ({ id: `question-${i}`, query })) } : null, competitors: [] });
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname, owner = state.owner;
    if (path === "/api/analytics/config" && request.method() === "GET") return route.fulfill({ json: { enabled: false } });
    if (path === "/api/auth/get-session") return route.fulfill({ json: owner ? { user: { id: owner, name: "Fixture account", email: `${owner}@example.test`, emailVerified: true, createdAt: at, updatedAt: at }, session: { id: `${owner}-session`, userId: owner, expiresAt: "2099-01-01T00:00:00Z", createdAt: at, updatedAt: at } } : null });
    if (path === "/api/search-console" || path === "/api/github") return route.fulfill({ json: { configured: false, connected: false } });
    if (path === "/api/onboarding" && owner) {
      if (request.method() === "GET") {
        const data = summary(owner);
        if (holdAlice && owner === "alice") { state.aliceRead = true; await gate; }
        return route.fulfill({ json: data }).catch(() => {});
      }
      if (request.method() === "PUT") {
        const body = request.postDataJSON(); state.writes.push(body);
        if (body.customerGroups) { state.saved[owner].customerGroups = body.customerGroups; state.saved[owner].audience = body.customerGroups[0]; }
        if (body.task) state.saved[owner].task = body.task;
        if (body.suiteId) state.saved[owner].suiteId = body.suiteId;
        return route.fulfill({ json: summary(owner) });
      }
    }
    if (path === "/api/benchmarks" && request.method() === "POST") {
      const body = request.postDataJSON();
      const questions = body.questions as string[];
      if (new Set(questions.map(question => normalized(question).toLowerCase())).size !== questions.length)
        return route.fulfill({ status: 400, json: { error: "Remove duplicate questions." } });
      state.questions = questions;
      return route.fulfill({ json: { suite: { id: "fixture-suite", cases: state.questions.map((query, i) => ({ id: `question-${i}`, query })) } } });
    }
    state.forbidden.push(`${request.method()} ${path}`);
    return route.fulfill({ status: 409, json: { error: "No other operations are permitted in this fixture." } });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://www.googleapis.com/**"])
    await page.route(pattern, route => { state.forbidden.push("provider request"); return route.abort("blockedbyclient"); });
  return state;
}

const input = (page: Page, number: number) => page.getByRole("textbox", { name: `Customer group ${number}`, exact: true });
async function expectFittedTextarea(page: Page, number: number) {
  const field = input(page, number);
  expect(await field.evaluate(element => element.tagName)).toBe("TEXTAREA");
  expect(await field.getAttribute("maxlength")).toBeNull();
  await expect.poll(() => field.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
}
const add = (page: Page) => page.getByRole("button", { name: "+ Add more", exact: true });
async function open(page: Page) {
  await page.goto("/start?step=4");
  await expect(page.getByRole("group", { name: "Customer group(s)", exact: true })).toBeVisible();
}
async function noWorkOrOverflow(page: Page, state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.forbidden).toEqual([]); expect(state.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function refreshSession(page: Page) {
  // The same storage event Better Auth listens for when another tab changes accounts.
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "better-auth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "account-change" } }) })));
}

test("compact customer textareas stop at four, use red crosses, and restore adding after removal", async ({ page }, info) => {
  const state = await fixture(page); await open(page);
  await expect(input(page, 1)).toHaveValue(groups[0]);
  await expectFittedTextarea(page, 1);
  await expect(page.getByRole("button", { name: /Remove customer group/ })).toHaveCount(0);
  await expect(page.getByText("Customer group 1", { exact: true })).toHaveCount(0);
  await add(page).focus(); await page.keyboard.press("Enter");
  await expect(input(page, 2)).toBeFocused(); await input(page, 2).fill(groups[1]);
  await page.screenshot({ path: info.outputPath("actual-compact.png"), fullPage: true, animations: "disabled" });
  const addColor = await add(page).evaluate(element => getComputedStyle(element).color);
  for (let i = 3; i <= 4; i++) { await add(page).click(); await expect(input(page, i)).toBeFocused(); await input(page, i).fill(groups[i - 1]); }
  await expect(add(page)).toHaveCount(0);
  const status = page.getByRole("status").filter({ hasText: "Max customer groups added." });
  await expect(status).toHaveText("Max customer groups added.");
  expect(await status.evaluate(element => getComputedStyle(element).color)).toBe(addColor);
  expect(await page.locator(".ob-group-list").evaluate(element => getComputedStyle(element).rowGap)).toBe("8px");
  expect(await page.getByRole("button", { name: "Remove customer group 2", exact: true }).innerText()).toBe("");
  await page.getByRole("heading", { level: 1 }).focus();
  await page.screenshot({ path: info.outputPath("actual-limit.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Remove customer group 2", exact: true }).click();
  await expect(input(page, 2)).toBeFocused();
  await expect(input(page, 2)).toHaveValue(groups[2]); await expect(input(page, 3)).toHaveValue(groups[3]);
  await expect(status).toHaveCount(0); await expect(add(page)).toBeVisible();
  expect(state.writes).toEqual([]); await noWorkOrOverflow(page, state);
});

test("all four groups survive saving, revisiting, refresh, and bounded question drafting", async ({ page }) => {
  const state = await fixture(page); await open(page);
  const savedGroups = [multilineGroup, ...groups.slice(1)];
  const initialHeight = await input(page, 1).evaluate(element => element.clientHeight);
  await input(page, 1).fill(multilineGroup);
  await expectFittedTextarea(page, 1);
  expect(await input(page, 1).evaluate(element => element.clientHeight)).toBeGreaterThan(initialHeight);
  for (let i = 2; i <= 4; i++) { await add(page).click(); await input(page, i).fill(groups[i - 1]); }
  await expect(page.locator(".ob-note").first()).toContainText("across all 4 customer groups");
  await page.getByRole("button", { name: "Draft my questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick the questions your buyers ask." })).toBeVisible();
  expect(state.writes).toEqual([{ customerGroups: savedGroups, task: "collect feedback on prototypes" }]);
  const selected = await page.getByRole("checkbox").evaluateAll(elements => elements.filter(element => (element as HTMLInputElement).checked).map(element => element.closest("label")!.textContent!));
  expect(selected).toHaveLength(5);
  for (const group of savedGroups) expect(selected.some(question => question.includes(normalized(group)))).toBe(true);
  await page.getByRole("button", { name: "Save 5 questions", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Who do you want to watch?" })).toBeVisible();
  expect(state.questions).toHaveLength(5);
  for (const group of savedGroups) expect(state.questions.some(question => question.includes(normalized(group)))).toBe(true);
  await page.goto("/start?step=4");
  for (let i = 1; i <= 4; i++) await expect(input(page, i)).toHaveValue(savedGroups[i - 1]);
  await expectFittedTextarea(page, 1);
  await page.reload();
  for (let i = 1; i <= 4; i++) await expect(input(page, i)).toHaveValue(savedGroups[i - 1]);
  await expectFittedTextarea(page, 1);
  await expect(add(page)).toHaveCount(0);
  await noWorkOrOverflow(page, state);
});

test("unused blank rows do not block saving but at least one group is required", async ({ page }) => {
  const state = await fixture(page); state.saved.alice.audience = ""; await open(page);
  await expect(page.getByRole("button", { name: "Draft my questions", exact: true })).toBeDisabled();
  await input(page, 1).fill(" \t\n ");
  await add(page).click(); await input(page, 2).fill("  sole customer group  "); await add(page).click();
  await input(page, 3).fill("\n\t");
  await page.getByRole("button", { name: "Draft my questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick the questions your buyers ask." })).toBeVisible();
  expect(state.writes[0]).toEqual({ customerGroups: ["  sole customer group  "], task: "collect feedback on prototypes" });
  await open(page); await expect(input(page, 1)).toHaveValue("  sole customer group  ");
  await expect(input(page, 2)).toHaveCount(0); await noWorkOrOverflow(page, state);
});

test("normalized duplicate groups preserve raw rows but save five distinct questions", async ({ page }) => {
  const state = await fixture(page); await open(page);
  const duplicates = ["  small\n design teams  ", "SMALL\tDESIGN TEAMS", "freelance designers", " Freelance   DESIGNERS "];
  await input(page, 1).fill(duplicates[0]);
  for (let i = 2; i <= 4; i++) { await add(page).click(); await input(page, i).fill(duplicates[i - 1]); }
  await page.getByRole("button", { name: "Draft my questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pick the questions your buyers ask." })).toBeVisible();
  expect(state.writes[0]).toEqual({ customerGroups: duplicates, task: "collect feedback on prototypes" });
  await expect(page.getByRole("checkbox")).toHaveCount(10);
  const labels = await page.getByRole("checkbox").evaluateAll(elements => elements.map(element => element.closest("label")!.textContent!));
  expect(new Set(labels.map(label => normalized(label).toLowerCase())).size).toBe(10);
  await page.getByRole("button", { name: "Save 5 questions", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Who do you want to watch?" })).toBeVisible();
  expect(state.questions).toHaveLength(5);
  expect(new Set(state.questions.map(question => normalized(question).toLowerCase())).size).toBe(5);
  await open(page);
  for (let i = 1; i <= 4; i++) await expect(input(page, i)).toHaveValue(duplicates[i - 1]);
  await noWorkOrOverflow(page, state);
});

test("owner changes abort old reads and clear private groups on logout", async ({ page }) => {
  const state = await fixture(page, true);
  await page.goto("/start?step=4"); await expect.poll(() => state.aliceRead).toBe(true);
  state.owner = "bob"; await refreshSession(page);
  await expect(input(page, 1)).toHaveValue("Bob buyers");
  await input(page, 1).fill("Bob unsaved private group");
  state.releaseAlice(); await expect(input(page, 1)).toHaveValue("Bob unsaved private group");
  await expect(page.locator("body")).not.toContainText(groups[0]);
  state.owner = null; await refreshSession(page);
  await expect(page.getByRole("heading", { name: "Start with your website." })).toBeVisible();
  await expect(page.getByRole("group", { name: "Customer group(s)", exact: true })).toHaveCount(0);
  const stored = await page.evaluate(() => sessionStorage.getItem("folio-onboarding-v1"));
  expect(stored).not.toContain("Bob unsaved private group"); expect(stored).not.toContain(groups[0]);
  expect(state.writes).toEqual([]); await noWorkOrOverflow(page, state);
});
