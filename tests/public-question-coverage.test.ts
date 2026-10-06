import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PublicSearchRankings } from "../src/lib/public-search-rankings";
import { assertPublicQuestionCoverage, coverageForRecommendation, type PublicQuestionCoverage, type PublicQuestionCoverageRecord } from "../src/lib/public-question-coverage";

/** Synthetic examples only; no provider responses or collected website evidence. */
function rankings(): PublicSearchRankings {
  return {
    format: "folio-public-search-rankings-v1",
    queries: [{ id: "fixture-query", audience: "Learning", category: "Synthetic", query: "A synthetic question?", language: "en", locale: "en-US" }],
    observations: [{
      id: "fixture-observation", queryId: "fixture-query", observedAt: "2026-09-13T00:00:00Z", status: "completed",
      model: "fixture-search-model", surface: "openai-managed-agents", searchMode: "open-web", harnessVersion: "fixture-v1", environmentType: "fixture",
      recommendations: [
        { position: 1, name: "First synthetic site", url: "https://example.com/original?ref=fixture#section", citationUrls: [] },
        { position: 2, name: "Second synthetic site", url: "https://other.example.com/", citationUrls: [] },
        { position: 3, name: "No URL", url: null, citationUrls: [] },
      ], citations: [], limitations: ["Synthetic only"],
    }],
  };
}

function fixture(): PublicQuestionCoverage {
  return { format: "folio-public-question-coverage-v1", records: [{
    observationId: "fixture-observation", queryId: "fixture-query", position: 1,
    recommendationUrl: "https://example.com/original?ref=fixture#section", websiteUrl: "https://example.com/",
    evaluatedAt: "2026-09-13T01:00:00.000Z", method: "question-page-coverage-v1",
    requestedModel: "fixture-review-model", model: "fixture-review-model-resolved", requestSha256: "a".repeat(64),
    status: "direct", captureAttemptCount: 1, humanReviewRequired: true,
    pages: [{ url: "https://example.com/docs", title: "Synthetic captured title", capturedAt: "2026-09-13T00:30:00Z",
      sha256: "b".repeat(64), truncated: false, excerpt: "Synthetic excerpt; not observed evidence.",
      relevance: { choice: "relevant", confidence: 0.8, probabilities: { relevant: 0.8, irrelevant: 0.1, uncertain: 0.1 } },
      coverage: { choice: "direct", confidence: 0.7, probabilities: { direct: 0.7, partial: 0.2, not_established: 0.1 } },
    }],
  }] };
}

function reject(change: (record: PublicQuestionCoverageRecord, artifact: PublicQuestionCoverage) => void, pattern?: RegExp): void {
  const value = fixture();
  change(value.records[0], value);
  const validate = () => assertPublicQuestionCoverage(value, rankings());
  if (pattern) assert.throws(validate, pattern);
  else assert.throws(validate);
}

function choices(page: PublicQuestionCoverageRecord["pages"][number], relevance: "relevant" | "irrelevant" | "uncertain", coverage: "direct" | "partial" | "not_established"): void {
  page.relevance = { choice: relevance, confidence: 1, probabilities: { relevant: Number(relevance === "relevant"), irrelevant: Number(relevance === "irrelevant"), uncertain: Number(relevance === "uncertain") } };
  page.coverage = { choice: coverage, confidence: 1, probabilities: { direct: Number(coverage === "direct"), partial: Number(coverage === "partial"), not_established: Number(coverage === "not_established") } };
}

test("empty coverage and valid coverage pass without mutation or fabricated records", () => {
  for (const value of [{ format: "folio-public-question-coverage-v1", records: [] }, fixture()]) {
    const before = structuredClone(value);
    assertPublicQuestionCoverage(value, rankings());
    assert.deepEqual(value, before);
  }
  assert.doesNotThrow(() => assertPublicQuestionCoverage({ format: "folio-public-question-coverage-v1", records: [] }, { format: "folio-public-search-rankings-v1", queries: [], observations: [] }));
});

test("rankings are validated even when coverage is empty", () => {
  const source = rankings(); source.observations[0].model = "";
  assert.throws(() => assertPublicQuestionCoverage({ format: "folio-public-question-coverage-v1", records: [] }, source), /model/);
  const privateSource = rankings(); Object.assign(privateSource.observations[0], { ownerId: "private-marker" });
  assert.throws(() => assertPublicQuestionCoverage(fixture(), privateSource), /allowlist/);
});

