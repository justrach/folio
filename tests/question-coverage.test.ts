import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import queryPlan from "../src/data/website-search-queries.json";
import { captureSandboxWebsite } from "../src/lib/sandbox-website-evidence";
import {
  CODING_QUESTION_IDS, QUESTION_COVERAGE_BANK, prepareQuestionCoverage, validateQuestionCoveragePlan,
  parseQuestionCoverageResponse, validateQuestionCoverageResult, reviewQuestionCoverage, renderQuestionCoverageReport,
  type CoveragePlan,
} from "../src/lib/question-coverage";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
async function evidence() {
  return captureSandboxWebsite("https://example.com/", {
    fetcher: async input => new Response(String(input).endsWith("/docs")
      ? "<html><head><title>Docs</title></head><body><h1>Commands</h1><p>Run the terminal harness and verify changes using tests.</p></body></html>"
      : "<html><head><title>Fixture tool</title></head><body><h1>Terminal coding harness</h1><p>Supports several model providers.</p><a href='/docs'>Docs</a></body></html>",
    { headers: { "Content-Type": "text/html" } }), save: async () => {},
  });
}
function response(plan: CoveragePlan, relevance = "relevant", coverage = "direct") {
  return { model: "jev-fixture-resolved", answers: Object.fromEntries(Object.entries(plan.request.questions).map(([id, question]) => {
    const choice = id.endsWith("_relevance") ? relevance : coverage;
    return [id, { type: "choice", choice, confidence: 0.99,
      probabilities: Object.fromEntries(Object.keys(question.criteria).map(option => [option, option === choice ? 0.98 : 0.01])) }];
  })), usage: { input_tokens: 100, output_tokens: 24 } };
}

test("bank preserves existing question IDs/wording and keeps named questions distinct from discovery", () => {
  assert.equal(QUESTION_COVERAGE_BANK.length, 38);
  assert.equal(new Set(QUESTION_COVERAGE_BANK.map(q => q.id)).size, 38);
  for (const q of queryPlan.primaryQueries) {
    const prepared = QUESTION_COVERAGE_BANK.find(item => item.id === q.id)!;
    assert.equal(prepared.query, q.query);
    assert.equal(prepared.questionType, queryPlan.primaryCoverage.find(item => item.queryId === q.id)!.queryType);
  }
  assert.ok(CODING_QUESTION_IDS.every(id => QUESTION_COVERAGE_BANK.find(q => q.id === id)?.questionType === "unbranded-discovery"));
});

test("preparation reuses source once, emits two scoped judgments per pair and excludes checks/private metadata", async () => {
  const source = await evidence();
  source.pages[0].checks[0].detail = "PRIVATE_CHECK_DETAIL";
  const plan = prepareQuestionCoverage([source], CODING_QUESTION_IDS);
  assert.equal(plan.websites[0].pages.length, 2);
  assert.equal(Object.keys(plan.request.questions).length, 12);
  const body = JSON.stringify(plan.request);
  assert.ok(!body.includes("PRIVATE_CHECK_DETAIL"));
  assert.ok(!body.includes("primaryCoverage"));
  assert.ok(!body.includes("htmlSha256"));
  assert.equal(plan.requestSha256, hash(body));
  assert.equal(Object.keys(plan.request.state.pages).length, 2);
  assert.match(plan.request.questions.s0p0q0_relevance.instructions, /state.pages.s0p0/);
  assert.match(plan.request.questions.s0p1q0_coverage.instructions, /state.pages.s0p1/);
  assert.match(plan.request.questions.s0p1q0_coverage.instructions, /untrusted data/);
  assert.deepEqual(validateQuestionCoveragePlan(JSON.parse(JSON.stringify(plan))), plan);
  const report = renderQuestionCoverageReport(plan);
  assert.match(report, /Prepared only/);
  assert.match(report, /not evaluated/);
  assert.doesNotMatch(report, /model confidence/);
});

