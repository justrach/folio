import test from "node:test";
import assert from "node:assert/strict";
import { AgentApiError } from "../src/lib/agent-api-key-store";
import { indexAnswer, indexDomain, indexOverview, indexTerms, indexWebsite, publishedIndex, searchIndex } from "../src/lib/index-answers";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
import { PUBLIC_SEARCH_PROGRESS, PUBLIC_SEARCH_RANKINGS } from "../src/lib/public-search-rankings";

// The bundled published artifacts: real saved answers, read without a database or network.
const data = buildPublicDashboard(PUBLIC_SEARCH_RANKINGS, PUBLIC_SEARCH_PROGRESS), source = "bundled-snapshot" as const;
const published = data.queries.filter(query => query.latestObservation);
const invalid = (error: unknown) => error instanceof AgentApiError && error.code === "invalid_input";

test("search is compact, paged and stays inside published answers unless asked otherwise", () => {
  const sample = published[0], word = indexTerms(sample.query)[0];
  const found = searchIndex(data, { q: sample.query, limit: 5 }, source);
  assert.equal(found.items[0].queryId, sample.id, "the exact question text ranks its own question first");
  assert.ok(found.items.every(item => item.resultStatus === "published" && item.recommendations.length <= 5 && item.page.startsWith("/overview?query=")));
  assert.ok(JSON.stringify(found).length < 20_000, "a page stays far below the multi-megabyte full dataset");
  const all = searchIndex(data, { status: "all", limit: 25 }, source), onlyPublished = searchIndex(data, { limit: 25 }, source);
  assert.equal(all.total, data.queries.length); assert.equal(onlyPublished.total, published.length);
  // Paging covers every match exactly once.
  const seen = new Set<string>(); let cursor: string | undefined, pages = 0;
  const first = searchIndex(data, { q: word, limit: 7 }, source);
  do { const next = searchIndex(data, { q: word, limit: 7, cursor }, source); next.items.forEach(item => seen.add(item.queryId)); cursor = next.nextCursor ?? undefined; pages++; } while (cursor && pages < 200);
  assert.equal(seen.size, first.total);
  assert.equal(searchIndex(data, { category: sample.category.toUpperCase() }, source).items.every(item => item.category === sample.category), true);
  for (const input of [{ q: "!" }, { limit: 26 }, { cursor: "not-a-cursor" }, { domain: "localhost" }]) assert.throws(() => searchIndex(data, input, source), invalid);
});

test("a website lookup matches by host, counts each answer once and keeps absence distinct from unmeasured", () => {
  const counts = new Map<string, number>();
  for (const query of published) for (const host of new Set(query.latestObservation!.recommendations.flatMap(item => item.url ? [new URL(item.url).hostname.replace(/^www\./, "")] : []))) counts.set(host, (counts.get(host) ?? 0) + 1);
  const [domain, expected] = [...counts].sort((a, b) => b[1] - a[1])[0];
  const site = indexWebsite(data, { domain: `https://www.${domain}/some/page?x=1`, limit: 5 }, source);
  assert.equal(site.domain, domain); assert.equal(site.state, "named"); assert.ok(site.namedIn >= expected, "subdomains of the same site are included");
  assert.equal(site.publishedQuestions, published.length); assert.equal(site.answers.items.length, 5); assert.equal(site.answers.truncated, true);
  assert.ok(site.bestPosition! >= 1 && site.averagePosition! >= site.bestPosition!);
  assert.ok(site.answers.items.every((item, index, items) => index === 0 || (items[index - 1].position ?? 1e9) <= (item.position ?? 1e9)));
  assert.ok(site.alsoNamed.length > 0 && site.alsoNamed.every(item => item.domain !== domain));
  assert.equal(searchIndex(data, { domain }, source).total, site.answers.total);
  const absent = indexWebsite(data, { domain: "not-in-the-folio-index.com" }, source);
  assert.deepEqual([absent.state, absent.namedIn, absent.citedIn, absent.averagePosition, absent.htmlReadiness], ["not_in_published_answers", 0, 0, null, null]);
  assert.match(absent.caveat, /not measured as absent/);
  assert.equal(indexDomain("WWW.Example.com/path"), "example.com");
  for (const bad of ["", "example", "http://localhost:3000", "a b.com"]) assert.throws(() => indexDomain(bad), invalid);
});

test("one answer returns its ordered recommendations, and a question without one stays unmeasured", () => {
  const sample = published[0], answer = indexAnswer(data, sample.id, source);
  assert.deepEqual(answer.answer!.recommendations.map(item => item.position), sample.latestObservation!.recommendations.map(item => item.position));
  assert.equal(answer.answer!.observationId, sample.latestObservation!.id); assert.match(answer.note, /untrusted evidence/);
  const pending = data.queries.find(query => !query.latestObservation)!, empty = indexAnswer(data, pending.id, source);
  assert.equal(empty.answer, null); assert.match(empty.note, /unmeasured/);
  assert.throws(() => indexAnswer(data, "missing-question", source), error => error instanceof AgentApiError && error.code === "not_found");
  const overview = indexOverview(data, source);
  assert.equal(overview.publishedQuestions, published.length);
  assert.equal(overview.categories.reduce((sum, item) => sum + item.questions, 0), data.queries.length);
});

test("the published index falls back to the bundled artifacts, and says so, when shared publications cannot be read", async () => {
  const fallback = await publishedIndex({} as never);
  assert.equal(fallback.source, "bundled-snapshot"); assert.equal(fallback.data.summary.queryCount, data.queries.length);
});