test("all object depths reject unknown/private fields and public judgments reject type:choice", () => {
  const targets: ((value: PublicQuestionCoverage) => object)[] = [
    value => value, value => value.records[0], value => value.records[0].pages[0],
    value => value.records[0].pages[0].relevance, value => value.records[0].pages[0].coverage,
    value => value.records[0].pages[0].relevance.probabilities, value => value.records[0].pages[0].coverage.probabilities,
  ];
  for (const target of targets) {
    const value = fixture(); Object.assign(target(value), { privateFixtureField: "private-marker" });
    assert.throws(() => assertPublicQuestionCoverage(value, rankings()), error => error instanceof Error && /allowlist/.test(error.message)
      && !error.message.includes("private-marker") && !error.message.includes("privateFixtureField"));
  }
  reject(record => Object.assign(record.pages[0].relevance, { type: "choice" }), /allowlist/);
  reject(record => Object.assign(record.pages[0].coverage, { type: "choice" }), /allowlist/);
});

test("missing fields, symbols, accessors, non-enumerable fields and nonplain objects fail closed", () => {
  reject(record => { Reflect.deleteProperty(record.pages[0], "excerpt"); }, /missing/);
  reject(record => { Object.defineProperty(record, Symbol("private"), { value: "private-marker" }); }, /allowlist/);
  reject(record => { Object.defineProperty(record, "model", { get() { throw new Error("must not execute"); }, enumerable: true }); }, /data fields/);
  reject(record => { Object.defineProperty(record, "model", { value: "fixture-model", enumerable: false }); }, /data fields/);
  reject(record => { Object.setPrototypeOf(record, { owner: "private-marker" }); }, /plain object/);
});

test("observation, exact query, original position and original recommendation URL must all match", () => {
  reject(record => { record.observationId = "another-observation"; }, /observation/);
  reject(record => { record.queryId = "another-query"; }, /query/);
  for (const position of [0, -1, 1.5, NaN, Infinity, 2, 3, 4]) reject(record => { record.position = position; });
  for (const url of ["https://example.com/", "https://example.com/original", "https://example.com/original?ref=fixture", "https://other.example.com/"])
    reject(record => { record.recommendationUrl = url; }, /recommendation URL/);
});

test("arrays cannot carry private metadata or executable entries", () => {
  reject((_, value) => { Object.assign(value.records, { ownerId: "private-marker" }); }, /allowlist/);
  reject(record => { Object.assign(record.pages, { rawHtml: "private-marker" }); }, /allowlist/);
  reject(record => { Object.defineProperty(record.pages, "0", { get() { throw new Error("must not execute"); }, enumerable: true }); }, /array entries/);
});

test("coverage evaluator provenance is distinct from search provenance, with strict model/hash/method fields", () => {
  assert.notEqual(fixture().records[0].model, rankings().observations[0].model);
  assert.doesNotThrow(() => assertPublicQuestionCoverage(fixture(), rankings()));
  for (const model of ["", " model", "model/name", "x".repeat(129), "model\n"]) {
    reject(record => { record.model = model; }, /model/);
    reject(record => { record.requestedModel = model; }, /requestedModel/);
  }
  for (const sha of ["", "A".repeat(64), "a".repeat(63), "g".repeat(64)]) {
    reject(record => { record.requestSha256 = sha; }, /SHA-256/);
    reject(record => { record.pages[0].sha256 = sha; }, /SHA-256/);
  }
  reject(record => Object.assign(record, { method: "other-method" }), /method/);
  reject(record => Object.assign(record, { humanReviewRequired: false }), /humanReviewRequired/);
});

test("www normalization matches only the exact recommended host, never arbitrary subdomains or suffixes", () => {
  const value = fixture(); value.records[0].websiteUrl = "https://www.example.com/"; value.records[0].pages[0].url = "https://www.example.com/docs";
  assert.doesNotThrow(() => assertPublicQuestionCoverage(value, rankings()));
  const source = rankings(); source.observations[0].recommendations[0].url = "http://www.example.com/original";
  const reverse = fixture(); reverse.records[0].recommendationUrl = source.observations[0].recommendations[0].url;
  assert.doesNotThrow(() => assertPublicQuestionCoverage(reverse, source));
  for (const host of ["docs.example.com", "www.www.example.com", "example.com.evil.com", "notexample.com", "other.example.com"]) {
    reject(record => { record.websiteUrl = `https://${host}/`; record.pages[0].url = `https://${host}/docs`; }, /recommended host/);
  }
  reject(record => { record.websiteUrl = "https://example.com/docs"; }, /canonical website origin/);
  reject(record => { record.pages[0].url = "https://www.example.com/docs"; }, /exact captured website origin/);
});

