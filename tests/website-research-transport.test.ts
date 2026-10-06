import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKeywordBenchmarkRequest, createKeywordBenchmarkSession, keywordEnvironmentFingerprint, parseKeywordBenchmarkAnswer, reconcileKeywordBenchmarkSession } from "../src/lib/keyword-benchmark-agent";
import { researchAnswer, researchHistory, researchQuery, researchSession, researchTarget } from "./fixtures/website-research";
import type { WebsiteResearchStage } from "../src/lib/website-research";

const env = { OPENAI_API_KEY: "synthetic-research-secret" };
const base = { runId: "run_research", caseId: "case_research", query: researchQuery, language: "en", locale: "en-US", model: "gpt-6-luna", searchMode: "open-web" as const, allowedDomains: [] };
const context = (stage: WebsiteResearchStage) => ({ stage, targetUrl: researchTarget, query: researchQuery });

for (const stage of ["query-discovery", "competitor-research"] as const) {
  test(`${stage} has a separate OpenAI contract and projects only public inputs`, async () => {
    const request = buildKeywordBenchmarkRequest({ ...base, researchInput: context(stage), privateOwner: "PRIVATE_OWNER", referenceFacts: "PRIVATE_FACTS", previousAnswer: "PRIVATE_ANSWER" } as typeof base);
    assert.equal(request.agent.model, "gpt-6-luna");
    assert.deepEqual(request.environment, { type: "none" });
    assert.deepEqual(request.agent.tools, [{ type: "web_search", mode: "live", context_size: "low" }]);
    assert.equal(request.metadata.website_research_stage, stage);
    assert.equal(request.metadata.harness_version, stage === "query-discovery" ? "website-query-discovery-v1" : "website-competitor-research-v1");
    const body = JSON.parse(request.input);
    assert.equal(body.website, researchTarget); assert.equal(body.query, researchQuery);
    assert.equal(JSON.stringify(request).includes("PRIVATE_"), false);
    assert.equal(JSON.stringify(request).includes(env.OPENAI_API_KEY), false);
    assert.notEqual(await keywordEnvironmentFingerprint([], "open-web", stage), await keywordEnvironmentFingerprint([], "open-web"));
    assert.ok(request.agent.text.format.schema.required.includes("websiteResearch"));
    assert.equal(JSON.stringify(request.agent.text.format.schema).includes('"allOf"'), false);
  });
  test(`${stage} requires recorded page opens and retains its structured private evidence`, async () => {
    const session = researchSession(`session_${stage.replaceAll("-", "_")}`, stage), answer = researchAnswer(stage);
    const history = researchHistory(session.id, answer);
    const seen: RequestInit[] = [];
    const fixture = (includeOpens: boolean): typeof fetch => async (url, init) => {
      seen.push(init ?? {});
      if (String(url).includes("/turns?")) return Response.json({ data: [history.turn], has_more: false });
      if (String(url).includes("/items?")) return Response.json({ data: includeOpens ? history.items : history.items.filter(item => item.action?.type !== "open_page"), has_more: false });
      return Response.json(session);
    };
    const options = { expectedSearchMode: "open-web" as const, expectedAllowedDomains: [], expectedWebsiteResearch: context(stage) };
    const completed = await reconcileKeywordBenchmarkSession(session.id, env, { ...options, fetcher: fixture(true) });
    assert.equal(completed.status, "completed"); assert.deepEqual(completed.answer?.websiteResearch, answer.websiteResearch);
    assert.equal(completed.usage.costUsd, null); assert.ok(seen.every(init => init.method === "GET" && !init.body));
    const snippetsOnly = await reconcileKeywordBenchmarkSession(session.id, env, { ...options, fetcher: fixture(false) });
    assert.equal(snippetsOnly.status, "failed"); assert.equal(snippetsOnly.answer, null);
    assert.equal(parseKeywordBenchmarkAnswer(answer, [], "open-web"), null);
    assert.equal(parseKeywordBenchmarkAnswer(answer, [], "open-web", { ...context(stage), targetUrl: "https://different.com/" }), null);
  });
}
test("research never weakens the existing unbiased keyword input or allows a stage/credential mismatch", async () => {
  assert.equal(JSON.stringify(buildKeywordBenchmarkRequest({ ...base, targetUrl: researchTarget } as typeof base)).includes(researchTarget), false);
  assert.throws(() => buildKeywordBenchmarkRequest({ ...base, searchMode: "reviewed-domains", allowedDomains: ["example.com"], researchInput: context("query-discovery") }), /Invalid private/);
  assert.throws(() => buildKeywordBenchmarkRequest({ ...base, researchInput: { ...context("query-discovery"), query: "Different query" } }), /Invalid private/);
  let posts = 0;
  await assert.rejects(createKeywordBenchmarkSession({ ...base, query: env.OPENAI_API_KEY, researchInput: { ...context("competitor-research"), query: env.OPENAI_API_KEY } }, env,
    { fetcher: async () => { posts++; throw new Error("Must not submit"); } }), /credential/);
  assert.equal(posts, 0);
  const session = researchSession("session_bad_stage", "competitor-research");
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, { expectedSearchMode: "open-web", expectedAllowedDomains: [], expectedWebsiteResearch: context("query-discovery"),
    fetcher: async url => String(url).includes("/turns?") || String(url).includes("/items?") ? Response.json({ data: [], has_more: false }) : Response.json(session) }), /frozen reservation/);
});
