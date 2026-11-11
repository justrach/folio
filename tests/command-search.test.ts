import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { COMMAND_PAGES, commandResults, propertyLabel, type WorkspaceSearchIndex } from "../src/lib/command-search";

const titles = (query: string, index: WorkspaceSearchIndex | null = null) => commandResults(query, { index, date: () => "Nov 10, 2026" }).map(result => result.title);
const index: WorkspaceSearchIndex = {
  websites: [{ id: "site-manus", name: "manus.im", url: "https://manus.im/" }, { id: "site-folio", name: "Folio", url: "https://usefolio.site/" }],
  seoReports: [{ id: "seo-1", domain: "manus.im", createdAt: "2026-11-10T00:00:00.000Z", complete: true }, { id: "seo-2", domain: "usefolio.site", createdAt: "2026-11-09T00:00:00.000Z", complete: false }],
  searchConsole: [{ id: "gsc-1", property: "sc-domain:manus.im", createdAt: "2026-11-09T00:00:00.000Z" }],
  organizations: [{ id: "org-1", name: "Manus", role: "owner", members: 2, domains: ["manus.im"] }],
};

test("every page can be found, and each link goes to a route that exists", () => {
  const routes = readFileSync(new URL("../src/app/[[...slug]]/page.tsx", import.meta.url), "utf8");
  const ids = COMMAND_PAGES.map(page => page.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const page of COMMAND_PAGES) {
    const path = new URL(page.href, "https://folio.invalid").pathname;
    const known = path === "/docs/api" ? existsSync(new URL("../src/app/docs/api/page.tsx", import.meta.url)) : routes.includes(`"${path.slice(1)}"`);
    assert.ok(known, `${page.title} → ${page.href}`);
  }
  // Nothing typed: every page, in the listed order, and nothing private.
  assert.deepEqual(titles("", index), COMMAND_PAGES.map(page => page.title));
  for (const title of ["Organizations", "Connect your agent", "API docs", "Settings", "Pricing"]) assert.ok(titles("").includes(title), title);
});

test("the words people use find the right page first", () => {
  const first = (query: string) => titles(query)[0];
  assert.equal(first("team"), "Organizations");
  assert.equal(first("org"), "Organizations");
  assert.equal(first("ORGANISATION"), "Organizations");
  assert.equal(first("invite"), "Organizations");
  assert.equal(first("mcp"), "Connect your agent");
  assert.equal(first("api key"), "Connect your agent");
  // "key" is also the start of "keyword", so both stay at the top.
  assert.deepEqual(titles("key").slice(0, 2), ["Keyword evaluations", "Connect your agent"]);
  assert.equal(first("claude code"), "Connect your agent");
  assert.equal(first("api"), "API docs");
  assert.equal(first("billing"), "Pricing");
  assert.equal(first("account"), "Settings");
  assert.equal(first("gsc"), "Search Console");
  assert.equal(first("backlinks"), "Search & backlinks");
  assert.equal(first("search &"), "Search & backlinks");
  assert.deepEqual(titles("patch"), ["Patch studio"]);
  assert.deepEqual(titles("zzzz"), []);
});

test("typing a domain finds that website, its organization and its saved reports, each with its own link", () => {
  const results = commandResults("manus", { index, audits: [{ id: "scan-1", url: "https://www.manus.im/", createdAt: "2026-11-08T00:00:00.000Z", seoScore: 78 }], date: () => "Nov 10, 2026" });
  assert.deepEqual(results.slice(0, 5).map(result => [result.kind, result.title, result.href]), [
    ["organization", "Manus", "/orgs?org=org-1"],
    ["website", "manus.im", "/websites?site=site-manus"],
    ["seo-report", "manus.im", "/search-data?report=seo-1"],
    ["search-console", "manus.im", "/search-console?report=gsc-1"],
    ["audit", "manus.im", "/seo"],
  ]);
  assert.equal(results[4].auditId, "scan-1");
  assert.match(results[0].detail, /owner · 2 members · shares manus\.im/);
  assert.match(results[2].detail, /^Search & backlinks report · Nov 10, 2026$/);
  // The Manus client setup still shows, below the person's own records.
  assert.ok(results.slice(5).some(result => result.title === "Connect your agent"));
  // Every word must match: this finds the backlinks report and nothing else.
  assert.deepEqual(commandResults("manus backlinks", { index }).map(result => result.key), ["seo-report:seo-1"]);
  assert.match(commandResults("usefolio", { index, date: () => "Nov 9, 2026" }).find(result => result.kind === "seo-report")!.detail, /no saved result/);
  assert.equal(propertyLabel("https://www.manus.im/"), "manus.im");
});

test("records are capped per kind so pages stay reachable", () => {
  const many: WorkspaceSearchIndex = { ...index, websites: Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, name: `site${i}`, url: `https://site${i}.example/` })) };
  const results = commandResults("site", { index: many });
  assert.equal(results.filter(result => result.kind === "website").length, 8);
  assert.ok(results.some(result => result.title === "My websites"));
});
