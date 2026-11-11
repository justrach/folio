import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import READ_PLAN from "../src/data/read-plan.json";
import { batches, withLimit } from "../src/lib/sequential";

const settle = () => new Promise<void>(resolve => setImmediate(resolve));

test("withLimit keeps at most `limit` reads in flight, returns results in order, and starts nothing after a failure", async () => {
  for (const limit of [1, 2, READ_PLAN.readLimit, 9]) {
    let inFlight = 0, peak = 0;
    const tasks = Array.from({ length: 7 }, (_, index) => async () => {
      peak = Math.max(peak, ++inFlight);
      // Later reads return first, so order must come from position rather than completion.
      for (let wait = 7 - index; wait > 0; wait--) await settle();
      inFlight--;
      return index;
    });
    assert.deepEqual(await withLimit(limit, tasks), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(peak, Math.min(limit, tasks.length), `limit ${limit}`);
  }
  assert.deepEqual(await withLimit(3, []), []);
  const started: number[] = [];
  const failing = [0, 1, 2, 3, 4].map(index => async () => { started.push(index); await settle(); if (index === 0) throw new Error("read failed"); return index; });
  await assert.rejects(withLimit(2, failing), /read failed/);
  await settle(); await settle();
  assert.deepEqual(started, [0, 1], "reads not yet started when one fails are never started");
  for (const bad of [0, -1, 1.5, Number.NaN]) await assert.rejects(withLimit(bad, [async () => 1]), RangeError);
});

test("batches covers every item once, in order, in batches no larger than asked", () => {
  for (const size of [1, 2, READ_PLAN.savedRuns.batch, 250]) for (const length of [0, 1, 19, 20, 21, READ_PLAN.savedRuns.limit]) {
    const items = Array.from({ length }, (_, index) => index), result = batches(items, size);
    assert.deepEqual(result.flat(), items);
    assert.ok(result.every(batch => batch.length >= 1 && batch.length <= size));
    assert.equal(result.length, Math.ceil(length / size));
  }
  assert.throws(() => batches([1], 0), RangeError);
});

test("the read plan is the one the Lean model proves things about, and fits the connection budget", () => {
  // `lake build` checks the same equalities with #guard, but skips a module whose .lean file is unchanged.
  const lean = readFileSync(new URL("../proofs/Folio/ReadPlan.lean", import.meta.url), "utf8");
  const constant = (name: string) => Number(lean.match(new RegExp(`^def ${name} : Nat := (\\d+)$`, "m"))?.[1]);
  assert.deepEqual({ connectionBudget: constant("connectionBudget"), requestPoolMax: constant("requestPoolMax"), readLimit: constant("readLimit"),
    savedRuns: { batch: constant("runBatch"), limit: constant("runLimit") } }, READ_PLAN);
  assert.ok(READ_PLAN.readLimit <= READ_PLAN.requestPoolMax && READ_PLAN.requestPoolMax <= READ_PLAN.connectionBudget);
  // getKeywordBenchmarkRuns refuses more than 50 IDs in one read.
  assert.ok(READ_PLAN.savedRuns.batch >= 1 && READ_PLAN.savedRuns.batch <= 50);
});
