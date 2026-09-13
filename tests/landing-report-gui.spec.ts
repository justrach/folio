import { expect, test, type Page } from "@playwright/test";
import evaluationBatch from "../src/data/developer-tool-evaluations.json";
import { DEVELOPER_TOOLS, WEBSITE_AUDIENCES } from "../src/lib/developer-tools-source";

const observations = evaluationBatch.results.filter(result => result.captureKind === "public-homepage");
const statusOrder: Record<string, number> = { fail: 0, warning: 1, pass: 2, optional: 3 };
const report = (page: Page) => page.getByRole("region", { name: "Folio website report", exact: true });
const picker = (page: Page) => report(page).getByRole("combobox", { name: "Choose a website report", exact: true });
const table = (page: Page, name: string) => report(page).getByRole("table", { name: `Folio checks for ${name}`, exact: true });
const pagination = (page: Page, name: string) => report(page).getByRole("navigation", { name: `Folio checks for ${name} pagination`, exact: true });

async function readOnlyFixture(page: Page) {
  const writes: string[] = [], providers: string[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const request = route.request();
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
      return route.fulfill({ status: 409, json: { error: "Report browsing does not start work." } });
    }
    return route.fulfill({ status: 200, json: null });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(pattern, route => { providers.push(route.request().url()); return route.abort("blockedbyclient"); });
  return () => { expect(writes).toEqual([]); expect(providers).toEqual([]); expect(errors).toEqual([]); };
}

async function noOverflow(page: Page) {
  const width = await page.evaluate(() => ({ actual: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
  expect(width.actual).toBeLessThanOrEqual(width.viewport + 1);
}

test("landing reports show actual captured results across all audiences without starting work", async ({ page }) => {
  const verifyReadOnly = await readOnlyFixture(page);
  await page.goto("/");
  await page.getByText(`HTML page checks for ${observations.length} websites`, { exact: true }).click();
  await expect(report(page)).toBeVisible();
  await expect(picker(page)).toHaveValue("allbirds");
  await expect(picker(page).getByRole("option")).toHaveCount(DEVELOPER_TOOLS.length);
  await expect(picker(page).locator("optgroup")).toHaveCount(WEBSITE_AUDIENCES.length);

  for (const id of ["allbirds", "better-auth", "clerk"]) {
    const observed = observations.find(result => result.toolId === id)!;
    expect(observed.status).toBe("complete");
    await picker(page).selectOption(id);
    await expect(report(page).getByRole("heading", { name: observed.name, exact: true })).toBeVisible();
    await expect(report(page).locator(".landing-report-score > strong")).toHaveText(`${observed.score} / 100`);
    await expect(report(page).locator("time")).toHaveAttribute("datetime", observed.capturedAt);
    await expect(report(page)).not.toContainText("Not measured");
    const attention = observed.checks.filter(check => check.maxPoints > 0 && check.points < check.maxPoints).length;
    await expect(report(page).locator(".landing-report-score p")).toHaveText(attention ? `${attention} ${attention === 1 ? "check needs" : "checks need"} attention` : "All scored checks passed");
    await expect(pagination(page, observed.name).getByRole("status")).toHaveText(`1–5 of ${observed.checks.length}`);
  }
  await expect(report(page)).toContainText("Folio checked this homepage’s HTML.");
  await noOverflow(page);
  verifyReadOnly();
});

test("landing check sorting, pagination, keyboard disclosure, and source data stay tied to the selected capture", async ({ page }, testInfo) => {
  const verifyReadOnly = await readOnlyFixture(page);
  await page.goto("/");
  await page.getByText(`HTML page checks for ${observations.length} websites`, { exact: true }).click();
  await picker(page).selectOption("better-auth");
  const observed = observations.find(result => result.toolId === "better-auth")!;
  const checks = table(page, observed.name);
  const nav = pagination(page, observed.name);
  await nav.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(nav.getByRole("status")).toHaveText(`6–10 of ${observed.checks.length}`);
  await expect(nav.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
  await checks.getByRole("button", { name: "Points", exact: true }).click();
  await expect(nav).toContainText("Page 1 of 2");
  await expect(checks.getByRole("columnheader", { name: "Points", exact: true })).toHaveAttribute("aria-sort", "ascending");
  const pointCells = checks.locator("tbody > tr > td.numeric");
  const expectedPoints = [...observed.checks].sort((left, right) => left.points - right.points).slice(0, 5).map(check => `${check.points} / ${check.maxPoints}`);
  await expect(pointCells).toHaveText(expectedPoints);
  await checks.getByRole("button", { name: "Result", exact: true }).click();
  await expect(checks.getByRole("columnheader", { name: "Result", exact: true })).toHaveAttribute("aria-sort", "ascending");
  const firstCheck = [...observed.checks].sort((left, right) => statusOrder[left.status] - statusOrder[right.status])[0];
  const firstRow = checks.locator("tbody > tr").filter({ has: page.locator('th[scope="row"]') }).first();
  const open = firstRow.getByRole("button", { name: "View details", exact: true });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(firstRow.getByRole("button", { name: "Hide details", exact: true })).toHaveAttribute("aria-expanded", "true");
  const detailHeading = checks.getByRole("heading", { name: `${firstCheck.label} observation`, exact: true });
  await expect(detailHeading).toBeFocused();
  await expect(detailHeading).toBeInViewport();
  await expect(checks.locator(".landing-report-check-detail")).toContainText(firstCheck.detail);
  await noOverflow(page);
  await report(page).getByText("Captured source and hash", { exact: true }).click();
  await expect(report(page).locator(".landing-report-source code")).toHaveText(observed.contentHash!);
  await expect(report(page).locator(".landing-report-source")).toContainText(observed.finalUrl!);
  await picker(page).selectOption("clerk");
  await expect(report(page).locator(".landing-report-check-detail")).toHaveCount(0);
  await expect(report(page).locator(".landing-report-source")).not.toHaveAttribute("open", "");
  await expect(pagination(page, "Clerk")).toContainText("Page 1 of 2");
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("landing-report.png"), fullPage: true, scale: "css" });
  verifyReadOnly();
});
