import { expect, test, type Page } from "@playwright/test";
import { evaluationSummary, type EvaluationRun } from "../src/lib/evals";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";

async function privateRun(page: Page, run: EvaluationRun, rejectDeletion = false) {
  let deleted = false;
  const deletions: unknown[] = [];
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: {
    user: { id: "gui-deletion-owner", email: "deletion@example.test", name: "Evidence owner", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    session: { id: "gui-deletion-session", userId: "gui-deletion-owner", token: "non-secret-fixture", expiresAt: "2099-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  } }));
  await page.route("**/api/scans", route => route.fulfill({ json: { scans: [] } }));
  await page.route("**/api/seo-reports", route => route.fulfill({ json: { reports: [] } }));
  await page.route("**/api/agents/status", route => route.fulfill({ json: { configured: false } }));
  await page.route("**/api/evaluations**", async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "DELETE") {
      deletions.push(request.postDataJSON());
      if (rejectDeletion) return route.fulfill({ status: 409, json: { error: "This evaluation changed. Refresh it before deleting its evidence." } });
      deleted = true;
      return route.fulfill({ json: { deletion: { id: run.id, scope: "folio-saved-evidence", remoteSessionDeleted: false } } });
    }
    if (pathname === "/api/evaluations") return route.fulfill({ json: {
      runs: deleted ? [] : [evaluationSummary(run)],
      connection: { configured: false, canRun: false, message: "Local UI fixture; no provider requests.", allowedTargets: ["example.com"] },
    } });
    return route.fulfill(deleted ? { status: 404, json: { error: "Evaluation not found." } } : { json: { run } });
  });
  await page.goto(`/evaluations?run=${encodeURIComponent(run.id)}`);
  await expect(page.locator(".eval-report")).toBeVisible();
  await page.locator(".eval-more-actions > summary").click();
  return deletions;
}

test("private evidence deletion requires confirmation and removes the saved report", async ({ page }) => {
  const run = { ...await createDemoEvaluationRun(), id: "saved-deletion-fixture", revision: 3 };
  const deletions = await privateRun(page, run);
  const trigger = page.getByRole("button", { name: "Delete saved evidence", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete saved evidence?" });
  await expect(dialog).toContainText("OpenAI may still retain evidence submitted to its session");
  await expect(dialog).toContainText("minimal run record for usage limits");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(deletions).toEqual([]);
  await trigger.click();
  await dialog.getByRole("button", { name: "Keep evidence", exact: true }).click();
  expect(deletions).toEqual([]);
  await trigger.click();
  await dialog.getByRole("button", { name: "Delete from Folio", exact: true }).click();
  await expect(page.locator(".eval-report")).toHaveCount(0);
  expect(deletions).toEqual([{ revision: 3 }]);
});

test("a stale deletion conflict preserves the report and shows the recoverable error", async ({ page }) => {
  const deletions = await privateRun(page, { ...await createDemoEvaluationRun(), id: "saved-deletion-conflict" }, true);
  await page.getByRole("button", { name: "Delete saved evidence", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete saved evidence?" });
  await dialog.getByRole("button", { name: "Delete from Folio", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Refresh it before deleting its evidence");
  await dialog.getByRole("button", { name: "Keep evidence", exact: true }).click();
  await expect(page.locator(".eval-report")).toBeVisible();
  expect(deletions).toHaveLength(1);
});

test("an action-required session cannot delete the evidence needed to finish or cancel", async ({ page }) => {
  const deletions = await privateRun(page, {
    ...await createDemoEvaluationRun(), id: "saved-deletion-active", mode: "live", status: "requires_action",
  });
  await expect(page.getByRole("button", { name: "Delete saved evidence", exact: true })).toBeDisabled();
  expect(deletions).toEqual([]);
});
