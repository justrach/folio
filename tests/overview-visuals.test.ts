import test from "node:test";
import assert from "node:assert/strict";
import { activityGrid, appearanceBreakdown, attemptBreakdown, citedDomains, scoreDomain, scoreTrend, sparkPath } from "../src/lib/overview-visuals";

test("activity grid buckets attempts into a 12-week UTC calendar", () => {
  const now = new Date("2026-11-04T10:00:00Z");
  const grid = activityGrid(["2026-11-04T01:00:00Z", "2026-11-04T09:00:00Z", "2026-11-02T09:00:00Z", "2025-01-01T00:00:00Z", "bad"], now);
  assert.equal(grid.weeks.length, 12);
  assert.ok(grid.weeks.every(week => week.length === 7));
  assert.equal(grid.total, 3);
  assert.equal(grid.activeDays, 2);
  assert.deepEqual(grid.peak, { date: "2026-11-04", count: 2, level: 4 });
  assert.equal(grid.weeks.at(-1)!.at(-1)!.date, "2026-11-07");
});

test("activity grid with no attempts has no peak", () => {
  const grid = activityGrid([], new Date("2026-11-04T00:00:00Z"));
  assert.equal(grid.total, 0);
  assert.equal(grid.peak, null);
});

test("cited domains count each answer once and flag the target", () => {
  const ranked = citedDomains([
    { citationUrls: ["https://www.example.com/a", "https://example.com/b", "https://docs.other.dev/x"] },
    { citationUrls: ["https://docs.other.dev/y", "not a url"] },
  ], "example.com");
  assert.deepEqual(ranked, [
    { domain: "docs.other.dev", answers: 2, share: 1, isTarget: false },
    { domain: "example.com", answers: 1, share: 0.5, isTarget: true },
  ]);
});

test("breakdowns keep unknown identities and unrun questions separate", () => {
  assert.deepEqual(appearanceBreakdown(["yes", "no", "unknown", "yes"]).map(row => row.count), [2, 1, 1]);
  const rows = attemptBreakdown(["completed", "running", "queued", "failed", "requires_action"], 2);
  assert.deepEqual(Object.fromEntries(rows.map(row => [row.key, row.count])), { completed: 1, pending: 2, attention: 1, failed: 1, cancelled: 0, unrun: 2 });
  assert.equal(attemptBreakdown([], null).some(row => row.key === "unrun"), false);
});

test("score trend reports a delta only with two real audits", () => {
  assert.equal(scoreTrend([{ createdAt: "2026-10-01T00:00:00Z", seoScore: 70 }]).delta, null);
  const trend = scoreTrend([{ createdAt: "2026-10-03T00:00:00Z", seoScore: 64 }, { createdAt: "2026-10-01T00:00:00Z", seoScore: 70 }]);
  assert.equal(trend.latest!.score, 64);
  assert.equal(trend.delta, -6);
  assert.equal(sparkPath([0, 100], 100, 50, 0), "0.0,50.0 100.0,0.0");
  assert.equal(sparkPath([], 100, 50), "");
  assert.deepEqual(scoreDomain([61, 72], 70), [55, 80]);
  assert.equal(sparkPath([55, 80], 100, 50, 0, [55, 80]), "0.0,50.0 100.0,0.0");
});
