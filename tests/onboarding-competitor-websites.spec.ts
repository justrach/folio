import { expect, test, type Page } from "@playwright/test";

type Competitor = { name: string; aliases: string[]; source?: string };
const longDomain = `${"long".repeat(14)}.example.com`;
const rows = [
  { name: "Fixture Company", domain: longDomain, aliases: ["Fixture Alternate Name"], answers: 4, totalAnswers: 6, averagePosition: 1.5, isTarget: false, namedInQuestion: 0 },
  { name: "Second Company", domain: "second.example.com", aliases: ["Second Alternate Name"], answers: 2, totalAnswers: 6, averagePosition: 2, isTarget: false, namedInQuestion: 0 },
  { name: "Your Company", domain: "target.example.com", aliases: [], answers: 3, totalAnswers: 6, averagePosition: 2.5, isTarget: true, namedInQuestion: 0 },
];

async function setup(page: Page, indexed: boolean) {
  const writes: { path: string; body: unknown }[] = [];
  const unexpected: string[] = [];
  const summary = {
    state: { siteId: "fixture-site", audience: "Small teams", task: "choose software", suiteId: "fixture-suite", competitorsSavedAt: null as string | null, baselineRequestedAt: null, completedAt: null },
    site: { id: "fixture-site", name: "Your Company", url: "https://target.example.com/" },
    check: { id: "fixture-check", url: "https://target.example.com/", host: "target.example.com", createdAt: "2026-09-13T00:00:00Z", seoScore: 80, scoredChecks: 10, fixes: [], suggestion: { audience: "Small teams", task: "choose software" }, competitors: { category: indexed ? "Fixture software" : null, questions: 2, totalAnswers: 6, rows: indexed ? rows : [] } },
    suite: { id: "fixture-suite", cases: [{ id: "fixture-question", query: "Which software should a small team choose?" }] },
    competitors: [] as Competitor[],
  };
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      const body = request.postDataJSON();
      writes.push({ path, body });
      if (path === "/api/competitors" && request.method() === "PUT") {
        summary.competitors = body.competitors;
        summary.state.competitorsSavedAt = "2026-09-13T00:00:00Z";
        return route.fulfill({ json: { competitors: summary.competitors } });
      }
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 400, json: { error: "Unexpected fixture write" } });
    }
    if (path === "/api/auth/get-session") return route.fulfill({ json: { user: { id: "fixture-owner", name: "Fixture", email: "fixture@example.test", emailVerified: true }, session: { id: "fixture-session", userId: "fixture-owner", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (path === "/api/onboarding") return route.fulfill({ json: summary });
    if (path === "/api/search-console" || path === "/api/github") return route.fulfill({ json: { configured: false, connected: false } });
    if (path === "/api/benchmarks") return route.fulfill({ json: { access: { canRun: false, message: "Fixture: runs disabled" } } });
    unexpected.push(`GET ${path}`);
    return route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/start?step=6");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(indexed ? "Here is who AI already recommends." : "Who do you want to watch?");
  return { writes, unexpected };
}

async function expectWebsiteOnly(page: Page) {
  await expect(page.locator(".ob-side")).not.toContainText(/also matches|also listed as|Fixture Alternate Name|Second Alternate Name|Manual Alternate Name/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test("Step 6 shows indexed websites, keeps counts and saves keyboard selections without paid work", async ({ page }) => {
  const { writes, unexpected } = await setup(page, true);
  await expect(page.getByText(longDomain, { exact: true })).toBeVisible();
  await expect(page.getByText("target.example.com", { exact: true })).toBeVisible();
  await expect(page.getByText("4 of 6 answers", { exact: true })).toBeVisible();
  await expect(page.getByText("1.5", { exact: true })).toBeVisible();
  await expectWebsiteOnly(page);
  const second = page.getByRole("checkbox", { name: "Track Second Company", exact: true });
  await second.focus();
  await page.keyboard.press("Space");
  await expect(second).not.toBeChecked();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Track 1 competitor", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ask AI your 1 question now.");
  expect(writes).toEqual([{ path: "/api/competitors", body: { siteId: "fixture-site", competitors: [{ name: "Fixture Company", aliases: ["Fixture Alternate Name"], source: "public-index" }] } }]);
  await page.goto("/start?step=6");
  await expect(page.getByRole("checkbox", { name: "Track Fixture Company", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Track Second Company", exact: true })).toHaveCount(0);
  await expect(page.getByText(longDomain, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(longDomain, { exact: true })).toBeVisible();
  await expectWebsiteOnly(page);
  expect(writes).toHaveLength(1);
  expect(unexpected).toEqual([]);
});

test("Step 6 starter and manual rows show website domains instead of alias lists", async ({ page }) => {
  const { writes, unexpected } = await setup(page, false);
  await page.getByRole("button", { name: /^Authentication/ }).click();
  await expect(page.getByText("supabase.com", { exact: true })).toBeVisible();
  await expect(page.locator(".ob-tbl")).not.toContainText("Supabase Auth");
  await page.getByRole("button", { name: "Add another", exact: true }).click();
  await page.getByLabel("Company name", { exact: true }).fill("Manual Company");
  await page.getByLabel("Other names (optional)").fill("Manual Alternate Name, https://www.manual.example.com/about");
  await expect(page.locator(".ob-ghost .ob-website")).toHaveText("manual.example.com");
  await expectWebsiteOnly(page);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const manual = page.getByRole("row").filter({ has: page.getByText("Manual Company", { exact: true }) });
  await expect(manual.locator(".ob-website")).toHaveText("manual.example.com");
  await expect(page.getByRole("checkbox", { name: "Track Manual Company", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Add another", exact: true }).click();
  await page.getByLabel("Company name", { exact: true }).fill("No Website Company");
  await page.getByLabel("Other names (optional)").fill("Only Another Name");
  await expect(page.locator(".ob-ghost .ob-website")).toHaveText("Website not provided");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("row").filter({ has: page.getByText("No Website Company", { exact: true }) }).locator(".ob-website")).toHaveText("Website not provided");
  await expect(page.locator(".ob-tbl")).not.toContainText("Only Another Name");
  await expectWebsiteOnly(page);
  expect(writes).toEqual([]);
  expect(unexpected).toEqual([]);
});
