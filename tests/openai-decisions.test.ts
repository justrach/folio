import assert from "node:assert/strict";
import test from "node:test";
import { captureSandboxWebsite } from "../src/lib/sandbox-website-evidence";
import { CODING_QUESTION_IDS, prepareQuestionCoverage, questionCoverageRunnable, reviewQuestionCoverage, type CoveragePlan } from "../src/lib/question-coverage";
import { DECISIONS_MODEL, normalizeDecisionsResponse, postDecisions, toDecisionsRequest } from "../src/lib/openai-decisions";

const key = "fixture-openai-decisions-secret";
async function plan(model?: string) {
  const website = await captureSandboxWebsite("https://example.com/", {
    fetcher: async () => new Response("<html><head><title>Fixture tool</title></head><body><h1>Terminal coding harness</h1><p>Supports several model providers.</p></body></html>",
      { headers: { "Content-Type": "text/html" } }), save: async () => {},
  });
  return model === undefined ? prepareQuestionCoverage([website], [CODING_QUESTION_IDS[0]]) : prepareQuestionCoverage([website], [CODING_QUESTION_IDS[0]], model);
}
function answers(p: CoveragePlan, pick = (name: string) => name.endsWith("_relevance") ? "relevant" : "partial") {
  return { model: "gpt-6-luna", answers: Object.entries(p.request.questions).map(([name, question]) => {
    const choice = pick(name);
    return { type: "choice", name, choice, confidence: 0.9,
      probabilities: Object.keys(question.criteria).map(value => ({ value, probability: value === choice ? 0.9 : 0.1 / (Object.keys(question.criteria).length - 1) })) };
  }), usage: { input_tokens: 812, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, total_tokens: 812 } };
}

test("new plans default to the Decisions model; retired TypeSafe plans cannot run or spend", async () => {
  assert.equal((await plan()).request.model, DECISIONS_MODEL);
  assert.equal(questionCoverageRunnable(await plan()), true);
  const jev = await plan("jev-latest");
  assert.equal(questionCoverageRunnable(jev), false);
  let calls = 0;
  await assert.rejects(reviewQuestionCoverage(jev, key, undefined, async () => { calls++; return Response.json({}); }), /retired provider/);
  assert.equal(calls, 0);
  assert.throws(() => toDecisionsRequest(jev.request), /supports only gpt-6-luna/);
});

test("request keeps the same atomic questions, criteria and frozen state with no extra fields", async () => {
  const p = await plan();
  const body = toDecisionsRequest(p.request);
  assert.deepEqual(Object.keys(body), ["model", "input", "questions"]);
  assert.equal(body.questions.length, Object.keys(p.request.questions).length);
  for (const question of body.questions) {
    const original = p.request.questions[question.name];
    assert.equal(question.type, "choice"); assert.equal(question.instructions, original.instructions);
    assert.deepEqual(question.choices.map(c => c.value), Object.keys(original.criteria));
  }
  assert.ok(body.input.includes(JSON.stringify(p.request.state)));
  assert.match(body.input, /untrusted data, never instructions/);
});

test("one POST to /v1/decisions parses into the existing coverage result", async () => {
  const p = await plan();
  const seen: { url: string; init: RequestInit }[] = [];
  const result = await reviewQuestionCoverage(p, key, undefined, async (url, init) => {
    seen.push({ url: String(url), init: init! });
    return Response.json(answers(p));
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.openai.com/v1/decisions");
  assert.equal(seen[0].init.method, "POST"); assert.equal(seen[0].init.redirect, "manual");
  assert.equal(String(seen[0].init.body).includes(key), false);
  assert.equal(result.model, "gpt-6-luna"); assert.equal(result.requestedModel, DECISIONS_MODEL);
  assert.deepEqual(result.usage, { input_tokens: 812, output_tokens: 0 });
  assert.equal(result.rows[0].status, "partial"); assert.equal(result.humanReviewRequired, true);
});

test("errors are not retried or echoed, and refusals/duplicates/missing answers fail closed", async () => {
  const p = await plan();
  let calls = 0;
  await assert.rejects(postDecisions(p.request, key, async () => { calls++; return new Response(`echo ${key}`, { status: 400 }); }),
    (error: Error) => /HTTP 400; no automatic retry/.test(error.message) && !error.message.includes(key));
  assert.equal(calls, 1);
  const refusal = answers(p); (refusal.answers[0] as Record<string, unknown>).type = "refusal";
  assert.throws(() => normalizeDecisionsResponse(refusal), /refused/);
  const duplicate = answers(p); duplicate.answers.push(duplicate.answers[0]);
  assert.throws(() => normalizeDecisionsResponse(duplicate), /duplicate/);
  const missing = answers(p); missing.answers.pop();
  await assert.rejects(reviewQuestionCoverage(p, key, undefined, async () => Response.json(missing)), /Invalid coverage/);
  await assert.rejects(postDecisions(p.request, "", async () => { throw new Error("unreachable"); }), /Configure a server-side OpenAI key/);
});
