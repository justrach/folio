import assert from "node:assert/strict";
import test from "node:test";
import { buildWebsiteGaps, type WebsiteGapsInput } from "../src/lib/website-gaps";

const now = new Date("2026-11-11T06:00:00.000Z");
const value = (n: number) => ({ state: "value" as const, value: n });
const none = { state: "none" as const, value: null }, missing = { state: "missing" as const, value: null };
const row = (keyword: string, position: number, searchVolume: number, estimatedTraffic: number, page: string) =>
  ({ keyword, position, searchVolume, estimatedTraffic, landingPage: `https://manus.im${page}`, capturedAt: "2026-11-07T03:08:49.653Z" });
const assistants = Array.from({ length: 3 }, (_, i) => ({ queryId: `ai-assistants-v1-q${i}`, query: `How should I compare ChatGPT, Claude and Manus for task ${i}?`, category: "AI assistants", published: false, page: `/overview?query=ai-assistants-v1-q${i}` }));
const unrelated = { queryId: "deploy-v1", query: "How do Vercel and Render compare for a Node.js app?", category: "Application deployment", published: true, page: "/overview?query=deploy-v1&model=gpt-6-astra" };

/** Shaped like manus.im on 11 November: brand searches at #1, big generic searches on page 2–3. */
const manus: WebsiteGapsInput = {
  website: { id: "site-manus", name: "manus.im", url: "https://manus.im/" }, now,
  search: { state: "measured", reportId: "report", fetchedAt: "2026-11-11T05:10:00.000Z", backlinks: value(1_474_900), referringDomains: value(14_634), brokenBacklinks: 1_099,
    rankingKeywords: value(10_584), estimatedMonthlyVisits: value(62_748) },
  rankings: { available: true, rows: [
    row("manus", 1, 110_000, 12_877, "/"), row("manus ai", 1, 90_500, 10_419, "/"),
    row("ai image generator", 20, 823_000, 6_118, "/tools/ai-image-generator"), row("ai video generator", 22, 246_000, 1_058, "/playbook/video-generator"),
    row("ai photo generator", 14, 165_000, 784, "/tools/ai-image-generator"), row("is this true", 10, 74_000, 420, "/playbook/fact-checker"),
  ] },
  index: { available: true, source: "live-published-data", publishedQuestions: 291, namedIn: 0, citedIn: 0, bestPosition: null, answers: [], questions: [...assistants, unrelated] },
  yourQuestions: { completed: 0, named: 0 },
  crawl: { state: "in_index", pagesCrawled: 31, inventoryPages: 3_970, lastFetchedAt: "2026-11-07T15:57:58.118Z", profileName: "Manus: Hands On AI", topSections: [{ path: "/ar", pages: 427 }] },
};

