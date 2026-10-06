import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const BASE_PATH = "/onboarding";

async function watchForForbiddenRequests(page: Page) {
  const violations: string[] = [];
  const appOrigin = new URL(process.env.GUI_BASE_URL || "http://localhost:3001").origin;
  await page.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.protocol === "blob:" || url.origin === "null") {
      return route.continue();
    }
    if (url.origin !== appOrigin || url.pathname.startsWith("/api")) {
      violations.push(`forbidden: ${request.url()}`);
      return route.abort();
    }
    return route.continue();
  });
  return violations;
}

async function openOnboarding(page: Page) {
  await page.goto(BASE_PATH);
  await page.locator(".onboarding-mock[data-ready='true']").waitFor();
}

async function previewSiteAndWait(page: Page) {
  const heading = page.getByRole("heading", { name: "Does this sound like your business?" });
  await page.getByRole("button", { name: "Preview website understanding" }).click();
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
}

async function acceptAllClaims(page: Page) {
  for (const claim of ["description", "audience", "capabilities"]) {
    await page.locator(`[data-claim="${claim}"]`).getByRole("button", { name: "Looks right" }).click();
  }
}

async function removeClaim(page: Page, id: string) {
  const card = page.locator(`[data-claim="${id}"]`);
  await card.locator("summary.ob-choice").click();
  await card.getByRole("button", { name: "Remove" }).click();
}

test("A: complete flow — edit, removal, named comparison, brief panel and JSON export", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await expect(page.getByText("Onboarding preview · Sample data")).toBeVisible();
  await previewSiteAndWait(page);

  await page.locator('[data-claim="description"]').getByRole("button", { name: "Looks right" }).click();
  const audience = page.locator('[data-claim="audience"]');
  await audience.getByRole("button", { name: "Edit" }).click();
  await expect(audience.locator("textarea")).toHaveValue("Developers and teams using AI coding agents.");
  await audience.locator("textarea").fill("Teams running many coding agents at once.");
  await audience.getByRole("button", { name: "Use my wording" }).click();
  await audience.getByText("Original suggestion", { exact: true }).click();
  await expect(audience.getByText("Developers and teams using AI coding agents.")).toBeVisible();
  await removeClaim(page, "capabilities");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "What would you like people to discover you for?" })).toBeFocused();
  await expect(page.getByText("Your offering description changed")).toBeVisible();
  await expect(page.getByLabel(/Include topic/)).toHaveCount(0);
  await page.getByRole("button", { name: "Use sample competitors" }).click();
  await expect(page.getByLabel(/Competitors/)).toHaveValue("Paseo\nLanes Desktop");
  await page.getByRole("button", { name: "Compare specific businesses" }).click();
  await expect(page.getByText(/named comparison/)).toBeVisible();
  await page.getByText("Keyword goals (optional)").click();
  await page.getByLabel("Keyword goals", { exact: false }).fill("agent workspaces");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review your report plan" })).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(1);
  await expect(page.locator("#ob-q-0")).toHaveValue("Which tools are suitable for agent workspaces?");
  await expect(page.getByText("Compared against: Paseo, Lanes Desktop.")).toBeVisible();
  await page.getByRole("button", { name: "Preview first report" }).click();

  await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();
  await expect(page.getByRole("cell", { name: "No sample observation" })).toHaveCount(3);
  await expect(page.getByText("Illustrative AI-answer order")).toHaveCount(0);
  await expect(page.locator(".ob-report-empty")).toBeVisible();
  await expect(page.locator(".ob-report-chart svg")).toHaveCount(0);
  await expect(page.locator("[data-report-overview]")).toContainText("Without sample answer");

  await page.getByRole("button", { name: "Review agent brief" }).click();
  const brief = page.locator("[data-brief]");
  await expect(brief).toContainText("No agent is connected; nothing is sent or executed.");
  await expect(brief).toContainText("Named comparison against: Paseo, Lanes Desktop");
  await expect(brief).toContainText("Which tools are suitable for agent workspaces? Compared against: Paseo, Lanes Desktop.");
  await expect(brief).toContainText("Keep Codegraff as the business identity");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download agent brief" }).click();
  const download = await downloadPromise;
  const payload = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(payload.mock).toBe(true);
  expect(payload.measured).toBe(false);
  expect(payload.persisted).toBe(false);
  expect(payload.businessName).toBe("Codegraff");
  expect(payload.websiteUrl).toBe("https://codegraff.com/");
  expect(payload.claimDecisions.audience.revision).toBe("Teams running many coding agents at once.");
  expect(payload.claimDecisions.capabilities.status).toBe("rejected");
  expect(payload.acceptedProfile.map((c: { id: string }) => c.id)).toEqual(["description", "audience"]);
  expect(payload.competitors).toEqual(["Paseo", "Lanes Desktop"]);
  expect(payload.topics).toHaveLength(1);
  expect(payload.topics[0].origin).toBe("keyword");
  expect(payload.questions.every((q: { mode: string }) => q.mode === "named-comparison")).toBe(true);
  expect(payload.questions.every((q: { illustrativeFindings: unknown }) => q.illustrativeFindings === null)).toBe(true);
  expect(payload.agentActions).toHaveLength(1);
  expect(payload.agentActions[0].recommendation).toContain("Keep Codegraff as the business identity");
  expect(payload.disclaimer.length).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});

