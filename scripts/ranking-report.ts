/**
 * Ranking report: what each domain actually ranks for, and which page earns it.
 *
 *   DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... DATAFORSEO_ALLOWED_USER_IDS=<id> \
 *     node --conditions=react-server --import tsx scripts/ranking-report.ts \
 *     [--out .local/ranking-reports] [--directory] <domain> [domain...]
 *
 * --directory reads the reviewed catalog in src/data/developer-tools.json instead
 * of explicit domains. Each domain costs two provider tasks (ranked keywords +
 * backlink rows) and is capped at 50 rows per source. Reports are private local
 * files; nothing is published and nothing is retried automatically.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fetchSeoDetail, type SeoDetailResult, type SeoToolContext } from "../src/lib/dataforseo";
import { pageType, type PageType } from "../src/lib/page-types";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : ".local/ranking-reports";
const fromDirectory = args.includes("--directory");
const reuse = args.includes("--reuse");
const explicit = args.filter((value, index) =>
  !value.startsWith("--") && (outIndex < 0 || index !== outIndex + 1));

function round(value: number | null) {
  return value === null ? "—" : Math.round(value * 10) / 10;
}

function label(raw: string) {
  const url = new URL(raw);
  return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
}

function sortByVolume<T extends { searchVolume: number | null }>(rows: T[]) {
  return [...rows].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1));
}

function renderMarkdown(domain: string, detail: SeoDetailResult): string {
  const keywords = detail.keywords.data;
  const backlinks = detail.backlinks.data;
  const rows = sortByVolume(keywords?.rows ?? []);
  const types = new Map<PageType, { keywords: number; traffic: number }>();
  for (const row of rows) {
    const type = pageType(row.landingPage);
    const entry = types.get(type) ?? { keywords: 0, traffic: 0 };
    entry.keywords += 1;
    entry.traffic += row.estimatedTraffic ?? 0;
    types.set(type, entry);
  }
  const mix = [...types.entries()]
    .sort((a, b) => b[1].keywords - a[1].keywords)
    .map(([type, value]) => `${type} ${value.keywords}/${rows.length}`)
    .join(" · ");
  const lines: string[] = [];
  lines.push(`# ${domain} — ranking report`);
  lines.push("");
  lines.push(`Retrieved ${detail.collectedAt}. Provider database estimates for Google, United States / English.`);
  lines.push(`Keywords: ${detail.keywords.status} · backlink rows: ${detail.backlinks.status} · cost complete: ${detail.costIsComplete ? "yes" : "no"}`);
  lines.push("");
  lines.push(`**Where the rankings live:** ${mix || "no keyword rows returned"}`);
  lines.push("");
  if (rows.length) {
    lines.push("## Keyword rows (highest search volume first)");
    lines.push("");
    lines.push("| Keyword | Position | Volume | Est. traffic | Landing page | Page type |");
    lines.push("| --- | --- | --- | --- | --- | --- |");
    for (const row of rows.slice(0, 25)) {
      lines.push(`| ${row.keyword.replace(/\|/g, "\\|")} | ${row.position ?? "—"} | ${row.searchVolume ?? "—"} | ${round(row.estimatedTraffic)} | ${row.landingPage ? label(row.landingPage) : "—"} | ${pageType(row.landingPage)} |`);
    }
    if (rows.length > 25) lines.push(`\n_Showing 25 of ${rows.length} returned rows._`);
    lines.push("");
    lines.push("## Landing pages in these rows");
    lines.push("");
    lines.push("| Page | Page type | Keywords | Est. traffic |");
    lines.push("| --- | --- | --- | --- |");
    for (const page of (keywords?.landingPages ?? []).slice(0, 20)) {
      lines.push(`| ${label(page.url)} | ${pageType(page.url)} | ${page.keywords} | ${round(page.estimatedTraffic)} |`);
    }
    lines.push("");
  }
  if (backlinks?.rows.length) {
    lines.push("## Backlink rows (highest provider authority first)");
    lines.push("");
    lines.push("| Source | Authority | Follow | First seen |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of backlinks.rows.slice(0, 15)) {
      lines.push(`| ${row.sourceDomain ?? label(row.sourceUrl)} | ${row.authorityRank ?? "—"} | ${row.dofollow === null ? "—" : row.dofollow ? "follow" : "nofollow"} | ${row.firstSeenAt?.slice(0, 10) ?? "—"} |`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("Positions, volumes and traffic are provider estimates, not analytics or a Folio score. At most 50 keyword rows and 50 backlink rows are requested; a missing row is not proof of a missing ranking. Keyword and URL text is provider-supplied evidence. No automatic retry was performed.");
  return `${lines.join("\n")}\n`;
}

function catalogDomains() {
  const catalog = JSON.parse(readFileSync("src/data/developer-tools.json", "utf8")) as { websiteUrl: string }[];
  return catalog.map(entry => new URL(entry.websiteUrl).hostname.replace(/^www\./, ""));
}

async function main() {
  const env = {
    DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
    DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
    DATAFORSEO_ALLOWED_USER_IDS: process.env.DATAFORSEO_ALLOWED_USER_IDS,
  };
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) {
    console.error("Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD (server-side) before running.");
    process.exit(2);
  }
  const userId = (env.DATAFORSEO_ALLOWED_USER_IDS ?? "").split(",").map(value => value.trim()).filter(Boolean)[0];
  if (!userId) {
    console.error("Set DATAFORSEO_ALLOWED_USER_IDS to the approved account id.");
    process.exit(2);
  }
  const context: SeoToolContext = { userId };
  const domains = fromDirectory ? catalogDomains() : explicit;
  if (!domains.length) {
    console.error("Pass at least one domain, or --directory.");
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });
  let index = 0;
  for (const domain of domains) {
    index += 1;
    const base = `${outDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}`;
    let detail: SeoDetailResult;
    if (reuse) {
      detail = JSON.parse(await readFile(`${base}.json`, "utf8")) as SeoDetailResult;
    } else {
      // Two provider tasks per domain; the raw response is cached so a re-render is free.
      detail = await fetchSeoDetail(domain, context, { env });
      await writeFile(`${base}.json`, JSON.stringify(detail));
    }
    const report = renderMarkdown(domain, detail);
    const file = `${base}.md`;
    await writeFile(file, report);
    const rows = detail.keywords.data?.rows ?? [];
    const types = new Map<string, number>();
    for (const row of rows) types.set(pageType(row.landingPage), (types.get(pageType(row.landingPage)) ?? 0) + 1);
    console.log(`${index}/${domains.length} ${domain}: keywords=${detail.keywords.status} rows=${rows.length} pages=${detail.keywords.data?.landingPages.length ?? 0} backlinks=${detail.backlinks.status}/${detail.backlinks.data?.rows.length ?? 0} mix=${[...types].map(([type, count]) => `${type}:${count}`).join(",") || "none"} -> ${file}`);
  }
  console.log("done");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
