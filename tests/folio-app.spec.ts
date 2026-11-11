import { expect, test, type Page } from "@playwright/test";
import { buildSync } from "esbuild";
import { FOLIO_APP_HTML } from "../src/lib/folio-app";

// The official MCP Apps host bridge (@modelcontextprotocol/ext-apps), bundled for the page. It validates every
// message the app sends against the spec's schemas, so this checks Folio's page against a real host implementation.
const bridgeBundle = buildSync({ stdin: { contents: 'export { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";', resolveDir: process.cwd() },
  bundle: true, format: "iife", globalName: "AppsHost", platform: "browser", write: false, logLevel: "silent" }).outputFiles[0].text;

const at = "2026-11-10T00:00:00.000Z";
const found = (q: string | null) => ({ query: q, truncated: false, note: "Fixture.", items: q === "zzz" ? [] : [
  { kind: "website", title: "manus.im", detail: "Your website", url: "https://usefolio.site/websites?site=site-manus", websiteId: "site-manus", organizationId: null, reportId: null },
  { kind: "organization", title: "Manus", detail: "Organization · owner · 2 members · shares manus.im", url: "https://usefolio.site/orgs?org=org-1", websiteId: null, organizationId: "org-1", reportId: null },
  { kind: "seo-report", title: "manus.im", detail: "Search & backlinks report · Nov 10, 2026", url: "https://usefolio.site/search-data?report=seo-1", websiteId: null, organizationId: null, reportId: "seo-1" },
] });
// Illustrative report in the shape folio_website_gaps returns. The second gap carries markup that must stay text.
const report = { website: { id: "site-manus", name: "manus.im", url: "https://manus.im/", domain: "manus.im", access: "owner", organizations: [] }, generatedAt: at,
  summary: "Google sends manus.im most of its search visits through searches for its own name.",
  search: { state: "measured", reportId: "seo-1", fetchedAt: at, backlinks: { state: "value", value: 1470000 }, referringDomains: { state: "value", value: 14634 }, brokenBacklinks: 1099,
    rankingKeywords: { state: "value", value: 10584 }, estimatedMonthlyVisits: { state: "value", value: 62748 } },
  google: { state: "tracked", capturedAt: at, tracked: 3, bands: { top3: 1, page1: 0, page2: 1, deeper: 1 }, brandTerms: ["manus"], brandTrafficShare: 0.8, searches: [
    { keyword: "manus", position: 1, band: "top3", searchVolume: 450000, estimatedTraffic: 40000, landingPage: "https://manus.im/", brand: true },
    { keyword: "ai image generator", position: 20, band: "page2", searchVolume: 823000, estimatedTraffic: 900, landingPage: "https://manus.im/tools/image", brand: false } ] },
  aiAnswers: { source: "live-published-data", publishedQuestions: 291, namedIn: 0, citedIn: 0, bestPosition: null, answers: [], related: { total: 100, published: 0, matchedTerms: ["manus"], categories: [], items: [] }, yourQuestions: null },
  crawl: { state: "in_index", pagesCrawled: 31, inventoryPages: 120, lastFetchedAt: at, topSections: [] },
  gaps: [
    { id: "google-near", area: "google", severity: "high", title: "Big searches just off page one", finding: "“ai image generator” (823K a month) is at #20.", nextStep: "Strengthen the page Google picks for it.",
      evidence: [{ label: "/tools/image · “ai image generator” #20", url: "https://manus.im/tools/image" }, { label: "Saved questions", url: "/benchmarks?website=site-manus" }] },
    { id: "links-broken", area: "links", severity: "medium", title: "<img src=x onerror=alert(1)> broken links", finding: "1,099 links point at missing pages.", nextStep: "Redirect them.", evidence: [] },
  ],
  notChecked: [{ id: "ai", area: "ai_answers", title: "AI answers", detail: "None of the 100 questions naming Manus has been answered yet.", nextStep: "Run them.", link: null }],
  sources: [
    { id: "search_console", label: "Clicks from Google", provider: "Google Search Console", kind: "google", asOf: "2026-11-08", detail: "Google’s own count of clicks and impressions." },
    { id: "visits_estimate", label: "Search visits and ranking searches", provider: "DataForSEO", kind: "estimate", asOf: at, detail: "Estimated from searches a month and expected clicks." },
  ],
  googleCheck: { state: "compared", searchConsole: { reportId: "gsc", property: "sc-domain:manus.im", startDate: "2026-10-12", endDate: "2026-11-08", scope: "united_states", clicks: 50000, monthlyClicks: 53571 },
    estimate: { monthlyVisits: 62748, fetchedAt: at }, ratio: 0.854, finding: "Google counted 50,000 clicks from US searches in the 28 days to Nov 8, 2026 (about 53,571 a month). The third-party estimate is 62,748 a month, 17% above Google’s own count.",
    caveat: { text: "Search visits are an estimate. Ahrefs reports a median difference of 50% from Google Search Console.", sourceUrl: "https://ahrefs.com/blog/traffic-estimations-accuracy/" } },
  howToRead: "Built from saved data only.", recorded: true };
