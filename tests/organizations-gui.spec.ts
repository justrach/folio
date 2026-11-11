import { expect, test, type Page } from "@playwright/test";

const at = "2026-11-11T08:00:00.000Z";
const token = `folio_join_${"ab".repeat(24)}`;
const member = (userId: string, name: string, role: "owner" | "member", you: boolean, agents: { name: string; lastUsedAt: string | null }[] = []) =>
  ({ userId, name, email: `${userId}@example.test`, role, joinedAt: at, you, agents: agents.map(agent => ({ ...agent, scopes: ["read"], expiresAt: "2026-12-11T08:00:00.000Z" })) });
// Illustrative report in the shape folio_website_gaps returns.
const report = { website: { id: "site-manus", name: "manus.im", url: "https://manus.im/", domain: "manus.im", access: "owner", organizations: [{ id: "org-1", name: "Manus" }] }, generatedAt: at,
  summary: "Google sends manus.im most of its search visits through searches for its own name.", search: { state: "measured", reportId: "seo", fetchedAt: at,
    backlinks: { state: "value", value: 10 }, referringDomains: { state: "value", value: 5 }, brokenBacklinks: 0, rankingKeywords: { state: "value", value: 50 }, estimatedMonthlyVisits: { state: "value", value: 90 } },
  google: { state: "none_tracked", capturedAt: null, tracked: 0, bands: { top3: 0, page1: 0, page2: 0, deeper: 0 }, brandTerms: ["manus"], brandTrafficShare: null, searches: [] },
  aiAnswers: { source: "live-published-data", publishedQuestions: 291, namedIn: 0, citedIn: 0, bestPosition: null, answers: [], related: { total: 0, published: 0, matchedTerms: [], categories: [], items: [] }, yourQuestions: { completed: 0, named: 0 } },
  crawl: { state: "not_in_index", pagesCrawled: 0, inventoryPages: null, lastFetchedAt: null, topSections: [] },
  gaps: [{ id: "google-brand-dependence", area: "google", severity: "medium", title: "Most Google visits come from its own name", finding: "Fixture finding.", nextStep: "Fixture step.", evidence: [] }], notChecked: [], howToRead: "Fixture." };

/** Organization writes only; product analytics events are not part of these flows. */
const orgPosts = (state: { posts: Record<string, unknown>[] }) => state.posts.filter(post => String(post.path).startsWith("/api/organizations"));

async function setup(page: Page, options: { signedIn?: boolean; organizations?: boolean } = {}) {
  const state = { posts: [] as Record<string, unknown>[], created: false, joined: false };
  const detail = () => ({ id: "org-1", name: "Manus", createdAt: at, yourRole: "owner",
    members: [member("rach", "Rach Pradhan", "owner", true, [{ name: "Rach's Claude Code", lastUsedAt: at }]), ...(state.joined ? [member("avery", "Avery Chen", "member", false)] : [])],
    websites: [{ websiteId: "site-manus", name: "manus.im", url: "https://manus.im/", domain: "manus.im", sharedBy: { userId: "rach", name: "Rach Pradhan" }, sharedAt: at, canUnshare: true }],
    invites: [], shareable: [{ websiteId: "site-folio", name: "usefolio.site", url: "https://usefolio.site/" }],
    activity: [{ memberName: "Rach Pradhan", agentName: "Rach's Claude Code", tool: "website", summary: "Read what manus.im is missing: 1 gap, 0 not checked yet.", domain: "manus.im", at }] });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), method = route.request().method(), body = method === "POST" ? route.request().postDataJSON() as Record<string, unknown> : null;
    if (body) state.posts.push({ path: url.pathname, ...body });
    if (url.pathname === "/api/auth/get-session") return route.fulfill({ json: options.signedIn === false ? null : { user: { id: "rach", name: "Rach Pradhan", email: "rach@example.test", emailVerified: true }, session: { id: "s", userId: "rach", expiresAt: "2099-01-01T00:00:00Z" } } });
    if (url.pathname === "/api/organizations" && method === "GET") return route.fulfill({ json: { organizations: options.organizations || state.created || state.joined ? [{ id: "org-1", name: "Manus", role: "owner", members: 1, websites: 1, createdAt: at }] : [] } });
    if (url.pathname === "/api/organizations" && method === "POST") { state.created = true; return route.fulfill({ status: 201, json: { organization: { id: "org-1", name: body!.name, role: "owner", members: 1, websites: 0, createdAt: at } } }); }
    if (url.pathname === "/api/organizations/invites") {
      if (body!.action === "preview") return route.fulfill({ json: { invite: { organization: { id: "org-1", name: "Manus", members: 3 }, invitedBy: "Rach Pradhan", expiresAt: at, alreadyMember: false } } });
      state.joined = true; return route.fulfill({ json: { organizationId: "org-1", joined: true } });
    }
    if (url.pathname === "/api/organizations/org-1") {
      if (body?.action === "invite") return route.fulfill({ json: { token, invite: { id: "invite-1", createdAt: at, expiresAt: at, uses: 0, maxUses: 25, createdBy: null }, organization: { ...detail(), invites: [{ id: "invite-1", createdAt: at, expiresAt: at, uses: 0, maxUses: 25, createdBy: "Rach Pradhan" }] } } });
      return route.fulfill({ json: { organization: detail() } });
    }
    if (url.pathname === "/api/sites/site-manus/visibility") return route.fulfill({ json: { report } });
    if (method !== "GET") return route.fulfill({ status: 403, json: { error: { message: "Unplanned write in a browser fixture." } } });
    return route.fulfill({ json: {} });
  });
  return state;
}

