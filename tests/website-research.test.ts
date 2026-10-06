import assert from "node:assert/strict";
import test from "node:test";
import { parseWebsiteResearch, websiteResearchInstructions, websiteResearchSchema, type WebsiteResearch, type WebsiteResearchInput } from "../src/lib/website-research";

const targetUrl = "https://folio.site/";
const targetSource = "https://www.folio.site/about";
const candidateSource = "https://aider.chat/docs/";
const discoveryInput: WebsiteResearchInput = { stage: "query-discovery", targetUrl, query: "" };
const competitorInput: WebsiteResearchInput = { stage: "competitor-research", targetUrl, query: "Which tools help review a website?" };
const discoveryAnswer = () => ({ mentions: [] as { name: string; url: string | null }[], citations: [{ url: targetSource }], limitations: [] as string[] });
const competitorAnswer = () => ({ mentions: [{ name: "Aider", url: "https://aider.chat/" }],
  citations: [{ url: targetSource }, { url: candidateSource }], limitations: [] as string[] });
function discovery(): Extract<WebsiteResearch, { stage: "query-discovery" }> {
  return { stage: "query-discovery", targetUrl, siteSummary: "A website review service.",
    queries: [{ query: "Which tools help review a website?", intent: "Find review tools", fit: "Matches the service", sourceUrls: [targetSource] }], sourceUrls: [targetSource] };
}
function competitors(): Extract<WebsiteResearch, { stage: "competitor-research" }> {
  return { stage: "competitor-research", targetUrl, query: competitorInput.query, targetSourceUrls: [targetSource],
    competitors: [{ position: 1, name: "Aider", url: "https://aider.chat/", sourceUrls: [candidateSource], strengths: [{
      finding: "Documents a specific workflow.", sourceUrls: [candidateSource], targetSourceUrls: [targetSource],
      comparison: "observed_difference", suggestion: "Explain the corresponding target workflow." }] }] };
}

test("both exact stage fixtures round-trip without mutation", () => {
  for (const [value, input, answer] of [[discovery(), discoveryInput, discoveryAnswer()], [competitors(), competitorInput, competitorAnswer()]] as const) {
    const before = JSON.stringify(value);
    assert.deepEqual(parseWebsiteResearch(value, input, answer), value);
    assert.equal(JSON.stringify(value), before);
  }
});

test("stage, target and reviewed query must match exactly", () => {
  assert.equal(parseWebsiteResearch(discovery(), competitorInput, discoveryAnswer()), null);
  assert.equal(parseWebsiteResearch(competitors(), discoveryInput, competitorAnswer()), null);
  assert.equal(parseWebsiteResearch(discovery(), { ...discoveryInput, targetUrl: "https://folio.site/other" }, discoveryAnswer()), null);
  assert.equal(parseWebsiteResearch(competitors(), { ...competitorInput, query: competitorInput.query + " " }, competitorAnswer()), null);
  assert.equal(parseWebsiteResearch(competitors(), { ...competitorInput, query: "" }, competitorAnswer()), null);
});

test("discovery is not a ranking and only cites consulted target-host pages", () => {
  const answer = discoveryAnswer();
  answer.mentions.push({ name: "Aider", url: "https://aider.chat/" });
  assert.equal(parseWebsiteResearch(discovery(), discoveryInput, answer), null);
  for (const url of [candidateSource, "https://docs.folio.site/page", "https://evilfolio.site/page", "https://folio.site./page"]) {
    const value = discovery(); value.sourceUrls = [url]; value.queries[0].sourceUrls = [url];
    assert.equal(parseWebsiteResearch(value, discoveryInput, { ...discoveryAnswer(), citations: [{ url }] }), null);
  }
  assert.equal(parseWebsiteResearch(discovery(), discoveryInput, { ...discoveryAnswer(), citations: [{ url: targetSource }, { url: candidateSource }] }), null);
});

test("invented citations and references outside stage source lists fail", () => {
  const value = discovery(); value.queries[0].sourceUrls = ["https://folio.site/missing"];
  assert.equal(parseWebsiteResearch(value, discoveryInput, discoveryAnswer()), null);
  const answer = discoveryAnswer(); answer.citations.push({ url: "https://folio.site/other" });
  assert.equal(parseWebsiteResearch(value, discoveryInput, answer), null);
  const competitor = competitors(); competitor.competitors[0].strengths[0].sourceUrls = ["https://aider.chat/other"];
  assert.equal(parseWebsiteResearch(competitor, competitorInput, competitorAnswer()), null);
  const extra = competitors(); extra.competitors[0].strengths[0].targetSourceUrls = ["https://folio.site/other"];
  assert.equal(parseWebsiteResearch(extra, competitorInput, { ...competitorAnswer(), citations: [...competitorAnswer().citations, { url: "https://folio.site/other" }] }), null);
});

