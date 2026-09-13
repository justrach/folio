import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { PublicSearchRankings } from "../src/lib/public-search-rankings";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";

/** Synthetic schema examples only; these are not collected rankings. */
function fixture(): PublicSearchRankings {
  return {
    format: "folio-public-search-rankings-v1",
    queries: [{ id: "fixture-query", audience: "Learning", category: "Fixture category", query: "A synthetic schema question?", language: "en", locale: "en-US" }],
    observations: [{
      id: "fixture-observation", queryId: "fixture-query", observedAt: "2026-09-13T05:00:00.000Z", status: "completed",
      model: "fixture-model", surface: "openai-managed-agents", searchMode: "open-web", harnessVersion: "fixture-harness-v1", environmentType: "fixture-hosted-environment",
      recommendations: [
        { position: 1, name: "Synthetic first item", url: "https://example.com/first", reason: "Fixture reason", citationUrls: ["https://example.com/source"] },
        { position: 2, name: "Synthetic item without a website URL", url: null, citationUrls: [] },
      ],
      citations: [{ url: "https://example.com/source", title: "Fixture source" }], limitations: ["Synthetic test fixture; not an observed recommendation."],
    }],
  };
}

test("the checked-in public rankings artifact passes its strict public projection contract", async () => {
  const artifact: unknown = JSON.parse(await readFile(new URL("../src/data/public-search-rankings.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => assertPublicSearchRankings(artifact));
});

test("empty observations and empty recommendation lists stay empty, with no fabricated zero positions", () => {
  for (const artifact of [
    { format: "folio-public-search-rankings-v1", queries: [], observations: [] },
    { ...fixture(), observations: [] },
    { ...fixture(), observations: [{ ...fixture().observations[0], recommendations: [], citations: [] }] },
    fixture(),
  ]) {
    const before = structuredClone(artifact);
    assertPublicSearchRankings(artifact);
    assert.deepEqual(artifact, before, "Validation must not fill, sort, normalize, or rewrite the public observations.");
  }
  const untitledCitation = fixture(); untitledCitation.observations[0].citations[0].title = null;
  assert.doesNotThrow(() => assertPublicSearchRankings(untitledCitation));
});

test("public projection rejects unknown private fields at every object depth without echoing their values", () => {
  const injections: [string, (artifact: ReturnType<typeof fixture>) => object][] = [
    ["privateCollectionId", artifact => artifact],
    ["ownerId", artifact => artifact.queries[0]],
    ["sessionId", artifact => artifact.observations[0]],
    ["providerResponse", artifact => artifact.observations[0]],
    ["usage", artifact => artifact.observations[0]],
    ["authorization", artifact => artifact.observations[0].recommendations[0]],
    ["account", artifact => artifact.observations[0].citations[0]],
  ];
  for (const [key, target] of injections) {
    const artifact = fixture();
    Object.assign(target(artifact), { [key]: "private-fixture-marker" });
    assert.throws(() => assertPublicSearchRankings(artifact), error => error instanceof Error
      && error.message.includes("public allowlist") && !error.message.includes("private-fixture-marker"));
  }
});

test("query and observation identifiers are unique and every observation belongs to a declared query", () => {
  const duplicateQueries = fixture(); duplicateQueries.queries.push(structuredClone(duplicateQueries.queries[0]));
  assert.throws(() => assertPublicSearchRankings(duplicateQueries), /duplicate query/);
  const duplicateObservations = fixture(); duplicateObservations.observations.push(structuredClone(duplicateObservations.observations[0]));
  assert.throws(() => assertPublicSearchRankings(duplicateObservations), /duplicate observation/);
  const unknownQuery = fixture(); unknownQuery.observations[0].queryId = "another-query";
  assert.throws(() => assertPublicSearchRankings(unknownQuery), /not declared/);
  for (const invalidId of ["", "has spaces", "UPPERCASE", "../private", "x".repeat(161)]) {
    const artifact = fixture(); artifact.queries[0].id = invalidId;
    assert.throws(() => assertPublicSearchRankings(artifact), /queries\[0\].id/);
  }
});

test("only completed open-web managed observations with explicit model and harness provenance are accepted", () => {
  for (const [key, value] of [
    ["status", "running"], ["surface", "consumer-chatgpt"], ["searchMode", "seeded-sites"],
    ["model", ""], ["harnessVersion", " "], ["environmentType", ""], ["environmentType", "x".repeat(101)],
  ]) {
    const artifact = fixture(); Object.assign(artifact.observations[0], { [key]: value });
    assert.throws(() => assertPublicSearchRankings(artifact), new RegExp(`observations\\[0\\].${key}`));
  }
  const missingStatus = fixture(); Reflect.deleteProperty(missingStatus.observations[0], "status");
  assert.throws(() => assertPublicSearchRankings(missingStatus), /status.*missing/);
  const actualProvenance = fixture(); actualProvenance.observations[0].environmentType = "provider-environment-v2";
  assert.doesNotThrow(() => assertPublicSearchRankings(actualProvenance), "Environment values are retained, not forced to a display label.");
});

test("capture dates must be real UTC timestamps rather than permissive Date.parse rollovers", () => {
  for (const observedAt of ["not-a-date", "2026-09-13", "2026-02-30T00:00:00Z", "2026-09-13T24:00:00Z", "2026-13-01T00:00:00Z"]) {
    const artifact = fixture(); artifact.observations[0].observedAt = observedAt;
    assert.throws(() => assertPublicSearchRankings(artifact), /observedAt/);
  }
  for (const observedAt of ["2024-02-29T12:00:00Z", "2026-09-13T05:00:00.1Z"]) {
    const artifact = fixture(); artifact.observations[0].observedAt = observedAt;
    assert.doesNotThrow(() => assertPublicSearchRankings(artifact));
  }
});

test("recommendation positions preserve the exact positive one-based returned order", () => {
  for (const positions of [[0, 1], [-1, 2], [1, 1], [2, 1], [1, 3], [1, 1.5]]) {
    const artifact = fixture(); artifact.observations[0].recommendations.forEach((item, index) => { item.position = positions[index]; });
    assert.throws(() => assertPublicSearchRankings(artifact), /one-based list order/);
  }
});

test("public URLs reject executable schemes and credentials; cited links must belong to their observation", () => {
  const unsafe = ["javascript:alert(1)", "data:text/html,private", "file:///private", "/relative", "https://user:password@example.com/",
    "https://example.com/?access_token=private-fixture-marker", " https://example.com/", "https://example.com/\nprivate"];
  for (const url of unsafe) {
    const artifact = fixture(); artifact.observations[0].recommendations[0].url = url;
    assert.throws(() => assertPublicSearchRankings(artifact), error => error instanceof Error && !error.message.includes("private-fixture-marker"));
    const citationArtifact = fixture(); citationArtifact.observations[0].citations[0].url = url;
    assert.throws(() => assertPublicSearchRankings(citationArtifact));
  }
  const mismatch = fixture(); mismatch.observations[0].recommendations[0].citationUrls = ["https://example.com/missing-source"];
  assert.throws(() => assertPublicSearchRankings(mismatch), /missing from this observation/);
  const http = fixture(); http.observations[0].recommendations[0].url = "http://example.com/public";
  assert.doesNotThrow(() => assertPublicSearchRankings(http));
});
