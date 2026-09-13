import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { evaluationMethodology } from "../src/lib/evaluation";

const routes = [
  {
    path: "/overview",
    label: /^Overview$/,
    heading: "Overview",
  },
  {
    path: "/websites",
    label: /^My websites$/,
    heading: "Good things start with a website.",
  },
  {
    path: "/visibility",
    label: /^AI visibility$/,
    heading: "Be the name that comes up.",
  },
  {
    path: "/seo",
    label: /^SEO health$/,
    heading: "A stronger foundation for discovery.",
  },
  {
    path: "/patches",
    label: /^Patch studio/,
    heading: "From insight to improvement.",
  },
  {
    path: "/leaderboard",
    label: /^The Folio Index$/,
    heading: "The Folio Index",
  },
  {
    path: "/agents",
    label: /^Your agents$/,
    heading: "A little intelligence. A lot of clarity.",
  },
  {
    path: "/settings",
    label: /^Settings & connections$/,
    heading: "Your workspace, connected.",
  },
  {
    path: "/search-data",
    label: /^Search & backlinks$/,
    heading: "The bigger picture behind your search.",
  },
];

async function noPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(
    dimensions.document,
    `Document overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(
    dimensions.body,
    `Body overflow: ${JSON.stringify(dimensions)}`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function navigate(page: Page, route: (typeof routes)[number]) {
  const link = page.locator(".nav-link").filter({ hasText: route.label });
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${route.path}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: route.heading, exact: true }),
  ).toBeVisible();
  await expect(link).toHaveClass(/active/);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

function trackRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.request().resourceType() === "script" &&
      response.status() >= 400
    ) {
      errors.push(
        `Script failed with ${response.status()}: ${new URL(response.url()).pathname}`,
      );
    }
  });
  return errors;
}

test("landing opens the working dashboard", async ({ page }, testInfo) => {
  const runtimeErrors = trackRuntimeErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noPageOverflow(page);
  await screenshot(page, testInfo, "landing");
  await page.locator('a[href="/overview"]').first().click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(
    page.getByRole("heading", { name: routes[0].heading, exact: true }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("all navigation pages work without layout overflow or runtime errors", async ({
  page,
}, testInfo) => {
  const runtimeErrors = trackRuntimeErrors(page);
  await page.goto("/overview");
  for (const route of [...routes.slice(1), routes[0]]) {
    await test.step(`Navigate to ${route.path}`, async () => {
      await navigate(page, route);
      await noPageOverflow(page);
    });
  }
  await screenshot(page, testInfo, "overview");
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back.", exact: true }),
  ).toBeVisible();
  await noPageOverflow(page);
  expect(runtimeErrors).toEqual([]);
});

test("audit, methodology, and search dialogs support keyboard dismissal and navigation", async ({
  page,
}) => {
  await page.goto("/overview");
  await page.getByRole("button", { name: "Run an audit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Website URL", { exact: true })).toHaveValue(
    "https://example.com",
  );
  await expect(
    page.getByRole("link", { name: "Sign in to save your audit" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Methodology", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Technical health", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder("Search pages, tools, or reports…")
    .fill("patch");
  await expect(dialog.getByRole("link")).toHaveCount(1);
  await dialog.getByRole("link", { name: "Patch studio", exact: true }).click();
  await expect(page).toHaveURL(/\/patches$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("leaderboard filters, metric sorting, search, and evaluation drill-down work", async ({
  page,
}, testInfo) => {
  await page.goto("/leaderboard");
  await page.getByRole("button", {name:"Explore sample rankings",exact:true}).click();
  const rows = page.locator(".ranking-table tbody tr");
  await expect(rows).toHaveCount(12);
  await page.getByLabel("Filter by industry").selectOption("Developer tools");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Vercel");
  await expect(rows.last()).toContainText("Resend");

  await page
    .getByLabel("Search websites", { exact: true })
    .fill("missing-website-123");
  await expect(rows).toHaveCount(0);
  await expect(
    page.getByText("No websites match your search.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search websites", { exact: true }).clear();
  await page.getByLabel("Filter by industry").selectOption("All industries");
  await page.getByRole("button", { name: "Discovery", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "DISCOVERY", exact: true }),
  ).toBeVisible();
  await expect(rows.first()).toContainText("Notion");
  await expect(rows.first().locator(".score-cell")).toContainText("89");

  await page
    .getByRole("button", { name: "View Vercel evaluation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: "Vercel, in perspective.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog).toContainText("illustrative scores");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "SEO health", exact: true }).click();
  await page.getByLabel("Search websites", { exact: true }).fill("notion");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".score-cell")).toContainText("96");
  await expect(page.locator(".rank-column")).toHaveCount(1);
  await page.getByLabel("Search websites", { exact: true }).clear();
  await noPageOverflow(page);
  await screenshot(page, testInfo, "leaderboard");
});

test("patch approval gates a ZIP download containing the reviewed suggestion", async ({
  page,
}) => {
  await page.goto("/patches");
  const downloadButton = page.getByRole("button", {
    name: /^Download .*approved$/,
  });
  await expect(downloadButton).toBeDisabled();
  await expect(
    page.getByText("Suggested version", { exact: true }),
  ).toBeVisible();
  const suggestion = await page.locator(".after-code").innerText();
  await page
    .getByRole("button", { name: "Approve this change", exact: true })
    .click();
  await expect(downloadButton).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Approved · undo", exact: true }),
  ).toBeVisible();
  const pendingDownload = page.waitForEvent("download");
  await downloadButton.click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("folio-reviewed-patches.zip");
  const path = await download.path();
  expect(path).not.toBeNull();
  const archive = await JSZip.loadAsync(await readFile(path!));
  const files = Object.values(archive.files).filter((file) => !file.dir);
  expect(files).toHaveLength(2);
  expect(await archive.file("README.txt")!.async("string")).toMatch(
    /not been applied/i,
  );
  const patchFile = files.find((file) => file.name !== "README.txt")!;
  expect(await patchFile.async("string")).toBe(suggestion);
  await page
    .getByRole("button", { name: "Approved · undo", exact: true })
    .click();
  await expect(downloadButton).toBeDisabled();
});

test("published audits stay separate from sample rankings through filtering and errors", async ({
  page,
}) => {
  let responseMode: "populated" | "error" | "empty" = "populated";
  const published = {
    id: "gui-published-fixture",
    url: "https://example.com/",
    name: "GUI published page",
    score: 82,
    rank: 1,
    scannedAt: "2026-09-13T01:00:00.000Z",
    evaluationVersion: evaluationMethodology.version,
    source: "published-scan",
  };
  await page.route("**/api/leaderboard", async (route) => {
    await route.fulfill({
      status: responseMode === "error" ? 503 : 200,
      json: {
        sites: responseMode === "populated" ? [published] : [],
        methodology: evaluationMethodology,
        generatedAt: "2026-09-13T01:05:00.000Z",
        ...(responseMode === "error"
          ? { error: "GUI fixture: temporary index failure." }
          : {}),
      },
    });
  });
  await page.goto("/leaderboard");
  await page.getByRole("button", { name: "Explore sample rankings", exact: true }).click();
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(12);
  await page
    .getByRole("button", { name: "Published page audits", exact: true })
    .click();
  const index = page.getByRole("region", {
    name: "The public technical index.",
    exact: true,
  });
  await expect(index).toBeVisible();
  await expect(index.locator("tbody tr")).toHaveCount(1);
  await expect(index).toContainText("GUI published page");
  await expect(index).not.toContainText("Notion");
  await index
    .getByLabel("Search published pages", { exact: true })
    .fill("missing-page");
  await expect(index.locator("tbody tr")).toHaveCount(0);
  await expect(index.getByText(/No published pages match/)).toBeVisible();
  await index.getByLabel("Search published pages", { exact: true }).clear();
  await index.locator("summary").click();
  await expect(
    index.getByRole("heading", { name: "Website readiness", exact: true }),
  ).toBeVisible();
  await noPageOverflow(page);

  responseMode = "error";
  await index
    .getByRole("button", { name: "Refresh published index", exact: true })
    .click();
  await expect(index.getByRole("alert")).toHaveText(
    "GUI fixture: temporary index failure.",
  );
  await expect(index.locator("tbody tr")).toHaveCount(0);
  await expect(page.locator(".ranking-table-panel")).toHaveCount(0);
  responseMode = "empty";
  await index
    .getByRole("button", { name: "Try loading again", exact: true })
    .click();
  await expect(
    index.getByRole("heading", {
      name: "No page audits published yet.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Explore sample rankings", exact: true })
    .click();
  await expect(page.locator(".ranking-table tbody tr")).toHaveCount(12);
});

test("overview chart controls and report export remain usable", async ({
  page,
}) => {
  await page.goto("/overview?view=demo");
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "7d", exact: true }),
  ).toHaveClass(/active/);
  const compare = page.getByRole("checkbox", {
    name: "Compare to industry",
    exact: true,
  });
  await compare.uncheck();
  await expect(compare).not.toBeChecked();
  await expect(page.locator(".chart-legend")).not.toContainText(
    "Industry average",
  );
  await compare.check();
  await expect(page.locator(".chart-legend")).toContainText("Industry average");
  const pendingDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("folio-report.json");
  const report = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(report.source).toMatch(/sample/i);
  expect(report.checks.length).toBeGreaterThan(0);
});

test("search data connection states never start an automatic paid lookup", async ({
  page,
}, testInfo) => {
  let statusMode: "setup" | "restricted" | "error" = "setup";
  let paidRequests = 0;
  await page.route("**/api/seo-data", async (route) => {
    if (route.request().method() === "POST") {
      paidRequests += 1;
      await route.fulfill({
        status: 403,
        json: { error: "Paid requests are disabled in GUI tests." },
      });
      return;
    }
    await route.fulfill({
      status: statusMode === "error" ? 503 : 200,
      json:
        statusMode === "error"
          ? { error: "GUI fixture: access status unavailable." }
          : {
              configured: statusMode === "restricted",
              authorized: false,
              reason: "GUI fixture: this account cannot start a paid lookup.",
            },
    });
  });
  await page.goto("/search-data");
  await expect(
    page.getByRole("heading", {
      name: "Search and backlinks",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Sign in to save and update private website reports.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to continue", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Website domain", { exact: true }).fill("example.com");
  await expect(
    page.getByRole("button", { name: "Update website data", exact: true }),
  ).toBeDisabled();
  statusMode = "restricted";
  await page.getByRole("button", { name: "Check availability", exact: true }).click();
  await expect(
    page.getByText("Sign in to save and update private website reports.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update website data", exact: true }),
  ).toBeDisabled();
  await screenshot(page, testInfo, "search-data");
  statusMode = "error";
  await page.getByRole("button", { name: "Check availability", exact: true }).click();
  await expect(page.getByRole("region", {name:"Website data availability"}).getByRole("alert")).toHaveText(
    "Website data availability could not be checked. Saved reports may still be available.",
  );
  await expect(
    page.getByRole("heading", {
      name: "See how your website is found.",
      exact: true,
    }),
  ).toBeVisible();
  await noPageOverflow(page);
  expect(paidRequests).toBe(0);
});

test("real signup, simulated scan history, and logout protect account data", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "mobile",
    "Real auth is covered once; shared desktop/mobile tests cover all navigation and dialogs.",
  );
  // Scanner/publication endpoints are simulated; Better Auth and its D1 session are real.
  // Network capture, persistence, and authorization are covered by separate integration checks.
  const scans: object[] = [];
  const audit = {
    id: randomUUID(),
    url: "https://example.com/",
    createdAt: new Date().toISOString(),
    seoScore: 45,
    title: "GUI fixture audit",
    description: "Deterministic browser test fixture",
    wordCount: 27,
    checks: [
      {
        id: "title",
        label: "Page title",
        status: "pass",
        detail: "GUI fixture evidence: page title captured.",
        points: 15,
        maxPoints: 15,
      },
    ],
    patches: [
      {
        id: "fixture-description",
        title: "Review the captured description",
        target: "/index.html",
        type: "html",
        before: "No description",
        after: '<meta name="description" content="Reviewed browser fixture">',
        reason: "A browser-test fixture for the review workflow.",
      },
    ],
  };
  await page.route("**/api/scans", async (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().url).toBe("https://example.com");
      scans.push(audit);
      await route.fulfill({ status: 201, json: audit });
    } else await route.fulfill({ status: 200, json: { scans } });
  });
  const ownedSite = {
    id: randomUUID(),
    url: audit.url,
    name: "GUI private page",
    isPublic: false,
    seoScore: audit.seoScore,
    lastScannedAt: audit.createdAt,
  };
  await page.route("**/api/sites", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      expect(body.id).toBe(ownedSite.id);
      expect(typeof body.isPublic).toBe("boolean");
      ownedSite.isPublic = body.isPublic;
      await route.fulfill({ status: 200, json: { site: ownedSite } });
    } else
      await route.fulfill({
        status: 200,
        json: { sites: scans.length ? [ownedSite] : [] },
      });
  });
  const email = `gui-${randomUUID()}@example.test`;
  const password = randomBytes(20).toString("hex");
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await page
    .getByLabel("Your name", { exact: true })
    .fill("GUI Navigation Test");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "10",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create your account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/websites$/);
  await expect(page.locator(".profile")).toContainText(email);
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Run an audit", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Run website audit", exact: true })
    .click();
  await expect(page).toHaveURL(/\/seo$/);
  await expect(
    page.getByText("GUI fixture evidence: page title captured.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".score-ring")).toContainText("45");

  await navigate(page, routes[1]);
  await page.reload();
  await expect(page.locator(".audit-history button")).toHaveCount(1);
  const publication = page.getByRole("region", {
    name: "Choose what you publish.",
    exact: true,
  });
  await expect(
    publication.getByText("Not published", { exact: true }),
  ).toBeVisible();
  await publication
    .getByRole("button", {
      name: "Publish audits for GUI private page",
      exact: true,
    })
    .click();
  await expect(
    publication.getByText("Publication enabled", { exact: true }),
  ).toBeVisible();
  await publication
    .getByRole("button", {
      name: "Remove audits from index for GUI private page",
      exact: true,
    })
    .click();
  await expect(
    publication.getByText("Not published", { exact: true }),
  ).toBeVisible();
  await page.locator(".audit-history button").click();
  await expect(page).toHaveURL(/\/seo$/);
  await expect(
    page.getByText("GUI fixture evidence: page title captured.", {
      exact: true,
    }),
  ).toBeVisible();
  await navigate(page, routes[7]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in with Better Auth" }),
  ).toBeVisible();
  await navigate(page, routes[1]);
  await expect(page.locator(".audit-history button")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Sign in to begin" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Sign in to begin" }).click();
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/websites$/);
  await expect(page.locator(".profile")).toContainText(email);
  await navigate(page, routes[7]);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Sign in with Better Auth" }),
  ).toBeVisible();
});
