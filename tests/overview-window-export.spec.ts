import { expect, test, type Page } from "@playwright/test";
import { overviewFixture } from "./fixtures/overview-preview-fixture";

// ILLUSTRATIVE BROWSER FIXTURE: every API is intercepted; no account, provider or D1 data is read.
const base = Date.parse("2026-11-06T08:00:00.000Z");
const fixture = overviewFixture(base);

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(base));
  await page.route("**/api/**", route => { const req = route.request(); const result = fixture.respond(req.method(), new URL(req.url()).pathname); return route.fulfill({ status: result.status, json: result.json }); });
  await page.goto("/overview?view=workspace&website=site-example");
  await expect(page.getByRole("region", { name: "Date window and export" })).toBeVisible();
}
const bar = (page: Page) => page.getByRole("region", { name: "Date window and export" });

test("date window narrows the question list, activity and audits with a transparent scope", async ({ page }) => {
  await open(page);
  await expect(bar(page).getByRole("status")).toContainText("All loaded history: 5 questions with an attempt, 20 saved attempts, 4 audits");
  await bar(page).getByRole("button", { name: "All loaded history" }).click();
  await page.getByRole("dialog", { name: "Choose date window" }).getByRole("button", { name: "Last 7 days" }).click();
  await expect(bar(page).getByRole("status")).toContainText("4 questions with an attempt, 4 saved attempts, 1 audit");
  await expect(page.getByLabel("Search observations by question").locator("article")).toHaveCount(4);
  const readiness = page.getByRole("article", { name: "Technical readiness" });
  await expect(readiness.locator(".ovc-total strong")).toHaveText("69/100");
  await expect(readiness).toContainText("Run another audit to see a trend.");
  await expect(readiness).not.toContainText("vs previous audit");
  await bar(page).getByRole("button", { name: /Oct 31/ }).click();
  const dialog = page.getByRole("dialog", { name: "Choose date window" });
  await dialog.getByLabel("From").fill("2026-06-01");
  await dialog.getByLabel("To").fill("2026-06-30");
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/No loaded question has a saved attempt in Jun 1 – Jun 30/)).toBeVisible();
  await expect(readiness).toContainText("No technical audit for this exact URL in Jun 1 – Jun 30.");
});

test("activity chart inspects real days by keyboard and pointer", async ({ page }) => {
  await open(page);
  const plot = bar(page).getByRole("slider", { name: "Saved attempts per day" });
  await plot.focus();
  await page.keyboard.press("End");
  await expect(plot).toHaveAttribute("aria-valuetext", /Nov 6, 2026: 1 attempts, 0 completed/);
  await page.keyboard.press("ArrowLeft");
  await expect(bar(page)).toContainText("1 completed · 0 other");
  await page.keyboard.press("Home");
  await expect(plot).toHaveAttribute("aria-valuenow", "1");
});

test("export menu generates scoped CSV files in the browser with real sizes", async ({ page }) => {
  await open(page);
  await bar(page).getByRole("button", { name: "Export" }).click();
  const menu = page.getByRole("dialog", { name: "Export CSV" });
  await expect(menu).toContainText("folio-example-fixture.dev-questions-all-loaded_2026-11-06.csv");
  await expect(menu).toContainText(/Questions shown · 6 rows · \d+(\.\d)? (B|KB)/);
  const download = page.waitForEvent("download");
  await menu.getByRole("button", { name: /Download folio-example-fixture.dev-audits/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("folio-example-fixture.dev-audits-all-loaded_2026-11-06.csv");
  const text = await (await file.createReadStream()).toArray().then(chunks => Buffer.concat(chunks).toString("utf8"));
  expect(text.split("\r\n")[0]).toBe("recorded_utc,url,readiness_score");
  expect(text.trim().split("\r\n")).toHaveLength(5);
  await expect(menu).toContainText("Downloaded");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(bar(page).getByRole("button", { name: "Export" })).toBeFocused();
});
