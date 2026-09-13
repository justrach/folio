import { expect, test, type Locator, type Page } from "@playwright/test";
import { evaluationMethodology } from "../src/lib/evaluation";
import { DEVELOPER_TOOLS } from "../src/lib/developer-tools-source";
import evaluationBatch from "../src/data/developer-tool-evaluations.json";

const caption = "Websites and Folio page evaluations";
const publicObservations = evaluationBatch.results.filter(result => result.captureKind === "public-homepage");
const measuredScores = publicObservations.filter(result => result.status === "complete" && result.score !== null)
  .map(result => result.score as number).sort((left, right) => left - right);
const unavailableCount = DEVELOPER_TOOLS.length - measuredScores.length;
const pageCount = Math.ceil(DEVELOPER_TOOLS.length / 12);
const sortedNames = DEVELOPER_TOOLS.map(tool => tool.name).sort((left, right) => left.localeCompare(right));
const measuredIds = new Set(publicObservations.filter(result => result.status === "complete" && result.score !== null).map(result => result.toolId));

async function fixture(page: Page) {
  const state = { writes: [] as string[], providerRequests: [] as string[], pageErrors: [] as string[] };
  page.on("pageerror", error => state.pageErrors.push(error.message));
  // All app requests are fixtures, including navigation into other index views.
  // The tool catalog and public capture observations are the checked-in batch.
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method !== "GET") {
      state.writes.push(`${method} ${path}`);
      return route.fulfill({ status: 409, json: { error: "Directory browsing must not submit work." } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: null });
    if (path === "/api/agents/status") return route.fulfill({ json: {
      provider: "OpenAI Agents API", configured: false, status: "disconnected", model: "fixture-model",
      canRun: false, authorized: false, message: "GUI fixture: no provider access.",
    } });
    if (path === "/api/leaderboard") return route.fulfill({ json: {
      sites: [], methodology: evaluationMethodology, generatedAt: "2026-09-13T08:00:00.000Z",
    } });
    if (path === "/api/scans") return route.fulfill({ json: { scans: [] } });
    if (path === "/api/seo-data") return route.fulfill({ json: { configured: false, authorized: false } });
    if (path === "/api/seo-reports") return route.fulfill({ json: { reports: [] } });
    return route.fulfill({ status: 401, json: { error: "Sign in to open private workspace data." } });
  });
  for (const pattern of ["https://api.openai.com/**", "https://api.dataforseo.com/**", "https://searchconsole.googleapis.com/**"])
    await page.route(pattern, route => {
      state.providerRequests.push(route.request().method());
      return route.abort("blockedbyclient");
    });
  return state;
}

function directory(page: Page) { return page.getByRole("region", { name: "Website evaluation directory", exact: true }); }
function table(page: Page) { return directory(page).getByRole("table", { name: caption, exact: true }); }
function rows(page: Page) { return table(page).locator("tbody > tr").filter({ has: page.locator('th[scope="row"]') }); }
function pagination(page: Page) { return directory(page).getByRole("navigation", { name: `${caption} pagination`, exact: true }); }
function names(page: Page) { return rows(page).locator(".devtool-name > a"); }

