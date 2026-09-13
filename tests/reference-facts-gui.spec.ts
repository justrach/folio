import { expect, test, type Page } from "@playwright/test";
import { EVAL_SUITE, evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

const access = { configured: true, canRun: true, authorized: true, model: "gpt-6-astra", allowedTargets: ["example.com"], message: "GUI fixture: managed evaluations enabled." };

async function account(page: Page) {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: {
    user: { id: "reference-gui-owner", name: "Reference reviewer", email: "reference@example.test", emailVerified: true },
    session: { id: "reference-session", userId: "reference-gui-owner", expiresAt: "2099-01-01T00:00:00Z" },
  } }));
  await page.route("**/api/scans", (route) => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/agents/status", (route) => route.fulfill({ json: access }));
  await page.route("**/api/seo-reports", (route) => route.fulfill({ json: { reports: [
    { id: "matching-report", domain: "example.com", state: "complete", status: "partial", createdAt: "2026-09-13T00:00:00Z", publication: "private" },
    { id: "other-report", domain: "other.example", state: "complete", status: "complete", createdAt: "2026-09-13T00:00:00Z", publication: "private" },
    { id: "pending-report", domain: "example.com", state: "pending", status: "unconfirmed", createdAt: "2026-09-13T00:00:00Z", publication: "private" },
    { id: "www-report", domain: "www.example.com", state: "complete", status: "complete", createdAt: "2026-09-13T00:00:00Z", publication: "private" },
  ] } }));
}

async function liveFixture(): Promise<EvaluationRun> {
  const run = await createDemoEvaluationRun();
  return { ...run, id: "reference-run-1", mode: "live", siteName: "example.com", targetUrl: "https://example.com/", sessionId: "sess_reference_fixture", model: "gpt-6-astra", expectedFacts: { ...run.expectedFacts!, source: "owner-confirmed" }, captures: run.captures.map((capture) => ({ ...capture, url: "https://example.com/", transport: "http" })) };
}

test("reference answers require confirmation, stay explicit, and are omitted from rerun overrides", async ({ page }) => {
  await account(page);
  const fixture = await liveFixture();
  let saved: EvaluationRun | null = null;
  const created: Record<string, unknown>[] = [];
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/evaluations" && route.request().method() === "GET")
      return route.fulfill({ json: { runs: saved ? [evaluationSummary(saved)] : [], connection: access, suite: EVAL_SUITE } });
    if (path === "/api/evaluations" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      created.push(body);
      saved = { ...fixture, id: `reference-run-${created.length}`, expectedFacts: body.rerunOf ? saved!.expectedFacts : { source: "owner-confirmed", ...body.expectedFacts } };
      return route.fulfill({ status: 201, json: { run: saved } });
    }
    return route.fulfill({ json: { run: saved } });
  });
  await page.goto("/evaluations");
  const launch = page.getByRole("button", { name: "Run with Agents API", exact: true });
  await expect(launch).toBeEnabled();
  await page.getByText("Optional reference answers", { exact: true }).click();
  await page.getByLabel("Expected product name", { exact: true }).fill("Sable Analytics");
  await expect(launch).toBeDisabled();
  await page.getByRole("combobox", { name: "Pricing reference", exact: true }).selectOption("stated");
  await page.getByLabel("Expected amount", { exact: true }).fill("29");
  await page.getByLabel("Currency code", { exact: true }).fill("usd");
  await page.getByRole("combobox", { name: "Billing interval", exact: true }).selectOption("month");
  const confirmation = page.getByLabel("I reviewed these reference answers for this website.", { exact: true });
  await confirmation.check();
  await expect(launch).toBeEnabled();
  await page.getByLabel("Website to evaluate", { exact: true }).fill("https://example.com/");
  await expect(confirmation).not.toBeChecked();
  await expect(launch).toBeDisabled();
  await confirmation.check();
  const seo = page.getByLabel("Saved SEO evidence Optional", { exact: true });
  await expect(seo.locator("option")).toHaveCount(2);
  await seo.selectOption("matching-report");
  expect(created).toHaveLength(0);
  await launch.click();
  await expect(page.locator(".eval-report")).toBeVisible();
  expect(created).toEqual([{ domain: "https://example.com/", mode: "managed", expectedFacts: { productName: "Sable Analytics", pricing: { amount: 29, currency: "USD", interval: "month" } }, confirmExpectedFacts: true, seoReportId: "matching-report" }]);
  await page.locator(".eval-reference-report summary").click();
  await expect(page.locator(".eval-reference-report")).toContainText("not independently established by Folio");
  await expect(page.locator(".eval-reference-report dd")).toHaveText(["Sable Analytics", "29 USD / month"]);
  await page.getByLabel("Expected product name", { exact: true }).fill("Changed draft answer");
  await expect(confirmation).not.toBeChecked();
  await page.getByRole("button", { name: "Replay frozen evidence", exact: true }).click();
  await expect.poll(() => created.length).toBe(2);
  expect(created[1]).toEqual({ domain: "https://example.com/", mode: "managed", rerunOf: "reference-run-1" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test("saved SEO tool evidence resumes only after the explicit action", async ({ page }) => {
  await account(page);
  const fixture = await liveFixture();
  let saved: EvaluationRun = {
    ...fixture, id: "tool-needs-action", status: "requires_action", result: null,
    captures: [...fixture.captures, { id: "seo-report-1", kind: "seo-report", transport: "http", url: "https://example.com/", capturedAt: fixture.createdAt, content: "{}", sha256: "a".repeat(64) }],
    events: [{ id: "provider-state", at: fixture.createdAt, type: "status", title: "Saved evidence requested", data: { savedSeoToolAvailable: true } }],
  };
  const toolRequests: unknown[] = [];
  await page.route(/\/api\/evaluations(?:\/[^?]*)?(?:\?.*)?$/, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/evaluations") return route.fulfill({ json: { runs: [evaluationSummary(saved)], connection: access, suite: EVAL_SUITE } });
    if (path.endsWith("/tools")) {
      toolRequests.push(route.request().postDataJSON());
      saved = { ...saved, status: "running", revision: saved.revision + 1, events: [...saved.events, { id: "saved-seo-tool-submitted", at: saved.createdAt, type: "tool", title: "Saved SEO evidence returned" }] };
    }
    return route.fulfill({ json: { run: saved } });
  });
  await page.goto("/evaluations?run=tool-needs-action");
  const returnEvidence = page.getByRole("button", { name: "Return saved SEO evidence", exact: true });
  await expect(returnEvidence).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel run", exact: true })).toBeEnabled();
  await expect(page.locator(".eval-tool-approval")).toContainText("can use OpenAI credits");
  await expect(page.locator(".eval-tool-approval")).toContainText("no new DataForSEO lookup");
  expect(toolRequests).toEqual([]);
  await returnEvidence.click();
  await expect(returnEvidence).toHaveCount(0);
  expect(toolRequests).toEqual([{}]);
});
