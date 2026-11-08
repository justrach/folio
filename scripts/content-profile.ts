/**
 * Content profile: what the sampled pages of each site are actually about.
 *
 *   PARALLEL_API_KEY=... node --conditions=react-server --import tsx scripts/content-profile.ts \
 *     [--out .local/content-profiles] [--profiles .local/site-profiles] \
 *     [--per-site 30] [--concurrency 3] [--directory] <domain> [domain...]
 *
 * Reads the `sampleUrls` saved by scripts/site-profile.ts and asks Parallel
 * Extract for a one-line account of each page. $1 per 1,000 URLs; results are
 * cached per domain so a re-run only pays for URLs it has not read yet.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const outDir = value("--out", ".local/content-profiles");
const profilesDir = value("--profiles", ".local/site-profiles");
const rebuild = args.includes("--rebuild");
const perSite = Math.max(1, Math.min(40, Number(value("--per-site", "30")) || 30));
const concurrency = Math.max(1, Math.min(6, Number(value("--concurrency", "3")) || 3));
const fromDirectory = args.includes("--directory");
const consumed = new Set<string>();
for (const flag of ["--out", "--profiles", "--per-site", "--concurrency"]) {
  const index = args.indexOf(flag);
  if (index >= 0) {
    consumed.add(flag);
    consumed.add(args[index + 1]);
  }
}
const explicit = args.filter(item => !item.startsWith("--") && !consumed.has(item));

const KEY = process.env.PARALLEL_API_KEY;
if (!KEY) {
  console.error("Set PARALLEL_API_KEY before running.");
  process.exit(2);
}

const OBJECTIVE =
  "In one sentence: what is this page about? Name the concrete topic, the content type " +
  "(documentation, blog post, product page, template, glossary, changelog, customer story), " +
  "and the specific task or claim it covers. Then list up to five topic keywords.";

type Extracted = {
  url: string;
  title: string | null;
  excerpt: string;
  keywords: string[];
};

type DomainProfile = {
  domain: string;
  fetchedAt: string;
  pages: Extracted[];
  skipped: number;
};

type ParallelResponse = {
  results?: { url: string; title?: string | null; excerpts?: string[] }[];
  errors?: { url: string; error_type?: string }[];
  usage?: unknown;
};

const STOPWORDS = new Set(
  ("the and for with your from that this are you can all how what when who why not but its our their has have had into out about over under more most less step guide using use used will was were been being they them than then also just only very much many such other some any each every own same both few nor too so via per vs etc " +
    "http https www com org net api banner close skip menu cookie cookies consent privacy terms sign login signup search subscribe newsletter navigation page pages read view click here now new").split(" "),
);

function tokens(text: string, limit = 6, skip: Set<string> = new Set()) {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9+#.-]+/)) {
    const word = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (word.length < 4 || word.length > 30 || STOPWORDS.has(word) || skip.has(word) || /\d/.test(word)) continue;
    // Drop URL and domain fragments that leak in from nav text.
    if (/[./@#_=]/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

async function extract(urls: string[], attempt = 0): Promise<ParallelResponse> {
  const response = await fetch("https://api.parallel.ai/v1/extract", {
    method: "POST",
    headers: { "x-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      urls,
      objective: OBJECTIVE,
      advanced_settings: { excerpt_settings: { max_chars_per_result: 700 } },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    await response.body?.cancel();
    if (retryable && attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
      return extract(urls, attempt + 1);
    }
    throw new Error(`extract HTTP ${response.status}`);
  }
  return (await response.json()) as ParallelResponse;
}

async function loadSample(domain: string): Promise<string[]> {
  const profile = JSON.parse(await readFile(`${profilesDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}.json`, "utf8")) as {
    sampleUrls?: string[];
  };
  return (profile.sampleUrls ?? []).slice(0, perSite);
}

async function loadExisting(domain: string): Promise<DomainProfile | null> {
  try {
    return JSON.parse(await readFile(`${outDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}.json`, "utf8")) as DomainProfile;
  } catch {
    return null;
  }
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
  const summary: { domain: string; pages: number; themes: string[] }[] = [];

  async function worker() {
    while (cursor < domains.length) {
      const domain = domains[cursor++];
      const sample = await loadSample(domain);
      if (!sample.length) {
        console.log(`${domain}: no sampled URLs (sitemap unavailable)`);
        summary.push({ domain, pages: 0, themes: [] });
        continue;
      }
      const existing = await loadExisting(domain);
      const seen = new Set((existing?.pages ?? []).map(page => page.url));
      const pending = rebuild ? [] : sample.filter(url => !seen.has(url));
      const skip = new Set(domain.split(".")[0].split("-"));
      const pages: Extracted[] = (existing?.pages ?? []).map(page => ({
        ...page,
        keywords: tokens(`${page.title ?? ""} ${page.excerpt}`, 6, skip),
      }));
      let failures = 0;
      for (let start = 0; start < pending.length; start += 10) {
        const batch = pending.slice(start, start + 10);
        try {
          const response = await extract(batch);
          failures += (response.errors ?? []).length;
          for (const result of response.results ?? []) {
            const excerpt = (result.excerpts ?? []).join(" ").replace(/\s+/g, " ").trim();
            if (!excerpt) continue;
            pages.push({
              url: result.url,
              title: result.title ?? null,
              excerpt: excerpt.slice(0, 700),
              keywords: tokens(`${result.title ?? ""} ${excerpt}`, 6, new Set(domain.split(".")[0].split("-"))),
            });
          }
        } catch (error) {
          failures += batch.length;
          console.log(`${domain}: batch failed (${error instanceof Error ? error.message : "unknown"})`);
        }
      }
      const profile: DomainProfile = {
        domain,
        fetchedAt: new Date().toISOString(),
        pages,
        skipped: sample.length - pages.length,
      };
      const base = `${outDir}/${domain.replace(/[^a-z0-9.-]/gi, "_")}`;
      await writeFile(`${base}.json`, JSON.stringify(profile, null, 1));
      const themeCounts = new Map<string, number>();
      for (const page of pages) for (const word of page.keywords.slice(0, 5)) themeCounts.set(word, (themeCounts.get(word) ?? 0) + 1);
      const themes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => `${word}(${count})`);
      summary.push({ domain, pages: pages.length, themes });
      console.log(`${domain}: pages=${pages.length}${failures ? ` failures=${failures}` : ""} themes=${themes.join(" ")}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, domains.length) }, worker));

  summary.sort((a, b) => b.pages - a.pages);
  const lines = [
    "# Content profile summary",
    "",
    `Extracted ${new Date().toISOString()} · ${summary.reduce((sum, row) => sum + row.pages, 0)} pages across ${summary.length} domains.`,
    "",
    "| Domain | Pages read | Recurring topic words |",
    "| --- | --- | --- |",
    ...summary.map(row => `| ${row.domain} | ${row.pages} | ${row.themes.join(" ") || "—"} |`),
    "",
    "Topic words come from page titles and the provider's excerpts; they describe vocabulary, not quality.",
  ];
  await writeFile(`${outDir}/summary.md`, lines.join("\n"));
  console.log(`wrote ${summary.length} content profiles to ${outDir}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
