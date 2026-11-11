import { expect, test, type Page } from "@playwright/test";
import type { WebsiteChange } from "../src/lib/website-change-outcome";

const at = "2026-11-10T09:00:00.000Z";
const answer = (runId: string, targetNamed: "yes" | "no", position: number | null, targetCited = false) => ({ runId, observedAt: at, targetNamed, targetCited, position });
const website = { id: "site-fixture", url: "https://example.com/", name: "Example" };
const base = { website, recordedBy: { keyId: "key-fixture", keyName: "Repository agent" }, referenceUrl: null, createdAt: at, updatedAt: at, caveat: "Illustrative fixture." };
const proposed: WebsiteChange = { ...base, id: "change-proposed", title: "Answer the pricing question on the pricing page", summary: "Added a plan table and a short answer about the free plan.", status: "proposed",
  files: ["content/pricing.md"], publication: null, nextStep: "Fixture",
  questions: [{ caseId: "case-pricing", query: "Which project tools have useful free plans?", state: "awaiting_publication", baseline: answer("run-a", "no", null), retest: null, movement: null, reasons: [] }],
  outcome: { targeted: 1, retested: 0, improved: 0, declined: 0, unchanged: 0, unknown: 0, awaitingRetest: 0, unmeasured: 0 } };
const published: WebsiteChange = { ...base, id: "change-published", title: "Add a migration guide", summary: "New guide linked from the homepage.", status: "published", files: [],
  publication: { at, reportedBy: "owner", provenance: "Reported by the caller; Folio did not verify that the website changed." }, nextStep: "Fixture",
  questions: [
    { caseId: "case-migrate", query: "Which work tools offer migration help?", state: "retested", baseline: answer("run-b", "no", null), retest: answer("run-c", "yes", 2, true), movement: "newly_named", reasons: [] },
    { caseId: "case-setup", query: "Which tools have clear setup instructions?", state: "incompatible_retest", baseline: answer("run-d", "yes", 3), retest: answer("run-e", "yes", 1), movement: null, reasons: ["The model changed."] },
  ],
  outcome: { targeted: 2, retested: 1, improved: 1, declined: 0, unchanged: 0, unknown: 0, awaitingRetest: 0, unmeasured: 1 } };

// Illustrative activity rows, not real index results.
const asks = [
  { id: "ask-site", tool: "website", question: null, domain: "example.com", queryId: null, resultCount: 3, summary: "example.com is named in 3 of 291 published answers and cited in 2.", keyName: "Repository agent", createdAt: at },
  { id: "ask-answer", tool: "answer", question: null, domain: null, queryId: "fixture-question", resultCount: 4, summary: "Read the answer to “Which work tools offer migration help?”: 4 recommendations.", keyName: "Repository agent", createdAt: at },
  { id: "ask-search", tool: "search", question: "migration help", domain: null, queryId: null, resultCount: 0, summary: "0 published answers matched “migration help”.", keyName: null, createdAt: at },
];

async function fixture(page: Page, signedIn = true) {
  const state = { writes: [] as { path: string; body: string }[], changes: [proposed, published], asks };
  await page.route("**/api/**", route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/auth/get-session") return route.fulfill({ json: signedIn ? {
      user: { id: "PRIVATE_CHANGE_OWNER", name: "Change reviewer", email: "changes@example.test", emailVerified: true },
      session: { id: "fixture-session", userId: "PRIVATE_CHANGE_OWNER", expiresAt: "2099-01-01T00:00:00Z" } } : null });
    if (request.method() !== "GET") {
      state.writes.push({ path, body: request.postData() ?? "" });
      if (path !== "/api/changes/change-proposed") return route.fulfill({ status: 409, json: { error: { code: "conflict", message: "Fixture forbids new work" } } });
      const saved: WebsiteChange = { ...proposed, status: "published", publication: published.publication, questions: [{ ...proposed.questions[0], state: "awaiting_retest" }], outcome: { ...proposed.outcome, awaitingRetest: 1 } };
      state.changes = [saved, published];
      return route.fulfill({ json: { change: saved } });
    }
    if (path === "/api/changes") return route.fulfill({ json: { items: state.changes, nextCursor: null, truncated: false, ordering: "fixture" } });
    if (path === "/api/index-asks") return route.fulfill({ json: { items: state.asks, truncated: false } });
    if (path === "/api/benchmarks/runs") return route.fulfill({ json: { runs: [] } });
    if (path === "/api/sites") return route.fulfill({ json: { sites: [] } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    return route.fulfill({ status: 404, json: { error: "Unavailable in this fixture" } });
  });
  return state;
}
const panel = (page: Page) => page.getByRole("region", { name: "Website changes from your agent", exact: true });

