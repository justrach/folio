/**
 * Site profile: how much each site publishes, in which sections, and how that
 * inventory lines up with the pages that actually rank.
 *
 *   node --conditions=react-server --import tsx scripts/site-profile.ts \
 *     [--out .local/site-profiles] [--directory] [--rankings .local/ranking-reports] \
 *     [--concurrency 5] <domain> [domain...]
 *
 * Free: reads public sitemaps and homepages only. It never calls DataForSEO.
 * Ranking overlap is optional and reads the cached ranking JSON from
 * scripts/ranking-report.ts; without it the report is inventory only.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import {
  parseSitemapXml,
  rankEfficiency,
  sitemapsFromRobots,
  summarizeInventory,
  type SitemapEntry,
  type SiteInventory,
} from "../src/lib/site-profile";
import { sectionOf } from "../src/lib/page-types";

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const outDir = value("--out", ".local/site-profiles");
const rankingDir = value("--rankings", ".local/ranking-reports");
const concurrency = Math.max(1, Math.min(10, Number(value("--concurrency", "5")) || 5));
const fromDirectory = args.includes("--directory");
const consumed = new Set<string>();
for (const flag of ["--out", "--rankings", "--concurrency"]) {
  const index = args.indexOf(flag);
  if (index >= 0) {
    consumed.add(flag);
    consumed.add(args[index + 1]);
  }
}
const explicit = args.filter(item => !item.startsWith("--") && !consumed.has(item));

const UA = "FolioSiteProfile/1.0 (+https://usefolio.site; public sitemap inventory)";
const MAX_BYTES = 20_000_000;
const MAX_SITEMAPS = 25;
const MAX_ENTRIES = 25_000;

type FetchResult = { ok: true; url: string; text: string } | { ok: false; url: string; reason: string };

async function fetchText(url: string, timeoutMs = 15_000): Promise<FetchResult> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xml,text/xml,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, url, reason: `HTTP ${response.status}` };
    }
    const reader = response.body?.getReader();
    if (!reader) return { ok: false, url, reason: "empty body" };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return { ok: false, url, reason: "body over limit" };
      }
      chunks.push(chunk);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // Many sites publish sitemap.xml.gz; browsers fetch gunzip automatically but
    // a raw file served as application/gzip arrives compressed.
    const gzipped = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    const stream = new Blob([buffer]).stream();
    const text = await new Response(
      gzipped ? stream.pipeThrough(new DecompressionStream("gzip")) : stream,
    ).text();
    if (text.length > MAX_BYTES) return { ok: false, url, reason: "body over limit" };
    return { ok: true, url, text };
  } catch (error) {
    return { ok: false, url, reason: error instanceof Error ? error.name : "request failed" };
  }
}

function homepageMeta(html: string) {
  const title = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]{0,500}?)["']/i.exec(html)?.[1]
    ?.replace(/\s+/g, " ").trim()
    ?? /<meta[^>]+content=["']([\s\S]{0,500}?)["'][^>]+name=["']description["']/i.exec(html)?.[1]?.replace(/\s+/g, " ").trim()
    ?? null;
  return { title, description };
}

async function discoverSitemaps(domain: string) {
  const attempts: string[] = [];
  const robots = await fetchText(`https://${domain}/robots.txt`, 10_000);
  if (robots.ok) attempts.push(...sitemapsFromRobots(robots.text));
  for (const candidate of [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap.xml.gz`,
    `https://${domain}/sitemap_index.xml.gz`,
  ]) {
    if (!attempts.includes(candidate)) attempts.push(candidate);
  }
  return { attempts: attempts.slice(0, 10), robots: robots.ok ? "read" : robots.reason };
}

function sampleUrls(entries: SitemapEntry[], total = 30) {
  const bySection = new Map<string, string[]>();
  for (const entry of entries) {
    const section = sectionOf(entry.loc);
    const list = bySection.get(section) ?? [];
    list.push(entry.loc);
    bySection.set(section, list);
  }
  const top = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  const picked: string[] = [];
  const perSection = Math.max(1, Math.floor(total / Math.max(1, top.length)));
  for (const [, urls] of top) {
    const step = Math.max(1, Math.floor(urls.length / perSection));
    for (let i = 0; i < urls.length && picked.length < total; i += step) picked.push(urls[i]);
  }
  return [...new Set(picked)].slice(0, total);
}

async function collectInventory(domain: string) {
  const discovery = await discoverSitemaps(domain);
  const entries = new Map<string, SitemapEntry>();
  const used: string[] = [];
  const failures: { url: string; reason: string }[] = [];
  let sitemapsRead = 0;
  let invalidEntries = 0;
  let truncated = false;

  const queue = [...discovery.attempts];
  const seen = new Set<string>();
  while (queue.length && sitemapsRead < MAX_SITEMAPS && entries.size < MAX_ENTRIES) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const response = await fetchText(url);
    if (!response.ok) {
      failures.push({ url, reason: response.reason });
      continue;
    }
    sitemapsRead += 1;
    used.push(url);
    const parsed = parseSitemapXml(response.text);
    invalidEntries += parsed.invalidEntries;
    for (const child of parsed.childSitemaps) {
      if (queue.length + sitemapsRead < MAX_SITEMAPS && !seen.has(child)) queue.push(child);
    }
    for (const entry of parsed.entries) {
      if (entries.size >= MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.set(entry.loc, entry);
    }
  }

  const list = [...entries.values()];
  return {
    discovery,
    sitemapsRead,
    used,
    failures,
    invalidEntries,
    truncated,
    inventory: summarizeInventory(list),
    sampleUrls: sampleUrls(list),
  };
}

async function loadRankings(domain: string) {
  try {
    const raw = JSON.parse(await readFile(`${rankingDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}.json`, "utf8")) as {
      keywords?: { data?: { rows?: { landingPage: string | null }[] } | null };
    };
    return raw.keywords?.data?.rows?.map(row => row.landingPage) ?? null;
  } catch {
    return null;
  }
}

function renderMarkdown(domain: string, profile: Awaited<ReturnType<typeof buildProfile>>) {
  const { inventory } = profile;
  const lines: string[] = [];
  lines.push(`# ${domain} — site profile`);
  lines.push("");
  lines.push(`Fetched ${profile.fetchedAt}. Sitemap inventory only; no ranking provider was called.`);
  if (profile.title) lines.push(`Homepage title: **${profile.title}**`);
  if (profile.description) lines.push(`Description: ${profile.description}`);
  lines.push("");
  lines.push(`Sitemaps: ${profile.sitemapsRead} read (${profile.used[0] ?? "none"}) · URLs: ${inventory.total}${profile.truncated ? " (capped)" : ""} · deepest path: ${inventory.deepestPath}`);
  if (profile.invalidEntries) lines.push(`Invalid sitemap entries skipped: ${profile.invalidEntries}`);
  if (profile.failures.length) lines.push(`Unreadable sitemap URLs: ${profile.failures.map(item => `${item.url} (${item.reason})`).join("; ")}`);
  lines.push("");
  lines.push("## Inventory by section");
  lines.push("");
  lines.push("| Section | Pages | Share |");
  lines.push("| --- | --- | --- |");
  const share = (pages: number) => (inventory.total ? `${Math.round((pages / inventory.total) * 1000) / 10}%` : "—");
  for (const section of inventory.bySection.slice(0, 15)) {
    lines.push(`| ${section.section} | ${section.pages} | ${share(section.pages)} |`);
  }
  const rest = inventory.bySection.slice(15);
  if (rest.length) lines.push(`| _${rest.length} smaller sections_ | ${rest.reduce((sum, item) => sum + item.pages, 0)} | ${share(rest.reduce((sum, item) => sum + item.pages, 0))} |`);
  lines.push("");
  lines.push("## Page types");
  lines.push("");
  lines.push("| Type | Pages |");
  lines.push("| --- | --- |");
  for (const type of inventory.byType) lines.push(`| ${type.type} | ${type.pages} |`);
  lines.push("");
  lines.push("## Freshness (sitemap lastmod)");
  lines.push("");
  lines.push(`Updated in 30 days: ${inventory.freshness.last30} · 31–90 days: ${inventory.freshness.last90} · 91–365 days: ${inventory.freshness.lastYear} · older: ${inventory.freshness.older} · no lastmod: ${inventory.freshness.unknown}`);
  lines.push("");
  if (profile.rankEfficiency) {
    lines.push("## Ranked sample vs inventory");
    lines.push("");
    lines.push("Ranked pages come from the capped 50-row keyword sample, so this is a sample ratio, not a site-wide ranking rate.");
    lines.push("");
    lines.push("| Section | Pages | Ranked rows in sample | Ranked rows per 1,000 pages |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of profile.rankEfficiency.slice(0, 15)) {
      lines.push(`| ${row.section} | ${row.pages} | ${row.sampledRanks} | ${row.sampledRanksPerThousandPages ?? "—"} |`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("Counting a sitemap is not measuring quality: a page listed here may be thin, duplicated or not indexable, and a page missing here may still rank. Path-based sections are heuristic. lastmod is whatever the site publishes.");
  return `${lines.join("\n")}\n`;
}

async function buildProfile(domain: string) {
  const [{ inventory, ...rest }, homepage, rankings] = await Promise.all([
    collectInventory(domain),
    fetchText(`https://${domain}/`),
    loadRankings(domain),
  ]);
  const meta = homepage.ok ? homepageMeta(homepage.text) : { title: null, description: null };
  return {
    domain,
    fetchedAt: new Date().toISOString(),
    title: meta.title,
    description: meta.description,
    ...rest,
    inventory: inventory as SiteInventory,
    rankEfficiency: rankings ? rankEfficiency(inventory, rankings) : null,
  };
}

function catalogDomains() {
  const catalog = JSON.parse(readFileSync("src/data/developer-tools.json", "utf8")) as { websiteUrl: string }[];
  return catalog.map(entry => new URL(entry.websiteUrl).hostname.replace(/^www\./, ""));
}

async function main() {
  const domains = fromDirectory ? catalogDomains() : explicit;
  if (!domains.length) {
    console.error("Pass at least one domain, or --directory.");
    process.exit(2);
  }
  await mkdir(outDir, { recursive: true });
  let cursor = 0;
  const results: { domain: string; total: number; sections: number; types: string; sitemaps: number; note: string }[] = [];

  async function worker() {
    while (cursor < domains.length) {
      const domain = domains[cursor++];
      try {
        const profile = await buildProfile(domain);
        const base = `${outDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}`;
        await writeFile(`${base}.json`, JSON.stringify(profile, null, 1));
        await writeFile(`${base}.md`, renderMarkdown(domain, profile));
        const topType = profile.inventory.byType[0];
        console.log(`${domain}: urls=${profile.inventory.total} sections=${profile.inventory.bySection.length} top=${topType ? `${topType.type}:${topType.pages}` : "none"} sitemaps=${profile.sitemapsRead}`);
        results.push({
          domain,
          total: profile.inventory.total,
          sections: profile.inventory.bySection.length,
          types: topType ? `${topType.type}:${topType.pages}` : "none",
          sitemaps: profile.sitemapsRead,
          note: profile.failures.length ? "partial" : "ok",
        });
      } catch (error) {
        console.log(`${domain}: failed (${error instanceof Error ? error.message : "unknown"})`);
        results.push({ domain, total: 0, sections: 0, types: "none", sitemaps: 0, note: "failed" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));

  results.sort((a, b) => b.total - a.total);
  const lines = [
    "# Sitemap inventory summary",
    "",
    `Fetched ${new Date().toISOString()} for ${results.length} domains. Free: public sitemaps only.`,
    "",
    "| Domain | URLs | Sections | Leading page type | Sitemaps | Note |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(row => `| ${row.domain} | ${row.total} | ${row.sections} | ${row.types} | ${row.sitemaps} | ${row.note} |`),
    "",
  ];
  await writeFile(`${outDir}/summary.md`, lines.join("\n"));
  console.log(`wrote ${results.length} profiles to ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
