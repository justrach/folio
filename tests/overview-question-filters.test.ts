import test from "node:test";
import assert from "node:assert/strict";
import { filterCounts, filterQuestions, nearestIndex, parseQuestionView, questionOutcome, scrubIndex, searchTokens } from "../src/lib/overview-question-filters";

const rows = [
  { id: "a", query: "Which tool explains a codebase?", outcome: questionOutcome("yes"), needsReview: false },
  { id: "b", query: "Best code search for monorepos", outcome: questionOutcome("no"), needsReview: true },
  { id: "c", query: "Tools to find function callers", outcome: questionOutcome("unknown"), needsReview: false },
  { id: "d", query: "Open source code intelligence", outcome: questionOutcome(null), needsReview: false },
];

test("search tokens lower-case words, keep quoted phrases and drop duplicates", () => {
  assert.deepEqual(searchTokens('  Code "code search"  CODE tool '), ["code", "code search", "tool"]);
  assert.deepEqual(searchTokens(""), []);
});

test("every token must match while selected outcome filters combine with OR", () => {
  assert.deepEqual(filterQuestions(rows, ["code"], new Set()).map(row => row.id), ["a", "b", "d"]);
  assert.deepEqual(filterQuestions(rows, ["code", "search"], new Set()).map(row => row.id), ["b"]);
  assert.deepEqual(filterQuestions(rows, [], new Set(["named", "not-measured"])).map(row => row.id), ["a", "d"]);
  assert.deepEqual(filterQuestions(rows, [], new Set(["needs-review"])).map(row => row.id), ["b"]);
  assert.deepEqual(filterQuestions(rows, ["callers"], new Set(["named"])), []);
});

test("filter counts describe the loaded rows", () => {
  assert.deepEqual(filterCounts(rows), { named: 1, "not-named": 1, unknown: 1, "not-measured": 1, "needs-review": 1 });
});

test("view preference only accepts known layouts", () => {
  assert.equal(parseQuestionView("cards"), "cards");
  assert.equal(parseQuestionView("board"), "list");
  assert.equal(parseQuestionView(null), "list");
});

test("scrubber keys and pointer positions clamp to real audits", () => {
  assert.equal(scrubIndex("ArrowLeft", 0, 4), 0);
  assert.equal(scrubIndex("ArrowRight", 3, 4), 3);
  assert.equal(scrubIndex("Home", 2, 4), 0);
  assert.equal(scrubIndex("End", 0, 4), 3);
  assert.equal(scrubIndex("PageUp", 0, 4), 3);
  assert.equal(scrubIndex("a", 1, 4), null);
  assert.equal(scrubIndex("End", 0, 0), null);
  assert.equal(nearestIndex(0.49, 3), 1);
  assert.equal(nearestIndex(-2, 3), 0);
  assert.equal(nearestIndex(9, 3), 2);
  assert.equal(nearestIndex(0.5, 1), 0);
});
