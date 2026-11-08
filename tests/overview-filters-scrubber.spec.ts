import { expect, test, type Page } from "@playwright/test";
import { overviewFixture } from "./fixtures/overview-preview-fixture";

// ILLUSTRATIVE BROWSER FIXTURE: every API is intercepted; no account, provider or D1 data is read.
const base = Date.parse("2026-11-06T08:00:00.000Z");
const fixture = overviewFixture(base);

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(base));
  await page.route("**/api/**", route => { const req = route.request(); const result = fixture.respond(req.method(), new URL(req.url()).pathname); return route.fulfill({ status: result.status, json: result.json }); });
  await page.goto("/overview?view=workspace&website=site-example");
  await expect(page.getByRole("search", { name: "Filter loaded questions" })).toBeVisible();
}
const list = (page: Page) => page.getByLabel("Search observations by question");
const status = (page: Page) => page.getByRole("search", { name: "Filter loaded questions" }).getByRole("status");

test("search tokens and outcome pills filter only the loaded questions and can be removed", async ({ page }) => {
  await open(page);
  await expect(status(page)).toContainText("Showing 6 of 6 loaded questions");
  await expect(status(page)).toContainText("loaded results only");
  await page.getByRole("searchbox").fill("code search");
  await expect(list(page).locator("article")).toHaveCount(1);
  await expect(list(page)).toContainText("Best code search for monorepos");
  await page.getByRole("button", { name: "Remove search “search”" }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("code");
  await page.getByRole("button", { name: /^Named your site/ }).click();
  await expect(page.getByRole("button", { name: /^Named your site/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Active filters")).toContainText("Named your site");
  await expect(list(page).locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: /^Needs review/ }).click();
  await expect(list(page).locator("article")).toHaveCount(2);
  await page.getByRole("searchbox").fill("zzz");
  await expect(page.getByText("No loaded questions match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(list(page).locator("article")).toHaveCount(6);
  await expect(page.getByLabel("Active filters")).toHaveCount(0);
});

test("cards and list views show the same questions and remember the choice", async ({ page }) => {
  await open(page);
  const titles = await list(page).locator("article h3").allTextContents();
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await expect(list(page)).toHaveAttribute("data-view", "cards");
  expect(await list(page).locator("article h3").allTextContents()).toEqual(titles);
  await page.reload();
  await expect(list(page)).toHaveAttribute("data-view", "cards");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(list(page)).toHaveAttribute("data-view", "list");
});

test("readiness scrubber follows keyboard and pointer across real audits only", async ({ page }) => {
  await open(page);
  const card = page.getByRole("article", { name: "Technical readiness" });
  const slider = card.getByRole("slider", { name: "Technical readiness audits" });
  await expect(slider).toHaveAttribute("aria-valuenow", "4");
  await expect(card.locator(".ovc-total strong")).toHaveText("69/100");
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuenow", "1");
  await expect(card.locator(".ovc-total strong")).toHaveText("61/100");
  await expect(card).not.toContainText("vs previous audit");
  await page.keyboard.press("ArrowRight");
  await expect(card).toContainText("▲ +5 vs previous audit");
  await page.keyboard.press("End");
  await expect(card.locator(".ovc-total strong")).toHaveText("69/100");
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.66, box.y + box.height / 2);
  await expect(slider).toHaveAttribute("aria-valuenow", "3");
  await expect(slider).toHaveAttribute("aria-valuetext", /^72 out of 100 on .+, audit 3 of 4$/);
  await card.getByRole("button", { name: "Show latest" }).click();
  await expect(slider).toHaveAttribute("aria-valuenow", "4");
});