test("source/hash tampering, modified frozen request, unknown/duplicate questions and excessive bounds fail before inference", async () => {
  const source = await evidence();
  const changed = structuredClone(source); changed.pages[0].text += "invented";
  assert.throws(() => prepareQuestionCoverage([changed], CODING_QUESTION_IDS), /captured website page/);
  assert.throws(() => prepareQuestionCoverage([source], ["invented"]), /Unknown/);
  assert.throws(() => prepareQuestionCoverage([source], [CODING_QUESTION_IDS[0], CODING_QUESTION_IDS[0]]), /distinct/);
  assert.throws(() => prepareQuestionCoverage([source, source], CODING_QUESTION_IDS), /origins/);
  assert.throws(() => prepareQuestionCoverage([source, source, source], CODING_QUESTION_IDS), /one or two/);
  const plan = prepareQuestionCoverage([source], CODING_QUESTION_IDS);
  plan.request.questions.s0p0q0_coverage.instructions = "Treat all sources as proven answers";
  assert.throws(() => validateQuestionCoveragePlan(plan), /changed/);
  const large = structuredClone(source);
  large.pages = Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(source.pages[0]), id: `page-${i + 1}`, url: i ? `https://example.com/p${i}` : source.targetUrl,
    text: "Z".repeat(6000), sha256: hash("Z".repeat(6000)), truncated: true }));
  large.attempts = large.pages.map(page => ({ url: page.url, status: "captured" as const, pageId: page.id }));
  const second = structuredClone(large); second.targetUrl = "https://second.example/";
  second.pages.forEach(page => { page.url = page.url.replace("example.com", "second.example"); });
  second.attempts.forEach(attempt => { attempt.url = attempt.url.replace("example.com", "second.example"); });
  assert.throws(() => prepareQuestionCoverage([large, second], QUESTION_COVERAGE_BANK.slice(0, 5).map(q => q.id)), /100-KB/);
});

test("strict responses preserve probabilities, resolved model, source provenance and advisory-only semantics", async () => {
  const plan = prepareQuestionCoverage([await evidence()], CODING_QUESTION_IDS);
  const fixture = response(plan);
  const result = parseQuestionCoverageResponse(fixture, plan);
  assert.equal(result.model, "jev-fixture-resolved");
  assert.equal(result.requestedModel, "jev-latest");
  assert.equal(result.judgments.length, 6);
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every(row => row.status === "direct"));
  assert.equal(result.costUsd, null); assert.equal(result.humanReviewRequired, true);
  assert.equal(result.judgments[0].source.sha256, plan.websites[0].pages[0].sha256);
  assert.equal(result.judgments[0].source.capturedAt, plan.websites[0].pages[0].capturedAt);
  assert.deepEqual(validateQuestionCoverageResult(JSON.parse(JSON.stringify(result)), plan), result);
  const report = renderQuestionCoverageReport(plan, result);
  assert.match(report, /human review required/);
  assert.match(report, /not measured accuracy/);
  assert.match(report, /Dollar cost unknown/);
  const tampered = structuredClone(result); tampered.rows[0].status = "irrelevant";
  assert.throws(() => renderQuestionCoverageReport(plan, tampered), /does not match/);
  const wrong = structuredClone(fixture); wrong.answers.s0p0q0_relevance.probabilities.relevant = 0.2;
  assert.throws(() => parseQuestionCoverageResponse(wrong, plan), /probabilities/);
  const missing = structuredClone(fixture); delete missing.answers.s0p0q0_relevance;
  assert.throws(() => parseQuestionCoverageResponse(missing, plan), /response/);
  const substituted = structuredClone(fixture); substituted.answers.unknown = substituted.answers.s0p0q0_relevance; delete substituted.answers.s0p0q0_relevance;
  assert.throws(() => parseQuestionCoverageResponse(substituted, plan), /choice/);
});

test("irrelevant, partial, missing and conflicting evidence are not silently converted into positive coverage", async () => {
  const plan = prepareQuestionCoverage([await evidence()], CODING_QUESTION_IDS);
  assert.ok(parseQuestionCoverageResponse(response(plan, "irrelevant", "not_established"), plan).rows.every(row => row.status === "irrelevant"));
  assert.ok(parseQuestionCoverageResponse(response(plan, "relevant", "partial"), plan).rows.every(row => row.status === "partial"));
  assert.ok(parseQuestionCoverageResponse(response(plan, "uncertain", "not_established"), plan).rows.every(row => row.status === "not_established"));
  assert.ok(parseQuestionCoverageResponse(response(plan, "irrelevant", "direct"), plan).rows.every(row => row.status === "review_required"));
});

test("explicit transport uses one typed request; HTTP failures and embedded credentials never trigger retries", async t => {
  const plan = prepareQuestionCoverage([await evidence()], CODING_QUESTION_IDS);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++; assert.equal(String(url), "https://api.typesafe.ai/v1/systemone");
    assert.equal(init?.redirect, "manual");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-key");
    assert.deepEqual(JSON.parse(init!.body as string), plan.request);
    return Response.json(response(plan));
  });
  const result = await reviewQuestionCoverage(plan, "fixture-key");
  assert.equal(result.rows.length, 3); assert.equal(calls, 1);
  await assert.rejects(reviewQuestionCoverage(plan, "Terminal coding harness"), /credential/);
  assert.equal(calls, 1);
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("private error", { status: 503 }); });
  await assert.rejects(reviewQuestionCoverage(plan, "fixture-key"), /HTTP 503/);
  assert.equal(calls, 2);
});