test("query deduplication handles case and whitespace without rewriting accepted text", () => {
  const value = discovery(); value.queries.push({ ...value.queries[0], query: "  WHICH tools  help review a website? " });
  assert.equal(parseWebsiteResearch(value, discoveryInput, discoveryAnswer()), null);
  value.queries[1].query = "How do website review tools work?";
  assert.deepEqual(parseWebsiteResearch(value, discoveryInput, discoveryAnswer()), value);
});

test("discovery bounds, blank text, missing keys and arbitrary extras fail", () => {
  const mutations: ((value: ReturnType<typeof discovery>) => void)[] = [
    v => { v.queries = []; }, v => { v.queries = Array.from({ length: 6 }, (_, i) => ({ ...v.queries[0], query: `Query ${i}` })); },
    v => { v.siteSummary = "x".repeat(3_001); }, v => { v.siteSummary = " "; },
    v => { v.queries[0].query = "x".repeat(2_001); }, v => { v.queries[0].intent = "x".repeat(1_001); },
    v => { v.queries[0].fit = "x".repeat(1_001); }, v => { v.sourceUrls = []; },
    v => { v.queries[0].sourceUrls = []; }, v => { v.sourceUrls.push(targetSource); },
    v => { Object.assign(v, { extra: true }); }, v => { Object.assign(v.queries[0], { extra: true }); },
    v => { delete (v as Partial<typeof v>).siteSummary; },
  ];
  for (const mutate of mutations) { const value = discovery(); mutate(value); assert.equal(parseWebsiteResearch(value, discoveryInput, discoveryAnswer()), null); }
  const boundary = discovery(); boundary.siteSummary = "s".repeat(3_000); boundary.queries[0].query = "q".repeat(2_000);
  boundary.queries[0].intent = "i".repeat(1_000); boundary.queries[0].fit = "f".repeat(1_000);
  assert.ok(parseWebsiteResearch(boundary, discoveryInput, discoveryAnswer()));
});

test("competitor and target hostname attribution permits only www normalization", () => {
  for (const url of [targetSource, "https://docs.aider.chat/page", "https://notaider.chat/page"]) {
    const value = competitors(); value.competitors[0].sourceUrls = [url]; value.competitors[0].strengths[0].sourceUrls = [url];
    const answer = competitorAnswer(); answer.citations.push({ url });
    assert.equal(parseWebsiteResearch(value, competitorInput, answer), null);
  }
  const value = competitors(); const url = "https://www.aider.chat/docs/";
  value.competitors[0].sourceUrls = [url]; value.competitors[0].strengths[0].sourceUrls = [url];
  assert.ok(parseWebsiteResearch(value, competitorInput, { ...competitorAnswer(), citations: [{ url }, { url: targetSource }] }));
  value.targetSourceUrls = [candidateSource];
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
});

test("target-unmeasured comparisons stay honest and observed differences require target citations", () => {
  const value = competitors(); value.targetSourceUrls = []; value.competitors[0].strengths[0].targetSourceUrls = [];
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
  value.competitors[0].strengths[0].comparison = "target_not_established";
  assert.ok(parseWebsiteResearch(value, competitorInput, competitorAnswer()));
  value.targetSourceUrls = [targetSource]; value.competitors[0].strengths[0].comparison = "observed_difference";
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
});

test("uninspected competitors have no strengths; inspected ones require 1–3", () => {
  const value = competitors(); value.competitors[0].sourceUrls = [];
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
  value.competitors[0].strengths = [];
  assert.ok(parseWebsiteResearch(value, competitorInput, { ...competitorAnswer(), limitations: ["Candidate page was inaccessible."] }));
  value.competitors[0].sourceUrls = [candidateSource];
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
  value.competitors[0].strengths = Array.from({ length: 4 }, () => competitors().competitors[0].strengths[0]);
  assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null);
});