test("a known brand on page two for big searches gets ranked, evidence-linked gaps and honest unknowns", () => {
  const report = buildWebsiteGaps(manus);
  assert.equal(report.website.domain, "manus.im");
  assert.deepEqual(report.google.brandTerms, ["manus"]);
  assert.deepEqual(report.google.bands, { top3: 2, page1: 1, page2: 2, deeper: 1 });
  assert.equal(report.google.searches[0].keyword, "manus");
  assert.equal(report.google.brandTrafficShare, 0.735);
  assert.deepEqual(report.gaps.map(gap => gap.id), ["google-near-page-one", "google-brand-dependence", "links-broken"]);
  const near = report.gaps[0];
  assert.equal(near.severity, "high");
  assert.match(near.finding, /“ai image generator” \(823K searches a month, #20\)/);
  assert.ok(!near.finding.includes("is this true"), "a page-one search is not 'just off page one'");
  assert.deepEqual(near.evidence.map(item => item.url), ["https://manus.im/tools/ai-image-generator", "https://manus.im/playbook/video-generator"]);
  assert.match(report.gaps[1].finding, /people already searching for “manus”/);
  assert.equal(report.gaps[2].title, "1,099 links point at broken pages");
  // Questions that name Manus exist but were never answered: unmeasured, not a finding.
  assert.equal(report.aiAnswers.related.total, 3);
  assert.deepEqual(report.aiAnswers.related.categories, [{ category: "AI assistants", total: 3, published: 0 }]);
  const ai = report.notChecked.find(item => item.id === "ai-answers")!;
  assert.match(ai.title, /3 questions about it are waiting for answers/);
  assert.match(ai.detail, /unmeasured, not absent/);
  assert.ok(report.notChecked.some(item => item.id === "crawl" && /31 pages of 3,970/.test(item.title)));
  assert.match(report.summary, /most of its search visits through searches for its own name/);
  assert.match(report.summary, /3 questions that mention it, but none has been answered yet/);
  assert.ok(!report.gaps.some(gap => gap.area === "ai_answers"));
});

test("a new site with no rankings and few links leads with those gaps", () => {
  const report = buildWebsiteGaps({ ...manus, website: { id: "site-folio", name: "usefolio.site", url: "https://www.usefolio.site/" },
    search: { ...manus.search, backlinks: value(3), referringDomains: value(3), brokenBacklinks: 0, rankingKeywords: none, estimatedMonthlyVisits: none },
    rankings: { available: true, rows: [] }, index: { ...manus.index, questions: [unrelated] },
    crawl: { state: "not_in_index", pagesCrawled: 0, inventoryPages: null, lastFetchedAt: null, profileName: null, topSections: [] } });
  assert.equal(report.website.domain, "usefolio.site");
  assert.deepEqual(report.gaps.map(gap => [gap.id, gap.severity]), [["google-no-rankings", "high"], ["links-few", "high"]]);
  assert.equal(report.gaps[1].title, "Only 3 websites link to it");
  assert.equal(report.summary, "Google doesn’t show usefolio.site for any US search yet. Only 3 websites link to it. No AI answer in Folio’s index names it yet, and none of the indexed questions is about what it does.");
  assert.deepEqual(report.notChecked.map(item => item.id), ["ai-answers", "crawl"]);
  assert.equal(report.notChecked[0].link?.url, "/benchmarks?website=site-folio");
});

test("answered questions that leave the site out, and its own saved answers, become AI-answer gaps", () => {
  const answered = assistants.map(item => ({ ...item, published: true }));
  const report = buildWebsiteGaps({ ...manus, index: { ...manus.index, questions: answered }, yourQuestions: { completed: 4, named: 1 } });
  const ids = report.gaps.map(gap => gap.id);
  assert.ok(ids.includes("ai-answers-left-out") && ids.includes("ai-answers-your-questions"));
  const left = report.gaps.find(gap => gap.id === "ai-answers-left-out")!;
  assert.equal(left.evidence.length, 3); assert.ok(left.evidence.every(item => item.url.startsWith("/overview?query=")));
  assert.equal(report.gaps.find(gap => gap.id === "ai-answers-your-questions")!.title, "Named in 1 of 4 answers to your questions");
  assert.ok(!report.notChecked.some(item => item.id === "ai-answers"));
});

test("missing and failed data stay unknown instead of becoming zero-valued gaps", () => {
  const report = buildWebsiteGaps({ ...manus,
    search: { state: "failed", reportId: "report", fetchedAt: null, backlinks: missing, referringDomains: missing, brokenBacklinks: null, rankingKeywords: missing, estimatedMonthlyVisits: missing },
    rankings: { available: false, rows: [] }, index: { ...manus.index, available: false, source: null, publishedQuestions: null, questions: [] }, yourQuestions: null,
    crawl: { ...manus.crawl, state: "unavailable", pagesCrawled: null, inventoryPages: null } });
  assert.deepEqual(report.gaps, []);
  assert.equal(report.google.state, "unavailable");
  assert.deepEqual(report.notChecked.map(item => item.id), ["search-report", "ai-answers"]);
  assert.equal(report.notChecked[0].title, "The last search lookup returned nothing");
  assert.equal(report.notChecked[1].title, "AI answers couldn’t be read");
  assert.equal(report.summary, "Folio has no usable saved data about manus.im yet.");
});
