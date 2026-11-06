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
  for (const groups of [[], ["", " "], ["one", "two", "three", "four", "five"], ["one", "", "", "", ""], ["one", "x".repeat(61)], ["one", "bad\u0000group"]])
    assert.deepEqual(websiteCustomerGroupDrafts(groups, "collect feedback"), []);
  assert.deepEqual(websiteCustomerGroupDrafts(["small teams"], ""), []);
  assert.deepEqual(websiteCustomerGroupDrafts(["small teams"], "x".repeat(121)), []);
});
