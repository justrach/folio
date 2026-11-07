import { expect, test } from "@playwright/test";
import { evaluationMethodology } from "../src/lib/evaluation";
import { EVAL_SUITE } from "../src/lib/evals";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { PUBLIC_SEARCH_QUERIES, PUBLIC_SEARCH_OBSERVATIONS, PUBLIC_SEARCH_PROGRESS } from "../src/lib/public-search-rankings";

const paths = ["/", "/overview", "/overview?view=workspace", "/overview?view=demo", "/websites", "/visibility", "/seo", "/patches", "/search-data", "/search-console", "/evaluations", "/evaluations?view=page", "/benchmarks", "/agents", "/leaderboard", "/leaderboard?indexView=html", "/leaderboard?indexView=published", "/pricing", "/settings", "/login?next=%2Foverview%3Fview%3Dworkspace", "/privacy", "/start", "/docs/api", "/hackathon"];
const connection = { configured: false, authorized: false, canRun: false, allowedTargets: [], maxRunsPerDay: 5, maxActiveRuns: 1, message: "Layout fixture: provider work disabled." };
const publicData = buildPublicDashboard({ format: "folio-public-search-rankings-v1", queries: PUBLIC_SEARCH_QUERIES, observations: PUBLIC_SEARCH_OBSERVATIONS }, PUBLIC_SEARCH_PROGRESS);

for (const signedIn of [false, true]) test(`route styles: ${signedIn ? "empty private workspace fixture" : "signed out"}`, async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [], writes: string[] = [], findings: string[] = [];
  let pending = 0;
  page.on("pageerror", error => errors.push(`${new URL(page.url()).pathname}: ${error.message}`));
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith("/api/")) return route.fallback();
    pending++;
    try {
      if (route.request().method() !== "GET") { writes.push(path); return await route.fulfill({ status: 403, json: { error: "Layout audit blocks writes." } }); }
      const user = { id: "style-audit-owner", name: "Layout audit", email: "layout@example.test", emailVerified: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
      let json: unknown = { ...connection, sites: [], scans: [], runs: [], reports: [], keys: [], suites: [], templates: [], models: [], cases: [], access: connection, usage: { attemptsLast24Hours: 0, activeRuns: 0, remainingRuns: 0, remainingActiveRuns: 0 } };
      if (path === "/api/auth/get-session") json = signedIn ? { user, session: { id: "layout-session", userId: user.id, token: "fixture", expiresAt: "2099-01-01T00:00:00Z" } } : null;
      if (path === "/api/public/benchmarks") json = publicData;
      if (path === "/api/leaderboard") json = { sites: [{ id: "layout-public-fixture", name: "Layout fixture website", url: "https://layout.example.test/", score: 82, rank: 1, scannedAt: "2026-09-18T00:00:00Z", evaluationVersion: evaluationMethodology.version, source: "published-scan" }], methodology: evaluationMethodology, generatedAt: "2026-09-18T00:00:00Z" };
      if (path === "/api/costs") json = { groups: [], recent: [], recentLimit: 20 };
      if (path === "/api/evaluations") json = { runs: [], suite: EVAL_SUITE, connection };
      if (path === "/api/search-console" || path === "/api/github") json = { configured: false, signedIn, connected: false };
      return await route.fulfill({ json });
    } finally { pending--; }
  });
  for (const path of paths) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect.poll(() => pending).toBe(0);
      await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
      const issues = await page.evaluate(() => {
        const issues: string[] = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`overflow ${document.documentElement.scrollWidth}/${innerWidth}`);
        for (const node of document.querySelectorAll("select")) {
          const box = node.getBoundingClientRect(), style = getComputedStyle(node);
          if (box.width > 2 && box.height > 2 && style.visibility !== "hidden" && style.display !== "none") issues.push(`native dropdown ${node.getAttribute("aria-label") ?? node.id}`);
        }
        return issues;
      });
      findings.push(...issues.map(issue => `${path}: ${issue}`));
      await page.screenshot({ path: info.outputPath(`${path.replace(/[^a-z0-9]/gi,"_") || "home"}-opening.png`), fullPage: false });
      if (info.project.name === "mobile") {
        const original = page.viewportSize()!;
        await page.setViewportSize({ width: 320, height: 780 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) findings.push(`${path}: overflow at 320px`);
        await page.setViewportSize(original);
      }
      if (path === "/leaderboard?indexView=published") await expect(page.getByRole("link", { name: /Layout fixture website/ })).toBeVisible();
      const controls = page.getByRole("combobox");
      for (let index = 0; index < await controls.count(); index++) {
        const control = controls.nth(index);
        if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
        await control.click();
        const menu = page.getByRole("listbox");
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        if (box.x < -1 || box.x + box.width > (page.viewportSize()?.width ?? 1440) + 1) findings.push(`${path}: dropdown outside viewport`);
        if (await menu.evaluate(node => node.scrollWidth > node.clientWidth + 1)) findings.push(`${path}: option overflow`);
        await page.keyboard.press("Escape");
        await expect(control).toBeFocused();
      }
      await page.screenshot({ path: info.outputPath(`${path.replace(/[^a-z0-9]/gi,"_") || "home"}.png`), fullPage: false });
    });
  }
  await info.attach("route-style-findings", { body: JSON.stringify({ paths, signedIn, findings, errors, writes }, null, 2), contentType: "application/json" });
  expect(findings).toEqual([]); expect(errors).toEqual([]); expect(writes).toEqual([]);
});
