import { expect, test, type Page } from "@playwright/test";
import { overviewFixture } from "./fixtures/overview-preview-fixture";

// ILLUSTRATIVE BROWSER FIXTURE: every API is intercepted; no account, provider or D1 data is read.
const base = Date.parse("2026-11-06T08:00:00.000Z");
const fixture = overviewFixture(base);

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(base));
  await page.route("**/api/**", route => { const req = route.request(); const result = fixture.respond(req.method(), new URL(req.url()).pathname); return route.fulfill({ status: result.status, json: result.json }); });
  await page.goto("/overview?view=workspace&website=site-example");
  await page.getByText("Charts and trends",{exact:true}).click();
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
  await expect(plot).toBeHidden();
  await bar(page).getByText("Inspect saved activity", {exact:true}).click();
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

test("a historical date window reads its own completed answer instead of a newer answer", async ({page}) => {
  await open(page);
  await bar(page).getByRole("button", {name:"All loaded history"}).click();
  const dialog=page.getByRole("dialog",{name:"Choose date window"});
  await dialog.getByLabel("From").fill("2026-09-01");
  await dialog.getByLabel("To").fill("2026-09-01");
  await dialog.getByRole("button",{name:"Apply"}).click();
  const rows=page.getByLabel("Search observations by question").locator("article");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Best code search for monorepos");
  await expect(rows.getByRole("link",{name:/Open observation/})).toHaveAttribute("href",/run=h13/);
  await expect(rows.first()).not.toContainText("Nov 4");
});

test("mobile date and export panels stay above the theme picker with touch-sized controls",async({page})=>{
  await page.setViewportSize({width:320,height:740});
  await open(page);
  await bar(page).getByRole("button",{name:"All loaded history"}).click();
  const datePanel=page.getByRole("dialog",{name:"Choose date window"});
  const theme=await page.locator('.folio-theme-picker').boundingBox();
  const bounds=await datePanel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(theme!.y);
  const preset=await datePanel.getByRole("button",{name:"Last 7 days"}).boundingBox();expect(preset!.height).toBeGreaterThanOrEqual(44);
  await datePanel.getByRole("button",{name:"Last 7 days"}).click();
  await bar(page).getByRole("button",{name:"Export",exact:true}).click();
  const menu=page.getByRole("dialog",{name:"Export CSV"});
  const exportBottom=async()=>{const box=await menu.boundingBox();return box!.y+box!.height;};
  await expect.poll(exportBottom).toBeLessThanOrEqual(theme!.y);
  // Late wrapping/style changes must keep an already-open panel in bounds too.
  await menu.locator('.owb-panel-note').evaluate(node=>{node.textContent += ' Additional saved-history context.'.repeat(5);});
  await expect.poll(exportBottom).toBeLessThanOrEqual(theme!.y);
  expect(await menu.getByRole("button").evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44))).toBe(true);
});

test("download state belongs to the current CSV contents rather than the file kind",async({page})=>{
  await open(page);
  await bar(page).getByRole("button",{name:"Export",exact:true}).click();
  const menu=page.getByRole("dialog",{name:"Export CSV"});
  const download=page.waitForEvent("download");
  await menu.getByRole("button",{name:/Download folio-example-fixture.dev-questions/}).click();await download;
  const questionFile=menu.getByRole("listitem").filter({hasText:"Questions shown"});
  await expect(questionFile).toContainText("Downloaded");
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox",{name:"Search loaded questions"}).fill("monorepos");
  await expect(page.getByLabel("Search observations by question").locator("article")).toHaveCount(1);
  await bar(page).getByRole("button",{name:"Export",exact:true}).click();
  await expect(questionFile).toContainText("Questions shown · 1 row");
  await expect(questionFile).not.toContainText("Downloaded");
});
