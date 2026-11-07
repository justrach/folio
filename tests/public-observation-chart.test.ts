import test from "node:test";
import assert from "node:assert/strict";
import { publicObservationChart } from "../src/lib/public-observation-chart";

test("published-history bins use UTC boundaries and preserve genuinely empty dates", () => {
  const result = publicObservationChart([
    { model: "astra", observedAt: "2026-09-17T23:59:59Z" },
    { model: "astra", observedAt: "2026-09-18T00:00:00Z" },
    { model: "sol", observedAt: "2026-09-18T13:00:00Z" },
  ]);
  assert.equal(result.day.length, 14);
  assert.deepEqual(result.day.at(-1)?.vals, [1, 1]);
  assert.deepEqual(result.day.at(-2)?.vals, [1, 0]);
  assert.equal(result.day.slice(0, -2).flatMap(bar => bar.vals).reduce((a, b) => a + b, 0), 0);
  assert.equal(result.week.flatMap(bar => bar.vals).reduce((a, b) => a + b, 0), 3);
});

test("model grouping counts all remaining models once and omits older records from the displayed window", () => {
  const rows = ["a", "a", "b", "c", "d", "e"].map(model => ({ model, observedAt: "2026-09-18T10:00:00Z" }));
  const result = publicObservationChart([...rows, { model: "a", observedAt: "2026-01-01T00:00:00Z" }]);
  assert.deepEqual(result.groups, ["a", "b", "c", "Other models"]);
  assert.deepEqual(result.day.at(-1)?.vals, [2, 1, 1, 2]);
  assert.equal(result.counts.reduce((sum, item) => sum + item.count, 0), 7);
  assert.equal(result.week.flatMap(bar => bar.vals).reduce((a, b) => a + b, 0), 6);
  assert.deepEqual(publicObservationChart([]), { counts: [], groups: [], day: [], week: [] });
});