async function showHtmlChecks(page: Page) {
  const switcher = page.getByRole("group", { name: "Evaluation view", exact: true });
  const htmlButton = switcher.getByRole("button", { name: "HTML page checks", exact: true });
  await htmlButton.focus();
  await page.keyboard.press("Enter");
  await expect(htmlButton).toHaveAttribute("aria-pressed", "true");
  await expect(switcher.getByRole("button", { name: "Search rankings", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("region", { name: "HTML page checks", exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  const viewport = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    layoutWidth: innerWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);
  expect(viewport.layoutWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);
}

function readOnly(state: Awaited<ReturnType<typeof fixture>>) {
  expect(state.writes).toEqual([]);
  expect(state.providerRequests).toEqual([]);
  expect(state.pageErrors).toEqual([]);
}

async function scoresAcrossPages(page: Page) {
  const scores: (number | null)[] = [];
  for (let pageNumber = 1; pageNumber <= 10; pageNumber++) {
    await expect(pagination(page)).toContainText(`Page ${pageNumber} of`);
    const labels = await rows(page).locator(".devtool-score").allTextContents();
    for (const label of labels) scores.push(label.includes("Not measured") ? null : Number(label.match(/^\s*(\d+(?:\.\d+)?)/)?.[1]));
    const next = pagination(page).getByRole("button", { name: "Next page", exact: true });
    if (await next.isDisabled()) return scores;
    await next.click();
  }
  throw new Error("Unexpected directory pagination length.");
}

async function activateWithKeyboard(page: Page, button: Locator) {
  await button.focus();
  await page.keyboard.press("Enter");
}

async function contrastRatio(element: Locator) {
  return element.evaluate(node => {
    const channels = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map(value => {
      const linear = value / 255;
      return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    const foreground = luminance(channels(getComputedStyle(node).color));
    let background = [255, 255, 255];
    let ancestor: Element | null = node;
    while (ancestor) {
      const candidate = channels(getComputedStyle(ancestor).backgroundColor);
      if (candidate.length === 3 || candidate[3] === 1) { background = candidate; break; }
      ancestor = ancestor.parentElement;
    }
    const behind = luminance(background);
    return (Math.max(foreground, behind) + 0.05) / (Math.min(foreground, behind) + 0.05);
  });
}

test("website search, audience, category, and measurement filters combine and reset the result set", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page.goto("/leaderboard");
  await showHtmlChecks(page);
  await expect(directory(page)).toBeVisible();
  await expect(page.getByRole("region", { name: "Folio local evaluation", exact: true })).toHaveCount(0);
  await expect(page.locator(".developer-tools-index")).not.toContainText(/localhost|127\.0\.0\.1|Folio, under the same rubric/);
  await expect(page.locator(".devtools-self")).toHaveCount(0);
  await expect(page.locator(".devtools-methodology")).not.toHaveAttribute("open");
  await noOverflow(page);
  await expect(pagination(page).getByRole("status")).toHaveText(`1–12 of ${DEVELOPER_TOOLS.length}`);
  await page.screenshot({ path: testInfo.outputPath("website-evaluations.png"), fullPage: true, scale: "css" });
  await page.screenshot({ path: `/tmp/folio-website-evaluations-${page.viewportSize()!.width}.png`, fullPage: true, scale: "css" });

  const search = page.getByRole("searchbox", { name: "Search websites", exact: true });
  const audience = page.getByRole("combobox", { name: "Audience", exact: true });
  const category = page.getByRole("combobox", { name: "Category", exact: true });
  const measured = page.getByRole("combobox", { name: "Page evaluation status", exact: true });
  await audience.selectOption("Developer tools");
  // This matches a purpose statement, not just a product name.
  await search.fill("managed builds");
  await expect(names(page)).toHaveText(["Vercel"]);
  await category.selectOption("Deployment");
  await measured.selectOption("Measured pages");
  await expect(names(page)).toHaveText(["Vercel"]);
  await expect(pagination(page).getByRole("status")).toHaveText("1–1 of 1");

  await search.fill("");
  await measured.selectOption("Not measured");
  const unavailableDeployment = DEVELOPER_TOOLS.filter(tool => tool.audience === "Developer tools" && tool.category === "Deployment" && !measuredIds.has(tool.id));
  await expect(names(page)).toHaveText(unavailableDeployment.map(tool => tool.name).sort());
  await search.fill("does-not-exist-in-this-directory");
  await expect(table(page)).toContainText("No results match these filters.");
  await expect(pagination(page).getByRole("status")).toHaveText("0 results");
  await expect(pagination(page).getByRole("button", { name: "Next page", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(audience).toHaveValue("All audiences");
  await expect(category).toHaveValue("All categories");
  await expect(measured).toHaveValue("All results");
  await expect(pagination(page).getByRole("status")).toHaveText(`1–12 of ${DEVELOPER_TOOLS.length}`);
  await noOverflow(page);
  readOnly(state);
});

test("Folio page evaluation sorting orders measured values numerically and keeps unavailable scores last in both directions", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/leaderboard");
  await showHtmlChecks(page);
  const sort = table(page).getByRole("button", { name: "Folio page evaluation", exact: true });
  const header = table(page).getByRole("columnheader", { name: "Folio page evaluation", exact: true });
  await sort.click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  const ascending = await scoresAcrossPages(page);
  expect(ascending).toHaveLength(DEVELOPER_TOOLS.length);
  expect(ascending).toEqual([...measuredScores, ...Array(unavailableCount).fill(null)]);

  await sort.click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  await expect(pagination(page)).toContainText(`Page 1 of ${pageCount}`);
  const descending = await scoresAcrossPages(page);
  expect(descending).toEqual([...measuredScores.toReversed(), ...Array(unavailableCount).fill(null)]);
  await noOverflow(page);
  readOnly(state);
});

test("audience selection exposes broader examples and retains a developer-only view", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/leaderboard");
  await showHtmlChecks(page);
  const audience = page.getByRole("combobox", { name: "Audience", exact: true });
  const category = page.getByRole("combobox", { name: "Category", exact: true });
  const search = page.getByRole("searchbox", { name: "Search websites", exact: true });
  await audience.selectOption("Software & work");
  await expect(names(page)).toHaveText(DEVELOPER_TOOLS.filter(tool => tool.audience === "Software & work").map(tool => tool.name).sort());
  await search.fill("Basecamp");
  await expect(names(page)).toHaveText(["Basecamp"]);
  const basecamp = DEVELOPER_TOOLS.find(tool => tool.id === "basecamp")!;
  await category.selectOption(basecamp.category);
  await expect(rows(page).getByRole("link", { name: "Official reference", exact: true })).toHaveAttribute("href", basecamp.docsUrl);
  await search.fill("");
  await audience.selectOption("Learning");
  await expect(category).toHaveValue("All categories");
  await expect(names(page)).toHaveText(DEVELOPER_TOOLS.filter(tool => tool.audience === "Learning").map(tool => tool.name).sort());
  await audience.selectOption("Developer tools");
  const developerCount = DEVELOPER_TOOLS.filter(tool => tool.audience === "Developer tools").length;
  await expect(directory(page).locator(".devtools-results-count")).toHaveText(`${developerCount} websites · Developer tools`);
  expect(developerCount).toBe(24);
  await expect(rows(page).locator(".devtool-category > small")).toHaveText(Array(12).fill("Developer tools"));
  await page.getByRole("combobox", { name: "Page evaluation status", exact: true }).selectOption("Measured pages");
  await expect(directory(page).locator(".devtools-results-count")).toHaveText(`${developerCount} websites · Developer tools`);
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(audience).toHaveValue("All audiences");
  await expect(directory(page).locator(".devtools-results-count")).toHaveText(`${DEVELOPER_TOOLS.length} websites`);
  await noOverflow(page);
  readOnly(state);
});

test("Spectrum pagination and keyboard detail controls preserve readable row evidence and measurement limits", async ({ page }, testInfo) => {
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page.goto("/leaderboard");
  await showHtmlChecks(page);
  const previous = pagination(page).getByRole("button", { name: "Previous page", exact: true });
  const next = pagination(page).getByRole("button", { name: "Next page", exact: true });
  await expect(previous).toBeDisabled();
  await expect(names(page).first()).toHaveText(sortedNames[0]);
  await next.click();
  await expect(pagination(page).getByRole("status")).toHaveText(`13–24 of ${DEVELOPER_TOOLS.length}`);
  await expect(names(page).first()).toHaveText(sortedNames[12]);
  for (let number = 2; number < pageCount; number++) await next.click();
  await expect(next).toBeDisabled();
  for (let number = pageCount; number > 1; number--) await previous.click();
  await expect(names(page).first()).toHaveText(sortedNames[0]);
  await table(page).getByRole("button", { name: "Website", exact: true }).click();
  await expect(table(page).getByRole("columnheader", { name: "Website", exact: true })).toHaveAttribute("aria-sort", "descending");
  await expect(names(page).first()).toHaveText(sortedNames.at(-1)!);

  const search = page.getByRole("searchbox", { name: "Search websites", exact: true });
  await search.fill("Vercel");
  await expect(pagination(page)).toContainText("Page 1 of 1");
  const row = rows(page).filter({ hasText: "Vercel" });
  const open = row.getByRole("button", { name: "View details", exact: true });
  const detailId = await open.getAttribute("aria-controls");
  expect(detailId).toBeTruthy();
  await activateWithKeyboard(page, open);
  const close = row.getByRole("button", { name: "Hide details", exact: true });
  await expect(close).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Vercel: Folio page evaluation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vercel: Folio page evaluation", exact: true })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Vercel: Folio page evaluation", exact: true })).toBeInViewport();
  await noOverflow(page);
  await page.screenshot({ path: `/tmp/folio-website-evaluation-detail-${page.viewportSize()!.width}.png`, fullPage: true, scale: "css" });
  const details = page.locator(`[id=${JSON.stringify(detailId)}]`);
  await expect(details).toContainText(`${publicObservations.find(result => result.toolId === "vercel")!.score} / 100 Folio page evaluation`);
  await expect(details).toContainText("Capture SHA-256");
  await expect(details.getByRole("link", { name: "Source 1", exact: true })).toHaveAttribute("href", /^https:\/\//);
  await expect(row.getByRole("link", { name: "Official reference", exact: true })).toHaveAttribute("href", "https://vercel.com/docs");
  const vercel = publicObservations.find(result => result.toolId === "vercel")!;
  const attention = vercel.checks.filter(check => check.maxPoints > 0 && check.points < check.maxPoints).length;
  expect(attention).toBeGreaterThan(0);
  await expect(row.locator(".devtool-check-summary")).toContainText(`${attention} ${attention === 1 ? "check needs" : "checks need"} attention`);
  await expect(row).not.toContainText("0 failed");
  const contrast = await Promise.all([".devtool-name > span", ".devtool-score strong", ".devtool-score small", ".devtool-check-summary"]
    .map(selector => contrastRatio(row.locator(selector))));
  contrast.push(await contrastRatio(details.locator(".devtool-detail > p").first()));
  contrast.push(await contrastRatio(details.locator(".devtool-observation li p").first()));
  for (const ratio of contrast) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await testInfo.attach("directory-text-contrast", { body: JSON.stringify(contrast), contentType: "application/json" });
  await expect(page.locator(".developer-tools-index")).toContainText("Folio’s readiness-v1 scores cover captured HTML only.");
  const officialUrls = new Set(DEVELOPER_TOOLS.flatMap(tool => [tool.websiteUrl, tool.docsUrl, ...tool.sourceUrls]));
  const externalLinks = await page.locator('.developer-tools-index a[target="_blank"]').evaluateAll(links => links.map(link => link.getAttribute("href")));
  for (const href of externalLinks) expect([...officialUrls]).toContain(href);
  await activateWithKeyboard(page, close);
  await expect(row.getByRole("button", { name: "View details", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("heading", { name: "Vercel: Folio page evaluation", exact: true })).toHaveCount(0);

  const unavailable = publicObservations.find(result => result.status !== "complete");
  if (unavailable) {
    await search.fill(unavailable.name);
    await expect(rows(page).locator(".devtool-capture-error")).toHaveText(unavailable.error!);
    await rows(page).getByRole("button", { name: "View details", exact: true }).click();
    await expect(table(page).locator(".spectrum-table-detail")).toContainText(unavailable.error!);
    await expect(table(page).locator(".spectrum-table-detail")).not.toContainText("0 / 100 Folio page evaluation");
  }
  await noOverflow(page);
  readOnly(state);
});

test("directory, sample, published, and private-evaluation navigation submits no provider work", async ({ page }) => {
  const state = await fixture(page);
  await page.goto("/leaderboard");
  await showHtmlChecks(page);
  await expect(directory(page)).toBeVisible();
  await page.getByRole("button", { name: "Explore sample rankings", exact: true }).click();
  await expect(directory(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Published page audits", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No page audits published yet.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Search rankings", exact: true }).click();
  await showHtmlChecks(page);
  await expect(directory(page)).toBeVisible();
  const methodology = page.getByText("How to read these observations", { exact: true });
  await methodology.scrollIntoViewIfNeeded();
  await expect(methodology).toBeInViewport();
  await methodology.click();
  await page.getByRole("link", { name: "Open private website evaluations", exact: true }).click();
  await expect(page).toHaveURL(/\/evaluations$/);
  await page.goBack();
  await showHtmlChecks(page);
  await expect(directory(page)).toBeVisible();
  await noOverflow(page);
  readOnly(state);
});