async function assertMobileRowLayout(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  const rows = page.locator(".ob-table tbody tr");
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const cells = rows.nth(i).locator(":scope > th, :scope > td");
    const rects = await cells.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
    for (let j = 1; j < rects.length; j++) {
      expect(rects[j].top).toBeGreaterThanOrEqual(rects[j - 1].bottom - 1);
    }
    const rowHeader = rows.nth(i).locator("th").first();
    const details = rowHeader.locator(".ob-table-details");
    if (await details.count()) {
      const headerBox = (await rowHeader.boundingBox())!;
      const detailsBottom = await details.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(detailsBottom).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
    }
  }
}

test("B: tracked competitors keep open mode with table sample positions and disclaimers", async ({ page, isMobile }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Rule-based demo suggestions, not AI-generated research.")).toBeVisible();
  await expect(page.getByLabel("Include topic Running coding agents together")).toBeChecked();
  await expect(page.getByLabel("Include topic Understanding an existing codebase")).toBeChecked();
  await expect(page.getByLabel("Include topic Running agents in isolated environments")).not.toBeChecked();

  await page.getByRole("button", { name: "Use sample competitors" }).click();
  await expect(page.getByRole("button", { name: "Track competitors" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/track their appearances without adding their names/)).toBeVisible();
  await page.getByLabel("Include topic Running agents in isolated environments").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review your report plan" })).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(3);
  await page.getByRole("button", { name: "Preview first report" }).click();

  await expect(page.getByText("Illustrative AI-answer order, not Google rankings")).toBeVisible();
  const rows = page.locator(".ob-table tbody tr");
  await expect(rows).toHaveCount(3);
  const workspaceRow = rows.first();
  await expect(workspaceRow.locator(".ob-q-kicker")).toHaveText("Question 01");
  await expect(workspaceRow.locator(".ob-q-state")).toContainText("Sample answer");
  await expect(workspaceRow).toContainText("Which tools let developers run multiple coding agents in one workspace?");
  await expect(workspaceRow.getByRole("cell").nth(0)).toContainText("Sample position 2");
  await expect(workspaceRow.getByRole("cell").nth(1)).toContainText("Sample position 1");
  await expect(workspaceRow.getByRole("cell").nth(2)).toContainText("Sample position 3");
  await expect(workspaceRow.getByRole("cell").nth(0).locator(".ob-position")).toContainText("Sample position 2");
  const targetCell = workspaceRow.getByRole("cell").nth(0);
  await expect(targetCell).toHaveCSS("box-shadow", "none");
  if (!isMobile) {
    await expect(targetCell).toHaveCSS("vertical-align", "middle");
    const cellBox = (await targetCell.boundingBox())!;
    const badgeBox = (await targetCell.locator(".ob-position").boundingBox())!;
    expect(Math.abs(cellBox.y + cellBox.height / 2 - (badgeBox.y + badgeBox.height / 2))).toBeLessThanOrEqual(2);
  }
  if (isMobile) {
    await expect(workspaceRow.getByRole("cell").nth(0).locator(".ob-you-label")).toHaveText("Your business");
    await expect(workspaceRow.getByRole("cell").nth(1).locator(".ob-you-label")).toHaveCount(0);
    await expect(workspaceRow.getByRole("cell").nth(0).locator(".ob-cell-label")).toHaveCSS("text-transform", "none");
  }
  const contextRow = rows.nth(1);
  await expect(contextRow.getByRole("cell").nth(0)).toContainText("Sample position 1");
  await expect(contextRow.getByRole("cell").nth(1)).toContainText("Not included in sample");
  const missingRow = rows.nth(2);
  await expect(missingRow.locator(".ob-q-kicker")).toHaveText("Question 03");
  await expect(missingRow.locator(".ob-q-state")).toContainText("No sample answer");
  await expect(missingRow.getByRole("cell", { name: "No sample observation" })).toHaveCount(3);
  await expect(missingRow.locator(".ob-position")).toHaveCount(0);

  const firstHeader = workspaceRow.locator("th").first();
  const disclosures = firstHeader.locator(".ob-table-details .ob-details");
  for (let i = 0; i < await disclosures.count(); i++) {
    const headerBox = (await firstHeader.boundingBox())!;
    const closedBox = (await disclosures.nth(i).boundingBox())!;
    expect(closedBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
    expect(closedBox.y + closedBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 1);
    const summary = disclosures.nth(i).locator("summary");
    await summary.press("Enter");
    await expect(summary).toBeFocused();
    const outline = await summary.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await summary.press("Enter");
  }
  await assertMobileRowLayout(page, isMobile);
  await page.getByText("Data provenance").first().click();
  await expect(page.getByText(/static demo fixture data/).first()).toBeVisible();
  await page.getByText("Related evidence").first().click();
  await expect(page.getByText(/not the same measurement/).first()).toBeVisible();
  const openHeaderBox = (await firstHeader.boundingBox())!;
  for (let i = 0; i < await disclosures.count(); i++) {
    const openBox = (await disclosures.nth(i).boundingBox())!;
    expect(openBox.y).toBeGreaterThanOrEqual(openHeaderBox.y - 1);
    expect(openBox.y + openBox.height).toBeLessThanOrEqual(openHeaderBox.y + openHeaderBox.height + 1);
  }
  await assertMobileRowLayout(page, isMobile);
  await expect(page.getByText("Sample agent action — advisory fixture")).toBeVisible();

  const viewport = page.viewportSize()!;
  const rects = await page.locator(".ob-table td").evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    }),
  );
  for (const rect of rects) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(viewport.width + 1);
  }
  expect(violations).toEqual([]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Which website should we look at?" })).toBeVisible();
});