test("source URLs reject unsafe schemes, credentials, IP/local hosts, ports, query, fragment and noncanonical spelling", () => {
  const unsafe = [
    "http://example.com/", "javascript:alert(1)", "data:text/plain,private", "file:///private", "/relative",
    "https://user:password@example.com/", "https://127.0.0.1/", "https://127.1/", "https://2130706433/",
    "https://0x7f000001/", "https://10.0.0.1/", "https://172.16.0.1/", "https://192.168.1.1/", "https://169.254.169.254/",
    "https://[::1]/", "https://[::ffff:127.0.0.1]/", "https://[fc00::1]/", "https://localhost/", "https://site.local/",
    "https://site.internal/", "https://example.com:8443/", "https://example.com:443/", "https://example.com/?q=private",
    "https://example.com/#private", "https://example.com/?", "https://example.com/#", " https://example.com/",
    "https://example.com/\n", "https://example.com/../docs", "https://EXAMPLE.com/", "https://example.com", "https://example.com./",
    "https://example.com\\private",
  ];
  for (const url of unsafe) {
    reject(record => { record.websiteUrl = url; });
    reject(record => { record.pages[0].url = url; });
  }
});

test("unsafe original recommendation origins are rejected even if rankings allow them", () => {
  for (const url of ["https://127.0.0.1/", "https://[::1]/", "https://example.com:8443/", "http://site.local/"]) {
    const source = rankings(); source.observations[0].recommendations[0].url = url;
    const value = fixture(); value.records[0].recommendationUrl = url;
    assert.throws(() => assertPublicQuestionCoverage(value, source));
  }
});

test("capture/evaluation timestamps must be real UTC and evaluation cannot predate any page", () => {
  for (const time of ["not-a-date", "2026-09-13", "2026-02-30T00:00:00Z", "2026-09-13T24:00:00Z", "2026-13-01T00:00:00Z", "2026-09-13T00:00:00+00:00", "2026-09-13T00:00:00.1234Z"]) {
    reject(record => { record.evaluatedAt = time; }, /UTC/);
    reject(record => { record.pages[0].capturedAt = time; }, /UTC/);
  }
  reject(record => { record.evaluatedAt = "2026-09-13T00:29:59.999Z"; }, /predates/);
  const equal = fixture(); equal.records[0].evaluatedAt = equal.records[0].pages[0].capturedAt;
  assert.doesNotThrow(() => assertPublicQuestionCoverage(equal, rankings()));
  const leap = fixture(); leap.records[0].pages[0].capturedAt = "2024-02-29T00:00:00.1Z";
  assert.doesNotThrow(() => assertPublicQuestionCoverage(leap, rankings()));
});

test("records and pages are bounded, unique, dense and captures have bounded attempts", () => {
  reject((record, value) => { value.records.push(structuredClone(record)); }, /duplicate observation/);
  reject(record => { record.pages.push(structuredClone(record.pages[0])); record.captureAttemptCount = 2; }, /duplicate page/);
  reject((record, value) => { value.records = Array(10_001).fill(record); }, /bounds/);
  reject((_, value) => { value.records = Array(1); }, /missing entry/);
  reject(record => { record.pages = []; }, /bounds/);
  reject(record => { record.pages = Array(7).fill(record.pages[0]); }, /bounds/);
  reject(record => { record.pages = Array(1); }, /missing entry/);
  for (const count of [0, 7, 1.5, NaN, Infinity]) reject(record => { record.captureAttemptCount = count; }, /bounds/);
  reject(record => { record.pages.push({ ...structuredClone(record.pages[0]), url: "https://example.com/second" }); }, /fewer capture attempts/);
  const six = fixture(); six.records[0].captureAttemptCount = 6;
  six.records[0].pages = Array.from({ length: 6 }, (_, index) => ({ ...structuredClone(six.records[0].pages[0]), url: `https://example.com/page-${index}` }));
  assert.doesNotThrow(() => assertPublicQuestionCoverage(six, rankings()));
});

test("title, excerpt and truncation have explicit public types and bounds", () => {
  reject(record => { record.pages[0].excerpt = "x".repeat(601); });
  reject(record => { record.pages[0].title = "x".repeat(1001); });
  reject(record => Object.assign(record.pages[0], { truncated: "false" }));
  reject(record => Object.assign(record.pages[0], { excerpt: null }));
  const empty = fixture(); empty.records[0].pages[0].title = ""; empty.records[0].pages[0].excerpt = "";
  assert.doesNotThrow(() => assertPublicQuestionCoverage(empty, rankings()));
  empty.records[0].pages[0].excerpt = "x".repeat(600);
  assert.doesNotThrow(() => assertPublicQuestionCoverage(empty, rankings()));
});

