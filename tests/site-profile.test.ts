import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSitemapXml,
  rankEfficiency,
  sitemapsFromRobots,
  summarizeInventory,
} from "../src/lib/site-profile";

const day = 86_400_000;
const now = Date.parse("2026-11-07T00:00:00.000Z");

test("a urlset keeps absolute http URLs, ISO lastmod values and counts invalid entries", () => {
  const parsed = parseSitemapXml(`<?xml version="1.0"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/docs/intro</loc><lastmod>2026-11-01</lastmod></url>
      <url><loc><![CDATA[https://example.com/blog/post?a=1&amp;b=2]]></loc></url>
      <url><loc>javascript:alert(1)</loc></url>
      <url><loc>https://example.com/pricing</loc><lastmod>not-a-date</lastmod></url>
    </urlset>`);
  assert.equal(parsed.kind, "urlset");
  assert.equal(parsed.invalidEntries, 1);
  assert.deepEqual(parsed.entries, [
    { loc: "https://example.com/docs/intro", lastmod: "2026-11-01T00:00:00.000Z" },
    { loc: "https://example.com/blog/post?a=1&b=2", lastmod: null },
    { loc: "https://example.com/pricing", lastmod: null },
  ]);
});

test("a sitemap index returns child sitemaps and no page entries", () => {
  const parsed = parseSitemapXml(`<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-blog.xml</loc></sitemap>
      <sitemap><loc>ftp://example.com/nope.xml</loc></sitemap>
    </sitemapindex>`);
  assert.equal(parsed.kind, "sitemapindex");
  assert.deepEqual(parsed.childSitemaps, [
    "https://example.com/sitemap-pages.xml",
    "https://example.com/sitemap-blog.xml",
  ]);
  assert.equal(parsed.entries.length, 0);
  assert.equal(parsed.invalidEntries, 1);
});

test("unknown documents are reported instead of guessed", () => {
  const parsed = parseSitemapXml("<html><body>not a sitemap</body></html>");
  assert.equal(parsed.kind, "unknown");
  assert.deepEqual(parsed.entries, []);
});

test("robots.txt sitemap directives are bounded and deduplicated", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /private",
    "Sitemap: https://example.com/sitemap.xml",
    "sitemap: https://example.com/sitemap-blog.xml",
    "Sitemap: https://example.com/sitemap.xml",
    "Sitemap: /relative.xml",
  ].join("\n");
  assert.deepEqual(sitemapsFromRobots(robots), [
    "https://example.com/sitemap.xml",
    "https://example.com/sitemap-blog.xml",
  ]);
});

test("inventory groups by section and type and buckets freshness at the boundaries", () => {
  const entries = [
    { loc: "https://example.com/", lastmod: new Date(now - 2 * day).toISOString() },
    { loc: "https://example.com/docs/a", lastmod: new Date(now - 30 * day).toISOString() },
    { loc: "https://example.com/docs/b", lastmod: new Date(now - 31 * day).toISOString() },
    { loc: "https://example.com/blog/post", lastmod: new Date(now - 200 * day).toISOString() },
    { loc: "https://example.com/pricing", lastmod: new Date(now - 400 * day).toISOString() },
    { loc: "https://example.com/docs/c", lastmod: null },
  ];
  const inventory = summarizeInventory(entries, now);
  assert.equal(inventory.total, 6);
  assert.deepEqual(inventory.bySection.slice(0, 2), [
    { section: "/docs", pages: 3 },
    { section: "/", pages: 1 },
  ]);
  assert.deepEqual(inventory.byType, [
    { type: "docs", pages: 3 },
    { type: "home", pages: 1 },
    { type: "blog", pages: 1 },
    { type: "pricing", pages: 1 },
  ]);
  assert.deepEqual(inventory.freshness, { last30: 2, last90: 1, lastYear: 1, older: 1, unknown: 1 });
  assert.equal(inventory.deepestPath, 2);
});

test("ranked samples are compared against inventory without inventing a site-wide rate", () => {
  const inventory = summarizeInventory([
    { loc: "https://example.com/docs/a", lastmod: null },
    { loc: "https://example.com/docs/b", lastmod: null },
    { loc: "https://example.com/blog/a", lastmod: null },
    { loc: "https://example.com/", lastmod: null },
  ], now);
  const rows = rankEfficiency(inventory, [
    "https://example.com/docs/a",
    "https://example.com/docs/b",
    null,
    "https://example.com/",
  ]);
  assert.deepEqual(rows[0], { section: "/docs", pages: 2, sampledRanks: 2, sampledRanksPerThousandPages: 1000 });
  assert.deepEqual(rows.find(row => row.section === "/blog"), { section: "/blog", pages: 1, sampledRanks: 0, sampledRanksPerThousandPages: 0 });
});
