import test from "node:test";
import assert from "node:assert/strict";
import { categoryReceiptCheckpointAction } from "../scripts/category-batch-checkpoint";

test("the final slot lost during cooldown waits, then gets a receipt checkpoint instead of stopping immediately", () => {
  const state = { now: 10_000, lastCheckpoint: 9_000, cooldownUntil: 40_000, activeJobs: 0, creating: false, availableSlots: 0, pending: false };
  assert.equal(categoryReceiptCheckpointAction(state), "wait");
  assert.equal(categoryReceiptCheckpointAction({ ...state, now: 39_999, pending: true }), "wait");
  assert.equal(categoryReceiptCheckpointAction({ ...state, now: 40_000, pending: true }), "recover");
});
test("scheduled recovery drains every job and creation phase before reading, then normal collection can resume", () => {
  const state = { now: 310_000, lastCheckpoint: 0, cooldownUntil: 0, activeJobs: 2, creating: false, availableSlots: 3, pending: false };
  assert.equal(categoryReceiptCheckpointAction(state), "drain");
  assert.equal(categoryReceiptCheckpointAction({ ...state, activeJobs: 0, creating: true, pending: true }), "drain");
  assert.equal(categoryReceiptCheckpointAction({ ...state, activeJobs: 0, pending: true }), "recover");
  assert.equal(categoryReceiptCheckpointAction({ ...state, activeJobs: 0, lastCheckpoint: state.now }), "collect");
});