test("an invite link survives sign-in without reaching a server, and nothing happens until the person joins", async ({ page }) => {
  const state = await setup(page, { signedIn: false });
  await page.goto(`/orgs#join=${token}`);
  const card = page.getByRole("region", { name: "Organizations" });
  await expect(card).toContainText("You’ve been invited to an organization");
  await expect(card.getByRole("link", { name: "Sign in to continue" })).toHaveAttribute("href", "/login?next=/orgs");
  await expect(page).toHaveURL(/\/orgs$/);
  expect(await page.evaluate(() => sessionStorage.getItem("folio-pending-invite"))).toMatch(/^folio_join_/);
  expect(orgPosts(state)).toEqual([]);
});

test("someone with no organization creates one, sees agent onboarding, invites people and reads a shared website", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/orgs");
  const start = page.getByRole("region", { name: "Start an organization" });
  await start.getByLabel("Organization name").fill("Manus");
  await start.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: "Manus", level: 2 })).toBeVisible();
  expect(state.posts).toContainEqual({ path: "/api/organizations", name: "Manus" });

  const onboard = page.getByRole("region", { name: "Connect your agent" });
  await expect(onboard.locator("pre").first()).toContainText("/api/mcp");
  await expect(onboard.locator("pre").first()).toContainText("Bearer ${FOLIO_API_KEY}");
  await expect(onboard).toContainText("You have 1 active key: Rach's Claude Code.");
  await expect(onboard.locator("blockquote")).toContainText("folio_website_gaps for manus.im");
  await expect(onboard.getByRole("link", { name: "Create a key" })).toHaveAttribute("href", "/docs/api#api-keys");

  const members = page.getByRole("region", { name: "Members and their agents" });
  await expect(members.getByRole("list", { name: "Rach Pradhan's agents" })).toContainText("Rach's Claude Code");
  await expect(page.getByRole("region", { name: "What the team’s agents read" })).toContainText("Read what manus.im is missing");

  const invites = page.getByRole("region", { name: "Invite people" });
  await invites.getByRole("button", { name: "Create invite link" }).click();
  await expect(invites.getByLabel("New invite link · shown once")).toHaveValue(new RegExp(`/orgs#join=${token}$`));
  await expect(invites).toContainText("0 of 25 used");

  const sites = page.getByRole("region", { name: "Shared websites" });
  await expect(sites.getByRole("region", { name: "Where manus.im shows up" })).toContainText("most of its search visits");
  await sites.getByRole("button", { name: "Hide report" }).click();
  await expect(sites.getByRole("region", { name: "Where manus.im shows up" })).toHaveCount(0);
  expect(orgPosts(state).map(post => post.action ?? post.name)).toEqual(["Manus", "invite"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
});

test("a pasted invite link previews the organization and joins only after the person confirms", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/orgs");
  await page.getByRole("region", { name: "Start an organization" }).getByLabel("Paste an invite link").fill(`Join us: https://usefolio.site/orgs#join=${token}`);
  await page.getByRole("button", { name: "Continue" }).click();
  const invitation = page.getByRole("region", { name: "Invitation" });
  await expect(invitation).toContainText("Join Manus");
  await expect(invitation).toContainText("Rach Pradhan invited you. 3 members.");
  // Development runs effects twice; previews are reads. Nothing joins before the click.
  expect(new Set(orgPosts(state).map(post => post.action))).toEqual(new Set(["preview"]));
  await invitation.getByRole("button", { name: "Join organization" }).click();
  await expect(page.getByRole("heading", { name: "Manus", level: 2 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Members and their agents" })).toContainText("Avery Chen");
  expect(orgPosts(state).filter(post => post.action === "accept")).toHaveLength(1);
  expect(orgPosts(state).at(-1)?.action).toBe("accept");
  expect(state.posts.every(post => post.token === undefined || post.token === token)).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem("folio-pending-invite"))).toBeNull();
});