test("recorded changes show each answer before and after, and confirming publication saves only the owner's statement", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/agents");
  const changes = panel(page);
  const matched = changes.getByRole("article", { name: "Add a migration guide", exact: true });
  await expect(matched).toContainText("Live since");
  await expect(matched).toContainText("Not named, not cited");
  await expect(matched).toContainText("Named at position 2, cited");
  await expect(matched).toContainText("Now named");
  // A retest with different settings shows its reason instead of a result.
  await expect(matched).toContainText("Retest used different settings");
  await expect(matched).toContainText("The model changed.");
  await expect(matched).toContainText("1 of 2 questions answered again: 1 improved, 0 declined, 0 unchanged.");
  await expect(changes).toContainText("not proof that a change caused a difference");
  await expect(changes).not.toContainText("PRIVATE_CHANGE_OWNER");

  const waiting = changes.getByRole("article", { name: proposed.title, exact: true });
  await expect(waiting).toContainText("Not live yet");
  await expect(waiting).toContainText("Folio does not deploy or check your website");
  expect(state.writes).toEqual([]);
  await waiting.getByRole("button", { name: /^Confirm it’s live/ }).click();
  await expect(waiting).toContainText("Live since");
  await expect(waiting).toContainText("1 question still needs a new answer");
  await expect(waiting.getByRole("link", { name: "Open its questions" })).toHaveAttribute("href", "/benchmarks?website=site-fixture");
  await expect(changes.getByRole("status")).toContainText("Marked as live");
  expect(state.writes).toEqual([{ path: "/api/changes/change-proposed", body: JSON.stringify({ status: "published" }) }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("index questions from keyed agents are listed with their key and a link to the published answer, without starting work", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/agents");
  const activity = page.getByRole("region", { name: "What your agents asked the index", exact: true });
  const rows = activity.getByRole("list", { name: "Recent index questions" }).getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("example.com is named in 3 of 291 published answers");
  await expect(rows.nth(0)).toContainText("Looked up a website");
  await expect(rows.nth(0)).toContainText("Key “Repository agent”");
  await expect(rows.nth(1).getByRole("link", { name: "Open this answer" })).toHaveAttribute("href", "/overview?query=fixture-question");
  await expect(rows.nth(2).getByRole("link")).toHaveCount(0);
  await expect(activity).toContainText("not search rankings");
  expect(state.writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  state.asks.length = 0;
  await activity.getByRole("button", { name: "Refresh index activity" }).click();
  await expect(activity).toContainText("Agents using the no-key endpoint are not recorded.");
  await expect(activity.getByRole("link", { name: "Connect your agent" })).toHaveAttribute("href", "/docs/api#api-mcp");
  expect(state.writes).toEqual([]);
});

test("recorded changes are not requested or shown without a signed-in owner", async ({ page }) => {
  const state = await fixture(page, false);
  let reads = 0;
  page.on("request", request => { if (["/api/changes", "/api/index-asks"].includes(new URL(request.url()).pathname)) reads++; });
  await page.goto("/agents");
  await expect(page.getByRole("heading", { name: "Your agents" }).first()).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What your agents asked the index", exact: true })).toHaveCount(0);
  expect(reads).toBe(0); expect(state.writes).toEqual([]);
});