const organizations = { note: "Fixture.", items: [{ id: "org-1", name: "Manus", role: "owner", members: [{ name: "Rach", role: "owner", agents: 1, you: true }, { name: "Natalie", role: "member", agents: 0, you: false }],
  websites: [{ websiteId: "site-manus", name: "manus.im", domain: "manus.im", sharedBy: "Rach" }] }] };
const asToolResult = (result: unknown) => ({ content: [{ type: "text", text: JSON.stringify({ result }) }], structuredContent: { result } });

type Log = [string, unknown][];
async function host(page: Page, first: { arguments: Record<string, unknown>; result: unknown }) {
  await page.exposeFunction("folioTool", (name: string, args: Record<string, unknown>) =>
    asToolResult(name === "folio_find" ? found((args.q as string | undefined) ?? null) : name === "folio_website_gaps" ? report : name === "folio_organizations" ? organizations : null));
  await page.setContent('<!doctype html><html><body style="margin:0"><iframe id="app" title="Folio app" sandbox="allow-scripts" style="width:640px;height:900px;border:0"></iframe></body></html>');
  await page.addScriptTag({ content: bridgeBundle });
  await page.evaluate(async ({ html, first }) => {
    const w = window as unknown as { AppsHost: any; folioTool: (name: string, args: unknown) => Promise<unknown>; hostLog: [string, unknown][]; bridge: any };
    const log: [string, unknown][] = w.hostLog = [];
    const iframe = document.getElementById("app") as HTMLIFrameElement;
    const bridge = w.bridge = new w.AppsHost.AppBridge(null, { name: "folio-fixture-host", version: "1.0.0" }, { openLinks: {}, serverTools: {}, logging: {}, updateModelContext: { text: {} }, message: { text: {} } },
      { hostContext: { theme: "dark", displayMode: "inline", availableDisplayModes: ["inline"], containerDimensions: { width: 640, maxHeight: 900 }, locale: "en-US" } });
    bridge.oncalltool = async (params: { name: string; arguments?: Record<string, unknown> }) => { log.push(["tools/call", params]); return w.folioTool(params.name, params.arguments ?? {}); };
    bridge.onopenlink = async (params: { url: string }) => { log.push(["open-link", params.url]); return {}; };
    bridge.onmessage = async (params: unknown) => { log.push(["message", params]); return {}; };
    bridge.onupdatemodelcontext = async (params: unknown) => { log.push(["model-context", params]); return {}; };
    bridge.onsizechange = (params: unknown) => log.push(["size", params]);
    bridge.oninitialized = async () => { log.push(["initialized", bridge.getAppVersion()]); await bridge.sendToolInput({ arguments: first.arguments }); await bridge.sendToolResult(first.result); };
    // Connect before the page loads, so the bridge hears its first message.
    await bridge.connect(new w.AppsHost.PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
    iframe.srcdoc = html;
  }, { html: FOLIO_APP_HTML, first });
  return {
    frame: page.frameLocator("#app"),
    log: () => page.evaluate(() => (window as unknown as { hostLog: Log }).hostLog),
    calls: async (kind: string) => (await page.evaluate(() => (window as unknown as { hostLog: Log }).hostLog)).filter(entry => entry[0] === kind).map(entry => entry[1]),
  };
}

test("the official MCP Apps host bridge renders Folio's search, opens a website's report and hands a gap to the agent", async ({ page }) => {
  const { frame, log, calls } = await host(page, { arguments: { q: "manus" }, result: asToolResult(found("manus")) });
  await expect.poll(async () => (await log()).find(entry => entry[0] === "initialized")?.[1]).toEqual({ name: "folio", version: "1.1.0" });
  // The tool's own result is shown first, in the host's theme, with the query it was called with.
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.getByRole("searchbox", { name: "Search your Folio" })).toHaveValue("manus");
  const matches = frame.getByRole("list", { name: "Matches" });
  await expect(matches.getByRole("button")).toHaveCount(3);
  await expect(matches.getByRole("button").nth(1)).toContainText("Organization · owner · 2 members");
  await expect.poll(async () => (await calls("size")).length).toBeGreaterThan(0);

  // A saved report opens in Folio through the host, never directly.
  await matches.getByRole("button", { name: /Search & backlinks report/ }).click();
  await expect.poll(() => calls("open-link")).toEqual(["https://usefolio.site/search-data?report=seo-1"]);

  // The website opens its report with one read-only tool call, and the agent is told what the person is looking at.
  await matches.getByRole("button", { name: /Your website/ }).click();
  await expect(frame.getByRole("heading", { name: "manus.im", level: 2 })).toBeVisible();
  // The App class adds the protocol's own _meta (a progress token); the tool and its arguments are what matter.
  expect((await calls("tools/call")).at(-1)).toMatchObject({ name: "folio_website_gaps", arguments: { websiteId: "site-manus" } });
  await expect(frame.locator(".metric").nth(0)).toContainText("1 of 3 searches");
  await expect(frame.locator(".metric").nth(1)).toContainText("14,634");
  await expect(frame.getByRole("table")).toContainText("ai image generator");
  await expect.poll(async () => JSON.stringify((await calls("model-context")).at(-1))).toContain("websiteId site-manus");
  // Each number says where it comes from; the estimate sits beside Google's own count, and the study behind the caveat opens through the host.
  await expect(frame.getByRole("heading", { name: "Where these numbers come from" })).toBeVisible();
  await expect(frame.locator(".meters")).toContainText("53,571/mo");
  await expect(frame.locator(".meters")).toContainText("62,748/mo");
  await expect(frame.locator("[data-source-id='search_console']")).toContainText("Google’s own count");
  await expect(frame.locator("[data-source-id='visits_estimate']")).toContainText("Estimate");
  await expect(frame.locator(".metric").nth(2)).toContainText("Search visits a month (estimate)");
  await frame.getByRole("button", { name: "Ahrefs’s study" }).click();
  await expect.poll(async () => (await calls("open-link")).at(-1)).toBe("https://ahrefs.com/blog/traffic-estimations-accuracy/");
  expect(JSON.stringify((await calls("model-context")).at(-1))).toContain("17% above Google’s own count");
  // Untrusted report text stays text.
  await expect(frame.getByText("<img src=x onerror=alert(1)> broken links")).toBeVisible();
  await expect(frame.locator(".gaps img")).toHaveCount(0);
  // Evidence links resolve against Folio and go through the host.
  await frame.getByRole("button", { name: "Saved questions" }).click();
  await expect.poll(async () => (await calls("open-link")).at(-1)).toBe("https://usefolio.site/benchmarks?website=site-manus");
  await frame.getByRole("button", { name: "Ask my agent to fix this" }).first().click();
  await expect.poll(async () => JSON.stringify((await calls("message")).at(-1))).toContain("Big searches just off page one");
  expect(JSON.stringify((await calls("message")).at(-1))).toContain("wait for my approval");
  await expect(frame.getByRole("status")).toHaveText("Sent to your agent.");

  // Back to the list, then an organization lists its shared websites.
  await frame.getByRole("button", { name: "← Your Folio" }).click();
  await frame.getByRole("button", { name: /Shared websites/ }).click();
  await expect(frame.getByRole("heading", { name: "Manus", level: 2 })).toBeVisible();
  await expect(frame.getByRole("list", { name: "Shared websites" })).toContainText("Shared by Rach");

  // Typing searches through the host; nothing found says so.
  await frame.getByRole("searchbox", { name: "Search your Folio" }).fill("zzz");
  await expect(frame.getByText("Nothing in your Folio matches “zzz”.")).toBeVisible();
  // The page reports its content height, not the frame's, so a host can shrink the frame again.
  const heights = ((await calls("size")) as { height: number }[]).map(size => size.height);
  await expect.poll(async () => ((await calls("size")).at(-1) as { height: number }).height).toBeLessThan(Math.max(...heights) - 200);
  const tools = (await calls("tools/call")).map(call => (call as { name: string }).name);
  expect([...new Set(tools)].sort()).toEqual(["folio_find", "folio_organizations", "folio_website_gaps"]);
  // The host can tear the view down cleanly.
  await page.evaluate(() => (window as unknown as { bridge: { teardownResource(params: { reason: string }): Promise<unknown> } }).bridge.teardownResource({ reason: "fixture done" }));
});

test("a website-gaps call opens straight on the report, and a tool error is shown, not swallowed", async ({ page }) => {
  const { frame } = await host(page, { arguments: { websiteId: "site-manus" }, result: asToolResult(report) });
  await expect(frame.getByRole("heading", { name: "manus.im", level: 2 })).toBeVisible();
  await expect(frame.getByText("Google sends manus.im most of its search visits")).toBeVisible();
  await expect(frame.getByRole("button", { name: /Your Folio/ })).toHaveCount(0);

  const failed = await host(await page.context().newPage(), { arguments: { websiteId: "gone" },
    result: { isError: true, content: [{ type: "text", text: '{"error":{"message":"Website not found."}}' }], structuredContent: { error: { code: "not_found", message: "Website not found.", retryDisposition: "correct_request_before_retry", requiredScope: null } } } });
  await expect(failed.frame.getByRole("status")).toHaveText("Website not found.");
});
