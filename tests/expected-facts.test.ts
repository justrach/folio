import assert from "node:assert/strict";
import test from "node:test";
import { expectedFactsFromRequest, parseOwnerConfirmedExpectedFacts, ExpectedFactsValidationError } from "../src/lib/expected-facts";
import { createDemoEvaluationRun, DEMO_AGENT_OUTPUT, verifyEvaluationResult } from "../src/lib/eval-verifier";

test("references are optional and unknown pricing remains absent", () => {
  assert.equal(parseOwnerConfirmedExpectedFacts(undefined, undefined), undefined);
  assert.deepEqual(parseOwnerConfirmedExpectedFacts({ productName: "  Sable Analytics  " }, true), {
    source: "owner-confirmed", productName: "Sable Analytics",
  });
});

test("explicit absent pricing and a zero price retain distinct meanings", () => {
  assert.deepEqual(parseOwnerConfirmedExpectedFacts({ pricing: null }, true), { source: "owner-confirmed", pricing: null });
  assert.deepEqual(parseOwnerConfirmedExpectedFacts({ pricing: { amount: 0, currency: "USD", interval: "month" } }, true), {
    source: "owner-confirmed", pricing: { amount: 0, currency: "USD", interval: "month" },
  });
});

test("confirmation cannot be inferred or forged as fixture provenance", () => {
  for (const confirmed of [undefined, false, "true", 1])
    assert.throws(() => parseOwnerConfirmedExpectedFacts({ productName: "Sable" }, confirmed), ExpectedFactsValidationError);
  assert.throws(() => parseOwnerConfirmedExpectedFacts({ productName: "Sable", source: "fixture" }, true), /only productName and pricing/);
  assert.throws(() => parseOwnerConfirmedExpectedFacts(undefined, true), /Supply reference answers/);
});

test("reference validation rejects empty, extra and unbounded values", () => {
  for (const value of [null, [], {}, { productName: " " }, { productName: "a".repeat(201) }, { productName: "Sable\nOverride" },
    { productName: 3 }, { productName: "Sable", extra: true }, { pricing: undefined }])
    assert.throws(() => parseOwnerConfirmedExpectedFacts(value, true), ExpectedFactsValidationError);
  for (const amount of [-1, Infinity, NaN, 1_000_000_001, "29"])
    assert.throws(() => parseOwnerConfirmedExpectedFacts({ pricing: { amount, currency: "USD", interval: "month" } }, true), ExpectedFactsValidationError);
  for (const price of [{ amount: 29, currency: "usd", interval: "month" }, { amount: 29, currency: "US", interval: "month" },
    { amount: 29, currency: "USD", interval: "monthly" }, { amount: 29, currency: "USD", interval: "month", secret: true }])
    assert.throws(() => parseOwnerConfirmedExpectedFacts({ pricing: price }, true), ExpectedFactsValidationError);
});

test("reruns and fixture demos reject client overrides before outbound work", () => {
  assert.equal(expectedFactsFromRequest({ mode: "managed", rerunOf: "saved-run" }), undefined);
  for (const body of [
    { mode: "managed", rerunOf: "saved-run", expectedFacts: { productName: "Replacement" }, confirmExpectedFacts: true },
    { mode: "managed", rerunOf: "saved-run", confirmExpectedFacts: false },
    { mode: "demo", expectedFacts: { productName: "Replacement" }, confirmExpectedFacts: true },
  ]) assert.throws(() => expectedFactsFromRequest(body), ExpectedFactsValidationError);
});

test("the verifier compares against owner references without treating omitted facts as zero", async () => {
  const demo = await createDemoEvaluationRun();
  const expectedFacts = parseOwnerConfirmedExpectedFacts({ productName: "Different product" }, true);
  const result = await verifyEvaluationResult({ captures: demo.captures, expectedFacts }, DEMO_AGENT_OUTPUT);
  assert.equal(result.checks.find((check) => check.id === "product-understanding")?.status, "fail");
  assert.equal(result.checks.find((check) => check.id === "pricing-extraction")?.status, "unmeasured");
  const noPrice = await verifyEvaluationResult({ captures: demo.captures, expectedFacts: parseOwnerConfirmedExpectedFacts({ pricing: null }, true) }, DEMO_AGENT_OUTPUT);
  assert.equal(noPrice.checks.find((check) => check.id === "pricing-extraction")?.status, "fail");
});
