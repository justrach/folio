import assert from "node:assert/strict";
import test from "node:test";
import { createDemoEvaluationRun, DEMO_EXPECTED_FACTS } from "../src/lib/eval-verifier";
import { prepareCitationReview, parseCitationReview, reviewCitations } from "../src/lib/typesafe-citations";
import type { WebsiteAgentOutput } from "../src/lib/evals";

test("TypeSafe prepares narrow batched questions without reference keys or duplicate source text", async () => {
  const run = await createDemoEvaluationRun();
  run.expectedFacts = { ...DEMO_EXPECTED_FACTS, productName: "private-key-must-not-leak" };
  const request = await prepareCitationReview(run);
  assert.equal(Object.keys(request.questions).length, 2);
  assert.equal(Object.keys(request.state.sources).length, 1);
  assert.ok(!JSON.stringify(request).includes("private-key-must-not-leak"));
  assert.ok(!JSON.stringify(request).includes(run.id));
});

test("missing quotes and tampered sources fail before TypeSafe spending", async () => {
  const run = await createDemoEvaluationRun();
  (run.agentOutput as WebsiteAgentOutput).citations[0].quote = "never appeared here";
  await assert.rejects(prepareCitationReview(run), /exact occurrence/);
  run.captures[0].content += "changed";
  await assert.rejects(prepareCitationReview(run), /integrity/);
});

test("TypeSafe response validates every distribution and remains advisory at high confidence", async () => {
  const request = await prepareCitationReview(await createDemoEvaluationRun());
  const response = { model: "jev-fixture", answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {
    type: "choice", choice: "supports", confidence: 0.99, probabilities: { supports: 0.99, contradicts: 0, insufficient: 0.01 },
  }])), usage: { input_tokens: 100, output_tokens: 20 } };
  const result = parseCitationReview(response, request);
  assert.ok(result.results.every(row => row.humanReviewRequired));
  assert.equal(result.costUsd, null);
  response.answers.citation_0.probabilities.supports = 0.4;
  assert.throws(() => parseCitationReview(response, request), /probabilities/);
  delete response.answers.citation_0;
  assert.throws(() => parseCitationReview(response, request), /response/);
});

test("TypeSafe transport uses one bounded request and does not retry failures", async (t) => {
  const request = await prepareCitationReview(await createDemoEvaluationRun());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert.equal(String(url), "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-key");
    return new Response("private provider error", { status: 429 });
  });
  await assert.rejects(reviewCitations(request, "fixture-key"), /HTTP 429/);
  assert.equal(calls, 1);
});