test("original mention order, name, URL, positions and all candidates are preserved", () => {
  const value = competitors(); const answer = competitorAnswer();
  const second = { ...structuredClone(value.competitors[0]), position: 2, name: "Second tool" };
  value.competitors.push(second); answer.mentions.push({ name: second.name, url: second.url });
  assert.ok(parseWebsiteResearch(value, competitorInput, answer));
  value.competitors.reverse();
  assert.equal(parseWebsiteResearch(value, competitorInput, answer), null);
  for (const mutation of [(v: ReturnType<typeof competitors>) => { v.competitors[0].name = "Renamed"; },
    (v: ReturnType<typeof competitors>) => { v.competitors[0].url += "other"; },
    (v: ReturnType<typeof competitors>) => { v.competitors[0].position = 2; }]) {
    const fresh = competitors(); mutation(fresh); assert.equal(parseWebsiteResearch(fresh, competitorInput, competitorAnswer()), null);
  }
  value.competitors = [second]; assert.equal(parseWebsiteResearch(value, competitorInput, answer), null);
  value.competitors = Array.from({ length: 4 }, (_, i) => ({ ...second, position: i + 1 }));
  assert.equal(parseWebsiteResearch(value, competitorInput, { ...answer, mentions: value.competitors }), null);
});

test("zero competitors require explicit nonblank root limitations and no mentions", () => {
  const value = competitors(); value.competitors = [];
  const answer = { ...competitorAnswer(), mentions: [] };
  assert.equal(parseWebsiteResearch(value, competitorInput, answer), null);
  assert.equal(parseWebsiteResearch(value, competitorInput, { ...answer, limitations: [" "] }), null);
  assert.ok(parseWebsiteResearch(value, competitorInput, { ...answer, limitations: ["No relevant candidates established."] }));
  assert.equal(parseWebsiteResearch(value, competitorInput, { ...competitorAnswer(), limitations: ["None found"] }), null);
});

test("competitor nested text bounds and additional properties are rejected", () => {
  for (const mutate of [
    (v: ReturnType<typeof competitors>) => { v.competitors[0].name = "n".repeat(301); },
    (v: ReturnType<typeof competitors>) => { v.competitors[0].strengths[0].finding = "f".repeat(1_001); },
    (v: ReturnType<typeof competitors>) => { v.competitors[0].strengths[0].suggestion = "s".repeat(1_001); },
    (v: ReturnType<typeof competitors>) => { v.competitors[0].strengths[0].sourceUrls = []; },
    (v: ReturnType<typeof competitors>) => { Object.assign(v, { limitations: [] }); },
    (v: ReturnType<typeof competitors>) => { Object.assign(v.competitors[0], { extra: true }); },
    (v: ReturnType<typeof competitors>) => { Object.assign(v.competitors[0].strengths[0], { extra: true }); },
  ]) { const value = competitors(); mutate(value); assert.equal(parseWebsiteResearch(value, competitorInput, competitorAnswer()), null); }
});

test("URL syntax rejects credentials, private hosts, invalid schemes and oversized URLs", () => {
  for (const url of ["http://127.0.0.1/", "https://private.internal/", "https://user:password@folio.site/", "file:///etc/passwd", "https://folio.site/" + "x".repeat(2_000)]) {
    assert.equal(parseWebsiteResearch({ ...discovery(), targetUrl: url }, { ...discoveryInput, targetUrl: url }, discoveryAnswer()), null);
    assert.equal(parseWebsiteResearch(discovery(), discoveryInput, { ...discoveryAnswer(), citations: [{ url }] }), null);
  }
});

test("schemas are separate, closed, bounded and fully required; instructions protect staged evidence semantics", () => {
  function closed(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const schema = node as Record<string, unknown>;
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties as object));
    }
    for (const child of Object.values(schema)) closed(child);
  }
  for (const stage of ["query-discovery", "competitor-research"] as const) {
    const schema = websiteResearchSchema(stage); closed(schema);
    assert.deepEqual(schema.properties.stage, { type: "string", enum: [stage] });
    const instructions = websiteResearchInstructions(stage);
    for (const phrase of ["web_search", "page opening", "untrusted", "No signup", "no tools besides", "private", "limitations", "causal rank"])
      assert.ok(instructions.toLowerCase().includes(phrase.toLowerCase()), phrase);
    assert.doesNotMatch(JSON.stringify(schema) + instructions, /ownerId|discoveryRunId|referenceFacts|DataForSEO|TypeSafe/);
  }
  assert.match(websiteResearchInstructions("query-discovery"), /editorial hypotheses/);
  assert.match(websiteResearchInstructions("competitor-research"), /not Google rank/);
});
