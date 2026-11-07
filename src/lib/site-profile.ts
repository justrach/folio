import { pageType, sectionOf, type PageType } from "./page-types";

/** Sitemap parsing and inventory math. Pure functions: no network here, so the
 * parser and its caps are testable without fetching anything. */

export type SitemapEntry = { loc: string; lastmod: string | null };
export type ParsedSitemap = {
  kind: "urlset" | "sitemapindex" | "unknown";
  entries: SitemapEntry[];
  childSitemaps: string[];
  invalidEntries: number;
};

const MAX_ENTRIES = 25_000;

function decode(value: string) {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function httpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Bounded parse: unknown shapes are reported, never guessed. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const kind: ParsedSitemap["kind"] = /<sitemapindex[\s>]/i.test(xml)
    ? "sitemapindex"
    : /<urlset[\s>]/i.test(xml)
      ? "urlset"
      : "unknown";
  const entries: SitemapEntry[] = [];
  const childSitemaps: string[] = [];
  let invalidEntries = 0;

  if (kind === "urlset") {
    const blocks = xml.match(/<url\b[\s\S]*?<\/url>/gi) ?? [];
    for (const block of blocks) {
      if (entries.length >= MAX_ENTRIES) break;
      const locMatch = /<loc>([\s\S]*?)<\/loc>/i.exec(block);
      const loc = locMatch ? httpUrl(decode(locMatch[1])) : null;
      if (!loc) {
        invalidEntries += 1;
        continue;
      }
      const lastmodMatch = /<lastmod>([\s\S]*?)<\/lastmod>/i.exec(block);
      const parsed = lastmodMatch ? Date.parse(decode(lastmodMatch[1])) : NaN;
      entries.push({ loc, lastmod: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null });
    }
    if (!blocks.length) {
      // Some generators emit bare <loc> elements without <url> wrappers.
      for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
        if (entries.length >= MAX_ENTRIES) break;
        const loc = httpUrl(decode(match[1]));
        if (!loc) {
          invalidEntries += 1;
          continue;
        }
        entries.push({ loc, lastmod: null });
      }
    }
    return { kind, entries, childSitemaps, invalidEntries };
  }

  if (kind === "sitemapindex") {
    for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
      const loc = httpUrl(decode(match[1]));
      if (loc) childSitemaps.push(loc);
      else invalidEntries += 1;
    }
    return { kind, entries, childSitemaps, invalidEntries };
  }

  return { kind, entries, childSitemaps, invalidEntries };
}

/** Sitemap URLs advertised in robots.txt, in file order. */
export function sitemapsFromRobots(robots: string): string[] {
  const found: string[] = [];
  for (const line of robots.split("\n")) {
    const match = /^\s*sitemap:\s*(\S+)\s*$/i.exec(line);
    if (!match) continue;
    const loc = httpUrl(match[1]);
    if (loc && !found.includes(loc) && found.length < 10) found.push(loc);
  }
  return found;
}

export type Freshness = { last30: number; last90: number; lastYear: number; older: number; unknown: number };

export type SiteInventory = {
  total: number;
  bySection: { section: string; pages: number }[];
  byType: { type: PageType; pages: number }[];
  freshness: Freshness;
  deepestPath: number;
};

/** Bucket the inventory. Freshness uses the sitemap's own lastmod values. */
export function summarizeInventory(entries: SitemapEntry[], now = Date.now()): SiteInventory {
  const sections = new Map<string, number>();
  const types = new Map<PageType, number>();
  const freshness: Freshness = { last30: 0, last90: 0, lastYear: 0, older: 0, unknown: 0 };
  let deepestPath = 0;
  for (const entry of entries) {
    sections.set(sectionOf(entry.loc), (sections.get(sectionOf(entry.loc)) ?? 0) + 1);
    types.set(pageType(entry.loc), (types.get(pageType(entry.loc)) ?? 0) + 1);
    const depth = new URL(entry.loc).pathname.split("/").filter(Boolean).length;
    if (depth > deepestPath) deepestPath = depth;
    if (!entry.lastmod) {
      freshness.unknown += 1;
      continue;
    }
    const age = now - Date.parse(entry.lastmod);
    if (age <= 30 * 86_400_000) freshness.last30 += 1;
    else if (age <= 90 * 86_400_000) freshness.last90 += 1;
    else if (age <= 365 * 86_400_000) freshness.lastYear += 1;
    else freshness.older += 1;
  }
  return {
    total: entries.length,
    bySection: [...sections].map(([section, pages]) => ({ section, pages })).sort((a, b) => b.pages - a.pages),
    byType: [...types].map(([type, pages]) => ({ type, pages })).sort((a, b) => b.pages - a.pages),
    freshness,
    deepestPath,
  };
}

/** Ranked pages per page of inventory, per section. The ranking sample is capped
 * at 50 rows, so this is a sample ratio, not a site-wide ranking rate. */
export function rankEfficiency(
  inventory: SiteInventory,
  rankedUrls: (string | null)[],
) {
  const ranked = new Map<string, number>();
  for (const url of rankedUrls) {
    if (!url) continue;
    ranked.set(sectionOf(url), (ranked.get(sectionOf(url)) ?? 0) + 1);
  }
  return inventory.bySection
    .map(section => {
      const sampled = ranked.get(section.section) ?? 0;
      return {
        section: section.section,
        pages: section.pages,
        sampledRanks: sampled,
        sampledRanksPerThousandPages: section.pages ? Math.round((sampled / section.pages) * 1000 * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.sampledRanks - a.sampledRanks);
}