test("C: invalid site, blank edit, question gate, and site change clears sample evidence", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);

  await page.getByLabel("Website address").fill("not a url");
  await page.getByRole("button", { name: "Preview website understanding" }).click();
  await expect(page.locator(".ob-alert")).toContainText("Enter a public website address");
  await expect(page.getByLabel("Website address")).toHaveValue("not a url");

  await page.getByLabel("Website address").fill("codegraff.com");
  await previewSiteAndWait(page);
  const description = page.locator('[data-claim="description"]');
  await description.getByRole("button", { name: "Edit" }).click();
  await description.locator("textarea").fill("");
  await description.getByRole("button", { name: "Use my wording" }).click();
  await expect(description.locator(".ob-alert")).toContainText("Enter your own wording");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await description.getByRole("button", { name: "Cancel edit" }).click();
  await description.getByRole("button", { name: "Looks right" }).click();
  await page.locator('[data-claim="audience"]').getByRole("button", { name: "Looks right" }).click();
  await page.locator('[data-claim="capabilities"]').getByRole("button", { name: "Looks right" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "I don’t know yet" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Include candidate question 1").uncheck();
  await page.getByLabel("Include candidate question 2").uncheck();
  await page.getByRole("button", { name: "Preview first report" }).click();
  await expect(page.locator(".ob-alert")).toContainText("Select at least one question");
  await page.getByLabel("Include candidate question 1").check();
  await page.getByRole("button", { name: "Preview first report" }).click();
  await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();

  await page.getByRole("button", { name: "Edit understanding" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByLabel("Website address").fill("example.org");
  await page.getByRole("button", { name: "Preview website understanding" }).click();
  await expect(page.getByText("No sample analysis exists for this site")).toBeVisible();
  await expect(page.getByText("Codegraff builds tools for running coding agents")).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Add a topic to prepare your report.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use sample competitors" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator('.ob-question input[type="checkbox"]')).toHaveCount(0);
  expect(violations).toEqual([]);
});

test("D: keyboard navigation works and no horizontal overflow", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await page.getByLabel("Website address").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Business name")).toBeFocused();
  await page.getByLabel("Website address").press("Enter");
  await expect(page.getByRole("heading", { name: "Does this sound like your business?" })).toBeFocused();

  const description = page.locator('[data-claim="description"]');
  await description.getByRole("button", { name: "Looks right" }).focus();
  await page.keyboard.press("Enter");
  await expect(description.getByText("Looks right").first()).toBeVisible();
  await description.locator("summary.ob-choice").focus();
  await page.keyboard.press("Enter");
  await expect(description.getByRole("button", { name: "Remove" })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(violations).toEqual([]);
});

test("E: topic reconciliation preserves edits and selection, drops stale goals, restores samples", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByText("Keyword goals (optional)").click();
  await page.getByLabel("Keyword goals", { exact: false }).fill("alpha");
  await page.getByRole("button", { name: "Continue" }).click();

  const editedText = "Edited fixture question?";
  await page.locator("#ob-q-0").fill(editedText);
  await expect(page.locator("#ob-q-3")).toHaveValue("Which tools are suitable for alpha?");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByText("Keyword goals (optional)").click();
  await page.getByLabel("Keyword goals", { exact: false }).fill("beta");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("#ob-q-0")).toHaveValue(editedText);
  await expect(page.locator("#ob-q-3")).toHaveValue("Which tools are suitable for beta?");
  await expect(page.getByText(/suitable for alpha/)).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await removeClaim(page, "capabilities");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your offering description changed")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("textarea")).toHaveCount(1);
  await expect(page.locator("#ob-q-0")).toHaveValue("Which tools are suitable for beta?");

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator('[data-claim="capabilities"]').getByRole("button", { name: "Looks right" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#ob-q-0")).toHaveValue(editedText);
  await expect(page.locator("#ob-q-3")).toHaveValue("Which tools are suitable for beta?");
  expect(violations).toEqual([]);
});

test("F: non-sample site keeps typed name, custom topic, manual claims, and a clean export", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await page.getByLabel("Website address").fill("example.org");
  await page.getByLabel("Business name").fill("Example Studio");
  await page.getByRole("button", { name: "Preview website understanding" }).click();

  await expect(page.getByText("No sample analysis exists for this site")).toBeVisible();
  await page.getByLabel("What the business does").fill("Example Studio publishes tiny games.");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Add another topic").fill("tiny games");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByLabel("Include topic tiny games")).toBeChecked();
  await page.getByRole("button", { name: "I don’t know yet" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Based on your topic: tiny games")).toBeVisible();
  await expect(page.locator("#ob-q-0")).toHaveValue("Which tools are suitable for tiny games?");
  await page.getByRole("button", { name: "Preview first report" }).click();

  await expect(page.getByRole("cell", { name: "No sample observation" })).toHaveCount(1);
  await expect(page.locator(".ob-report-empty")).toBeVisible();
  await expect(page.locator(".ob-report-chart svg")).toHaveCount(0);
  await expect(page.getByText("Make the website’s identity clear")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review agent brief" })).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download agent brief" }).click();
  const download = await downloadPromise;
  const serialized = await readFile((await download.path())!, "utf8");
  const payload = JSON.parse(serialized);
  expect(payload.businessName).toBe("Example Studio");
  expect(payload.sampleWebsite).toBe(false);
  expect(payload.acceptedProfile[0].text).toBe("Example Studio publishes tiny games.");
  expect(payload.suggestions.description).toBe("");
  expect(payload.agentActions).toEqual([]);
  expect(payload.topics[0].origin).toBe("custom");
  expect(serialized).not.toContain("Codegraff");
  expect(serialized).not.toContain("Paseo");
  expect(serialized).not.toContain("Lanes Desktop");
  expect(violations).toEqual([]);
});

test("G: reopening an edit retains wording and pending edit blocks Continue", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await page.locator('[data-claim="description"]').getByRole("button", { name: "Looks right" }).click();
  const capabilities = page.locator('[data-claim="capabilities"]');
  await capabilities.locator("summary.ob-choice").click();
  await capabilities.getByRole("button", { name: "Not sure" }).click();
  const audience = page.locator('[data-claim="audience"]');
  await audience.getByRole("button", { name: "Edit" }).click();
  await audience.locator("textarea").fill("Agent platform teams.");
  await audience.getByRole("button", { name: "Use my wording" }).click();

  await audience.getByRole("button", { name: "Edit" }).click();
  await expect(audience.locator("textarea")).toHaveValue("Agent platform teams.");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await audience.getByRole("button", { name: "Cancel edit" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await expect(audience.getByText("Agent platform teams.")).toBeVisible();
  expect(violations).toEqual([]);
});

test("H: long unbroken values do not cause horizontal overflow", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  const longName = "LongNameWithoutAnySpaces".repeat(9).slice(0, 200);
  await page.getByLabel("Business name").fill(longName);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Use sample competitors" }).click();
  await page.getByLabel(/Competitors/).fill(longName);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Preview first report" }).click();
  await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(violations).toEqual([]);
});

test("I: start over clears a previously edited name so it cannot resurrect", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await page.getByLabel("Website address").fill("example.org");
  await page.getByLabel("Business name").fill("Example Studio");
  await page.getByRole("button", { name: "Preview website understanding" }).click();
  await expect(page.getByText("No sample analysis exists for this site")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add another topic").fill("tiny games");
  await page.getByRole("button", { name: "Add topic" }).click();
  await page.getByRole("button", { name: "I don’t know yet" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Preview first report" }).click();
  await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { name: "Which website should we look at?" })).toBeFocused();
  await expect(page.getByLabel("Business name")).toHaveValue("Codegraff");

  await page.getByLabel("Website address").fill("example.org");
  await page.getByRole("button", { name: "Preview website understanding" }).click();
  await expect(page.getByText("No sample analysis exists for this site")).toBeVisible();
  await expect(page.getByText("Example Studio")).toHaveCount(0);
  expect(violations).toEqual([]);
});

test("J: claim status changes preserve revisions until the original is deliberately restored", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);

  const capabilities = page.locator('[data-claim="capabilities"]');
  await capabilities.getByRole("button", { name: "Edit" }).click();
  await capabilities.locator("textarea").fill("Self-hosted sandboxes for agent fleets.");
  await capabilities.getByRole("button", { name: "Use my wording" }).click();
  await capabilities.getByRole("button", { name: "Looks right" }).click();
  await expect(capabilities.getByText("Self-hosted sandboxes for agent fleets.")).toBeVisible();
  await expect(capabilities.getByText("Your wording")).toBeVisible();

  await capabilities.locator("summary.ob-choice").click();
  await capabilities.getByRole("button", { name: "Remove" }).click();
  await expect(capabilities.getByText("Self-hosted sandboxes for agent fleets.")).toBeVisible();
  await capabilities.getByRole("button", { name: "Looks right" }).click();
  await expect(capabilities.getByText("Your wording")).toBeVisible();
  await expect(capabilities.getByText("Self-hosted sandboxes for agent fleets.")).toBeVisible();

  await capabilities.getByText("Original suggestion", { exact: true }).click();
  await capabilities.getByRole("button", { name: "Use original suggestion" }).click();
  await expect(capabilities.getByText("A desktop workspace, a coding harness")).toBeVisible();
  await expect(capabilities.getByText("Looks right").first()).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Rule-based demo suggestions, not AI-generated research.")).toBeVisible();
  await expect(page.getByLabel("Include topic Running coding agents together")).toBeChecked();
  expect(violations).toEqual([]);
});

