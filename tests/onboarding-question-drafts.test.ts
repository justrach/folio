import assert from "node:assert/strict";
import test from "node:test";
import { websiteCustomerGroupDrafts, websiteQuestionDrafts } from "../src/lib/website-question-drafts";

test("onboarding drafts interleave every customer group within the ten-question suite bound", () => {
  const groups = ["small teams", "freelance designers", "design agencies", "in-house teams"];
  const task = "collect feedback";
  for (let count = 1; count <= groups.length; count++) {
    const selected = groups.slice(0, count);
    const drafts = websiteCustomerGroupDrafts(selected, task);
    assert.equal(drafts.length, 10);
    for (let i = 0; i < drafts.length; i++)
      assert.equal(drafts[i], websiteQuestionDrafts(selected[i % count], task)[Math.floor(i / count)]);
    for (const group of selected) assert.ok(drafts.slice(0, 5).some(question => question.includes(group)), "The initially selected questions cover every group.");
  }
  assert.deepEqual(websiteCustomerGroupDrafts([groups[0]], task), websiteQuestionDrafts(groups[0], task));
});

test("onboarding drafts ignore optional blank rows but never drop invalid or excessive groups", () => {
  assert.deepEqual(websiteCustomerGroupDrafts(["  small teams  ", " "], "collect feedback"), websiteQuestionDrafts("small teams", "collect feedback"));
  for (const groups of [[], ["", " "], ["one", "two", "three", "four", "five"], ["one", "", "", "", ""], ["one", "bad\u0000group"]])
    assert.deepEqual(websiteCustomerGroupDrafts(groups, "collect feedback"), []);
  assert.deepEqual(websiteCustomerGroupDrafts(["small teams"], ""), []);
  assert.deepEqual(websiteCustomerGroupDrafts(["small teams"], "x".repeat(121)), []);
});

test("long multiline descriptions normalize only for drafts without mutating customer input", () => {
  const description = `  ${"customers comparing detailed requirements ".repeat(12)}\r\n\tand  日本の購入者  `;
  const groups = [description, "  other\n buyers  "];
  const original = [...groups];
  const normalized = groups.map(group => group.trim().replace(/\s+/g, " "));
  const drafts = websiteCustomerGroupDrafts(groups, "collect feedback");
  assert.deepEqual(drafts, websiteCustomerGroupDrafts(normalized, "collect feedback"));
  assert.equal(drafts.length, 10);
  assert.ok(drafts[0].includes(normalized[0]), "Long descriptions are not truncated in questions.");
  assert.ok(drafts.every(question => !/[\r\n\t]/.test(question)));
  assert.deepEqual(groups, original, "Draft normalization must not rewrite stored descriptions.");
});

test("case-insensitive normalized duplicate groups still yield ten distinct questions and five savable selections", () => {
  const groups = ["  small\n teams  ", "SMALL\tTEAMS", "freelance designers", " Freelance   DESIGNERS "];
  const before = [...groups];
  const drafts = websiteCustomerGroupDrafts(groups, "collect feedback");
  assert.deepEqual(drafts, websiteCustomerGroupDrafts(["small teams", "freelance designers"], "collect feedback"));
  assert.equal(drafts.length, 10);
  assert.equal(new Set(drafts.map(question => question.toLowerCase())).size, 10);
  assert.equal(new Set(drafts.slice(0, 5).map(question => question.toLowerCase())).size, 5);
  assert.deepEqual(groups, before);
  assert.deepEqual(websiteCustomerGroupDrafts(["small teams", " SMALL\nTEAMS "], "collect feedback"), websiteQuestionDrafts("small teams", "collect feedback"));
  assert.deepEqual(websiteCustomerGroupDrafts(Array(5).fill("small teams"), "collect feedback"), [], "Deduplication cannot bypass the four raw rows limit.");
});
