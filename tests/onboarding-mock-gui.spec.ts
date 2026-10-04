import { expect, test, type Page } from "@playwright/test";
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
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review your report plan" })).toBeFocused();
  await expect(page.locator("textarea")).toHaveCount(3);
  await page.getByRole("button", { name: "Preview first report" }).click();

  await expect(page.getByText("Illustrative AI-answer order, not Google rankings")).toBeVisible();
  const rows = page.locator(".ob-table tbody tr");
  await expect(rows).toHaveCount(2);
  const workspaceRow = rows.first();
  await expect(workspaceRow).toContainText("Which tools let developers run multiple coding agents in one workspace?");
  await expect(workspaceRow.getByRole("cell").nth(0)).toContainText("Sample position 2");
  await expect(workspaceRow.getByRole("cell").nth(1)).toContainText("Sample position 1");
  await expect(workspaceRow.getByRole("cell").nth(2)).toContainText("Sample position 3");
  const contextRow = rows.nth(1);
  await expect(contextRow.getByRole("cell").nth(0)).toContainText("Sample position 1");
  await expect(contextRow.getByRole("cell").nth(1)).toContainText("Not included in sample");
  await assertMobileRowLayout(page, isMobile);
  await page.getByText("Data provenance").first().click();
  await expect(page.getByText(/static demo fixture data/).first()).toBeVisible();
  await page.getByText("Related evidence").first().click();
  await expect(page.getByText(/not the same measurement/).first()).toBeVisible();
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
