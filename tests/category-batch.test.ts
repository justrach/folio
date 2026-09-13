import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryBatchScope, interleaveCategories } from "../scripts/run-category-batch";
import { assertPublicSearchRankings } from "../src/lib/public-search-rankings-validation";
import { assertPublicCollectionProgress } from "../src/lib/public-dashboard";
test("expanded collection contains 100 distinct questions per existing category and preserves public artifact contracts", async () => {
  const artifact = JSON.parse(await readFile(new URL("../src/data/public-search-rankings.json", import.meta.url), "utf8"));
  const progress = JSON.parse(await readFile(new URL("../src/data/public-search-progress.json", import.meta.url), "utf8"));
  assertPublicSearchRankings(artifact); assertPublicCollectionProgress(progress, artifact.queries, artifact.observations);
  assert.equal(categoryBatchScope(artifact.queries).questionCount, 3500);
  assert.equal(categoryBatchScope(artifact.queries).categoryCount, 35);
  assert.throws(() => categoryBatchScope(artifact.queries.slice(1)));
});

test("queue interleaves existing categories without losing or duplicating questions", () => {
  const inputs = [{id:"a1",category:"a"},{id:"a2",category:"a"},{id:"b1",category:"b"},{id:"b2",category:"b"}] as Parameters<typeof interleaveCategories>[0];
  assert.deepEqual(interleaveCategories(inputs).map(query=>query.id),["a1","b1","a2","b2"]);
});