test("confidence and probabilities are strict finite numbers in [0,1], with normalized sums and maximum choices", () => {
  for (const value of ["0.8", null, NaN, Infinity, -0.01, 1.01]) {
    reject(record => Object.assign(record.pages[0].relevance, { confidence: value }));
    reject(record => Object.assign(record.pages[0].coverage, { confidence: value }));
    reject(record => Object.assign(record.pages[0].relevance.probabilities, { relevant: value }));
    reject(record => Object.assign(record.pages[0].coverage.probabilities, { direct: value }));
  }
  reject(record => { record.pages[0].relevance.probabilities.relevant = 0.6; }, /inconsistent/);
  reject(record => { record.pages[0].coverage.probabilities.direct = 0.2; record.pages[0].coverage.probabilities.partial = 0.7; }, /inconsistent/);
  reject(record => Object.assign(record.pages[0].relevance, { choice: "other" }), /unknown choice/);
  reject(record => { Reflect.deleteProperty(record.pages[0].coverage.probabilities, "partial"); }, /missing/);
  const tolerance = fixture(); tolerance.records[0].pages[0].coverage.probabilities.direct = 0.7005;
  assert.doesNotThrow(() => assertPublicQuestionCoverage(tolerance, rankings()));
  const tie = fixture(); tie.records[0].pages[0].coverage.probabilities = { direct: 0.5, partial: 0.5, not_established: 0 };
  assert.doesNotThrow(() => assertPublicQuestionCoverage(tie, rankings()));
});

test("every single-page status is recomputed conservatively; uncertain or irrelevant positive coverage requires review", () => {
  for (const relevance of ["relevant", "irrelevant", "uncertain"] as const) {
    for (const coverage of ["direct", "partial", "not_established"] as const) {
      const value = fixture(); const record = value.records[0]; choices(record.pages[0], relevance, coverage);
      record.status = relevance !== "relevant" && coverage !== "not_established" ? "review_required"
        : relevance === "irrelevant" ? "irrelevant" : relevance === "uncertain" ? "not_established" : coverage;
      assert.doesNotThrow(() => assertPublicQuestionCoverage(value, rankings()));
      for (const status of ["direct", "partial", "not_established", "irrelevant", "review_required", "bogus"]) {
        if (status !== record.status) {
          const wrong = structuredClone(value); Object.assign(wrong.records[0], { status });
          assert.throws(() => assertPublicQuestionCoverage(wrong, rankings()), /status/);
        }
      }
    }
  }
});

test("strongest-page ordering is review first, then relevant direct, partial, all irrelevant, else not established", () => {
  const cases: [Parameters<typeof choices>[1], Parameters<typeof choices>[2], PublicQuestionCoverageRecord["status"]][] = [
    ["relevant", "partial", "direct"], ["uncertain", "direct", "review_required"], ["irrelevant", "partial", "review_required"],
    ["irrelevant", "not_established", "direct"], ["uncertain", "not_established", "direct"],
  ];
  for (const [relevance, coverage, expected] of cases) {
    const value = fixture(); const record = value.records[0]; record.captureAttemptCount = 2;
    const second = { ...structuredClone(record.pages[0]), url: "https://example.com/second" }; choices(second, relevance, coverage);
    record.pages.push(second); record.status = expected;
    assert.doesNotThrow(() => assertPublicQuestionCoverage(value, rankings()));
    record.pages.reverse(); assert.doesNotThrow(() => assertPublicQuestionCoverage(value, rankings()));
  }
  const partial = fixture(); const record = partial.records[0]; choices(record.pages[0], "relevant", "partial");
  const second = { ...structuredClone(record.pages[0]), url: "https://example.com/second" }; choices(second, "uncertain", "not_established");
  record.pages.push(second); record.captureAttemptCount = 2; record.status = "partial";
  assert.doesNotThrow(() => assertPublicQuestionCoverage(partial, rankings()));
});

test("lookup matches exact observation/query/position/recommendation URL, returning undefined for missing evidence", () => {
  const value = fixture(); const observation = rankings().observations[0]; const recommendation = observation.recommendations[0];
  assert.equal(coverageForRecommendation(value, observation, recommendation), value.records[0]);
  assert.equal(coverageForRecommendation(undefined, observation, recommendation), undefined);
  assert.equal(coverageForRecommendation({ format: value.format, records: [] }, observation, recommendation), undefined);
  assert.equal(coverageForRecommendation(value, { ...observation, id: "other-observation" }, recommendation), undefined);
  assert.equal(coverageForRecommendation(value, { ...observation, queryId: "other-query" }, recommendation), undefined);
  assert.equal(coverageForRecommendation(value, observation, { ...recommendation, position: 2 }), undefined);
  assert.equal(coverageForRecommendation(value, observation, { ...recommendation, url: "https://example.com/" }), undefined);
  assert.equal(coverageForRecommendation(value, observation, observation.recommendations[2]), undefined);
});

test("public module has only type imports for ranking types and no server-only, JSON or Node runtime imports", async () => {
  const source = await readFile(new URL("../src/lib/public-question-coverage.ts", import.meta.url), "utf8");
  assert.match(source, /import type \{[^}]*PublicSearchRankings[^}]*\} from "\.\/public-search-rankings"/);
  assert.doesNotMatch(source, /import[^;]*(?:server-only|node:|\.json|question-coverage["'])/);
});