test("K: removing a custom topic keeps other topics and their edits", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Add another topic").fill("fleet dashboards");
  await page.getByRole("button", { name: "Add topic" }).click();
  await page.getByLabel("Add another topic").fill("review queues");
  await page.getByRole("button", { name: "Add topic" }).click();
  await expect(page.getByLabel("Include topic fleet dashboards")).toBeChecked();
  await expect(page.getByLabel("Include topic review queues")).toBeChecked();

  await page.getByRole("button", { name: "Continue" }).click();
  const editedText = "Edited custom question?";
  await page.locator("#ob-q-4").fill(editedText);
  await page.getByLabel("Include candidate question 5").uncheck();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Remove topic fleet dashboards" }).click();
  await expect(page.getByLabel("Include topic fleet dashboards")).toHaveCount(0);
  await expect(page.getByLabel("Include topic review queues")).not.toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.locator("textarea")).toHaveCount(4);
  await expect(page.getByText(/fleet dashboards/)).toHaveCount(0);
  await expect(page.locator("#ob-q-3")).toHaveValue(editedText);
  await expect(page.getByLabel("Include candidate question 4")).not.toBeChecked();
  expect(violations).toEqual([]);
});

async function textContrast(locator: Locator) {
  return locator.evaluate((node) => {
    const parse = (value: string) => {
      const parts = value.match(/[\d.]+/g)?.map(Number);
      if (!parts || parts.length < 3) throw new Error(`Unsupported computed color: ${value}`);
      return [parts[0], parts[1], parts[2], parts[3] ?? 1];
    };
    const luminance = (rgb: number[]) =>
      rgb
        .slice(0, 3)
        .map((channel) => {
          const s = channel / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
    const foreground = parse(getComputedStyle(node).color);
    let ancestor: Element | null = node;
    let background: number[] | undefined;
    while (ancestor) {
      const color = parse(getComputedStyle(ancestor).backgroundColor);
      if (color[3] === 1) {
        background = color;
        break;
      }
      if (color[3] !== 0) throw new Error("Contrast assertion needs an opaque or transparent background");
      ancestor = ancestor.parentElement;
    }
    if (!background) throw new Error("No opaque background found");
    const text = foreground
      .slice(0, 3)
      .map((channel, i) => channel * foreground[3] + background![i] * (1 - foreground[3]));
    const a = luminance(text);
    const b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await textContrast(locator)).toBeGreaterThanOrEqual(4.5);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const scheme of ["dark", "light"] as const) {
  test(`L: readable contrast and focus outlines in ${scheme} mode`, async ({ page }, testInfo) => {
    const project = testInfo.project.name;
    const shot = (name: string) => `.local/onboarding-shots/${name}-${project}.png`;
    const violations = await watchForForbiddenRequests(page);
    await page.emulateMedia({ colorScheme: scheme });
    await openOnboarding(page);

    const urlInput = page.getByLabel("Website address");
    await expectReadable(urlInput);
    await urlInput.focus();
    const outline = await urlInput.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
    await assertNoHorizontalOverflow(page);
    await previewSiteAndWait(page);
    await acceptAllClaims(page);

    const selectedChoices = page.locator('.ob-choice[data-selected="true"]:visible');
    const selectedCount = await selectedChoices.count();
    expect(selectedCount).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < selectedCount; i++) {
      await expectReadable(selectedChoices.nth(i));
    }

    const description = page.locator('[data-claim="description"]');
    await description.getByRole("button", { name: "Source details" }).click();
    await expectReadable(description.locator(".ob-excerpt"));
    await expectReadable(description.locator(".ob-claim-source a"));

    await description.getByRole("button", { name: "Edit" }).click();
    await expectReadable(description.locator("textarea"));
    await description.getByRole("button", { name: "Cancel edit" }).click();
    if (scheme === "dark" || project === "desktop") {
      await page.screenshot({ path: shot(`${scheme}-understanding`), fullPage: true });
    }
    await assertNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Use sample competitors" }).click();
    const compare = page.getByRole("button", { name: "Compare specific businesses" });
    await compare.click();
    await expect(compare).toHaveAttribute("data-selected", "true");
    await expectReadable(compare);
    const track = page.getByRole("button", { name: "Track competitors" });
    await track.click();
    await expect(track).toHaveAttribute("data-selected", "true");
    await expectReadable(track);
    await page.getByLabel("Include topic Running agents in isolated environments").check();
    await expectReadable(page.getByLabel("Add another topic"));
    await assertNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review your report plan" })).toBeFocused();
    const questionCards = page.locator(".ob-question");
    const questionCount = await questionCards.count();
    expect(questionCount).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < questionCount; i++) {
      await expectReadable(questionCards.nth(i).locator(".ob-label").first());
      await expectReadable(questionCards.nth(i).locator("textarea"));
    }
    const firstQuestion = questionCards.first();
    await page.getByLabel("Include candidate question 1").uncheck();
    await expect(firstQuestion).toHaveAttribute("data-selected", "false");
    await expect(firstQuestion.locator(".ob-label").first()).toHaveCSS("opacity", "1");
    await expectReadable(firstQuestion.locator(".ob-label").first());
    await page.getByLabel("Include candidate question 1").check();
    await assertNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Preview first report" }).click();

    await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();
    await expectReadable(page.locator(".ob-agent-head"));
    const agentBodyTerms = page.locator(".ob-agent-body").first().locator("dt, dd");
    for (let i = 0; i < await agentBodyTerms.count(); i++) {
      await expectReadable(agentBodyTerms.nth(i));
    }
    const tableCells = page.locator(".ob-table tbody tr:first-child > *");
    for (let i = 0; i < await tableCells.count(); i++) {
      await expectReadable(tableCells.nth(i));
    }
    await expectReadable(page.locator("[data-report-overview] .ob-report-badge"));
    const overviewText = page.locator(
      "[data-report-overview] .ob-report-meta dd, [data-report-overview] .ob-report-counts dd, .ob-report-counts-list li, .ob-report-chart figcaption, .ob-report-note, .ob-report-axis-label",
    );
    for (let i = 0; i < await overviewText.count(); i++) {
      await expectReadable(overviewText.nth(i));
    }
    const cardDecor = page.locator(
      ".ob-q-kicker, .ob-q-state, .ob-report-question-text, .ob-table-details summary, .ob-position, .ob-table .ob-none",
    );
    for (let i = 0; i < await cardDecor.count(); i++) {
      await expectReadable(cardDecor.nth(i));
    }
    if (project === "mobile") {
      const youLabels = page.locator(".ob-you-label");
      for (let i = 0; i < await youLabels.count(); i++) {
        await expectReadable(youLabels.nth(i));
      }
    }
    await page.locator(".ob-table-wrap").screenshot({ path: shot(`report-cards-${scheme}`) });
    await page.locator(".ob-hatched-bar").first().hover();
    await expectReadable(page.locator(".ob-chart-tip"));
    await page.screenshot({ path: shot(`report-showcase-${scheme}`), fullPage: true });
    if (scheme === "dark") {
      await page.screenshot({ path: shot("dark-report"), fullPage: true });
      await page.emulateMedia({ media: "print", colorScheme: scheme });
      const printReadable = page.locator(
        "[data-report-overview] .ob-report-meta dd, [data-report-overview] .ob-report-counts dd, .ob-report-note, .ob-agent-body dt, .ob-agent-body dd, .ob-table tbody td, .ob-table .ob-none, .ob-position, .ob-q-kicker, .ob-report-question-text, .ob-banner p",
      );
      for (let i = 0; i < await printReadable.count(); i++) {
        await expectReadable(printReadable.nth(i));
      }
      await page.screenshot({ path: shot("report-showcase-dark-print"), fullPage: true });
      await page.emulateMedia({ media: "screen", colorScheme: scheme });
    }
    await assertNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Review agent brief" }).click();
    const brief = page.locator("[data-brief]");
    await expect(brief).toBeVisible();
    const briefText = brief.locator("dt, dd, h2, h3, p, li");
    for (let i = 0; i < await briefText.count(); i++) {
      await expectReadable(briefText.nth(i));
    }
    expect(violations).toEqual([]);
  });
}

test("M: report overview counts, hatched chart, snapshot-matched brief and print", async ({ page }) => {
  const violations = await watchForForbiddenRequests(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __obPrinted: number };
    w.__obPrinted = 0;
    window.print = () => {
      w.__obPrinted += 1;
    };
  });
  await openOnboarding(page);
  await previewSiteAndWait(page);
  await acceptAllClaims(page);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Use sample competitors" }).click();
  await page
    .getByLabel(/Competitors/)
    .fill("Paseo\nLanes Desktop\nAn Extremely Long Competitor Name For Wrapping Validation Incorporated");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Preview first report" }).click();

  await expect(page.getByRole("heading", { name: "Your first report preview" })).toBeFocused();
  const overview = page.locator("[data-report-overview]");
  await expect(overview).toBeVisible();
  await expect(overview.getByText("Illustrative fixture report")).toBeVisible();
  await expect(overview.getByText("No live capture or collection date.")).toBeVisible();
  const countCards = overview.locator(".ob-report-counts > div");
  await expect(countCards.nth(0).locator("dd")).toHaveText("2");
  await expect(countCards.nth(1).locator("dd")).toHaveText("2");
  await expect(countCards.nth(2).locator("dd")).toHaveText("0");
  await expect(overview.locator(".ob-report-meta")).toContainText("https://codegraff.com/");
  await expect(overview.locator(".ob-report-meta")).toContainText("Open discovery");
  await expect(
    overview.getByText("Counts across available sample answers only; not market share or Google rankings."),
  ).toBeVisible();
  await expect(overview.locator(".ob-hatched-bar")).toHaveCount(3);
  await expect(
    overview.getByText("Codegraff — 2 of 2 sample answers (this business)"),
  ).toBeVisible();
  await expect(overview.getByText("Paseo — 1 of 2 sample answers")).toBeVisible();
  await expect(
    overview.getByText(
      "An Extremely Long Competitor Name For Wrapping Validation Incorporated — 0 of 2 sample answers",
    ),
  ).toBeVisible();
  await expect(
    overview.getByText("Competitors not listed here are not tracked in this preview."),
  ).toBeVisible();

  const rowHeaders = page.locator(".ob-table tbody tr > th");
  await expect(rowHeaders).toHaveCount(2);
  await expect(rowHeaders.nth(0)).toContainText(
    "Which tools let developers run multiple coding agents in one workspace?",
  );
  await expect(rowHeaders.nth(1)).toContainText(
    "Which tools give coding agents local repository context?",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download agent brief" }).click();
  const payload = JSON.parse(await readFile((await (await downloadPromise).path())!, "utf8"));
  expect(payload.questions).toHaveLength(2);
  expect(payload.questions[0].text).toBe(
    "Which tools let developers run multiple coding agents in one workspace?",
  );
  expect(payload.questions[0].illustrativeFindings).toEqual(["Paseo", "Codegraff", "Lanes Desktop"]);
  expect(payload.questions[1].illustrativeFindings).toEqual(["Codegraff", "Sample context tool"]);
  expect(payload.competitors).toEqual([
    "Paseo",
    "Lanes Desktop",
    "An Extremely Long Competitor Name For Wrapping Validation Incorporated",
  ]);

  await page.getByRole("button", { name: "Print report / Save PDF" }).click();
  expect(
    await page.evaluate(() => (window as unknown as { __obPrinted: number }).__obPrinted),
  ).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".ob-actions")).toBeHidden();
  await expect(page.locator(".ob-rail")).toBeHidden();
  await expect(page.locator(".ob-aside")).toBeHidden();
  await expect(page.locator(".ob-banner p")).toBeVisible();
  await expect(overview).toBeVisible();
  await expect(page.locator(".ob-table")).toBeVisible();
  await expect(page.getByText("Make the website’s identity clear")).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await assertNoHorizontalOverflow(page);
  expect(violations).toEqual([]);
});
