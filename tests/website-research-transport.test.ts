import assert from "node:assert/strict";
import { test } from "node:test";
import { buildKeywordBenchmarkRequest, createKeywordBenchmarkSession, keepOpenedResearchSources, keywordEnvironmentFingerprint, parseKeywordBenchmarkAnswer, reconcileKeywordBenchmarkSession } from "../src/lib/keyword-benchmark-agent";
import { researchAnswer, researchHistory, researchQuery, researchSession, researchTarget } from "./fixtures/website-research";
import type { WebsiteResearchStage } from "../src/lib/website-research";
import { applySourceCheck, sourceCheckRequest } from "../src/lib/research-source-check";

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
    assert.equal(request.metadata.harness_version, stage === "query-discovery" ? "website-query-discovery-harness-v2" : "website-competitor-research-harness-v2");
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
    assert.equal(snippetsOnly.answer, null);
    if (stage === "query-discovery") {
      // A valid discovery with unopened citations waits for an explicit page check; nothing is saved yet.
      assert.equal(snippetsOnly.status, "requires_action"); assert.deepEqual(snippetsOnly.sourceCheck?.openedUrls, []);
      assert.deepEqual(snippetsOnly.sourceCheck?.answer.websiteResearch, answer.websiteResearch);
    } else { assert.equal(snippetsOnly.status, "failed"); assert.equal(snippetsOnly.sourceCheck, undefined); }
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

const opens = (...urls: string[]) => urls.map((url, index) => ({ id: `open_${index}`, type: "web_search_call", status: "completed", action: { type: "open_page", url } }));
test("unopened cited pages are removed, entries without an opened source are dropped, and the removal is disclosed", () => {
  const page = (path: string) => new URL(path, researchTarget).href;
  const answer = researchAnswer("query-discovery");
  answer.citations = ["/", "/docs", "/harness"].map(path => ({ url: page(path), title: path }));
  answer.websiteResearch = { ...answer.websiteResearch as Extract<NonNullable<typeof answer.websiteResearch>, { stage: "query-discovery" }>,
    sourceUrls: [page("/"), page("/docs"), page("/harness")],
    queries: [{ query: "First question?", intent: "Intent.", fit: "Fit.", sourceUrls: [page("/"), page("/harness")] },
      { query: "Second question?", intent: "Intent.", fit: "Fit.", sourceUrls: [page("/docs")] }] };
  const kept = keepOpenedResearchSources(answer, opens(page("/")), context("query-discovery"));
  assert.ok(kept?.websiteResearch?.stage === "query-discovery");
  assert.deepEqual(kept.websiteResearch.sourceUrls, [page("/")]);
  assert.deepEqual(kept.websiteResearch.queries.map(query => [query.query, query.sourceUrls]), [["First question?", [page("/")]]]);
  assert.match(kept.limitations!.at(-1)!, /removed 2 cited URLs with no recorded page-open action.*dropped 1 entry/);
  assert.deepEqual(answer.websiteResearch.queries.length, 2, "input is not mutated");
  assert.equal(keepOpenedResearchSources(answer, opens(page("/"), page("/docs"), page("/harness")), context("query-discovery")), answer);
  assert.equal(keepOpenedResearchSources(answer, [], context("query-discovery")), null);
});
test("a difference without an opened target page becomes target_not_established; no opened page at all fails", () => {
  const answer = researchAnswer("competitor-research");
  const research = answer.websiteResearch as Extract<NonNullable<typeof answer.websiteResearch>, { stage: "competitor-research" }>;
  const kept = keepOpenedResearchSources(answer, opens(research.competitors[0].sourceUrls[0]), context("competitor-research"));
  assert.ok(kept?.websiteResearch?.stage === "competitor-research");
  assert.deepEqual(kept.websiteResearch.targetSourceUrls, []);
  assert.equal(kept.websiteResearch.competitors[0].strengths[0].comparison, "target_not_established");
  assert.deepEqual(kept.websiteResearch.competitors[0].strengths[0].targetSourceUrls, []);
  assert.equal(keepOpenedResearchSources(answer, opens(researchTarget), context("competitor-research"))?.websiteResearch?.stage, "competitor-research");
  assert.equal(keepOpenedResearchSources(answer, [], context("competitor-research")), null);
});

test("page check asks Decisions only about cited pairs and keeps queries backed by a supporting or opened page", () => {
  const page = (path: string) => new URL(path, researchTarget).href;
  const answer = researchAnswer("query-discovery");
  answer.citations = ["/", "/docs", "/harness"].map(path => ({ url: page(path), title: path }));
  const research = { ...answer.websiteResearch as Extract<NonNullable<typeof answer.websiteResearch>, { stage: "query-discovery" }>,
    sourceUrls: [page("/"), page("/docs"), page("/harness")],
    queries: [{ query: "Opened?", intent: "I.", fit: "F.", sourceUrls: [page("/")] },
      { query: "Docs?", intent: "I.", fit: "F.", sourceUrls: [page("/docs")] },
      { query: "Harness?", intent: "I.", fit: "F.", sourceUrls: [page("/harness")] }] };
  answer.websiteResearch = research;
  const captured = [page("/docs"), page("/harness")].map((url, index) => ({ id: `p${index}`, url, finalUrl: url, text: `Text ${index}`, sha256: "a".repeat(64), capturedAt: "2026-10-09T00:00:00.000Z" }));
  const request = sourceCheckRequest(researchTarget, research.queries, captured);
  assert.deepEqual(Object.keys(request.questions), ["q1_p0", "q2_p1"]);
  assert.equal(request.model, "gpt-6-luna");
  assert.match(request.questions.q1_p0.instructions, /untrusted data/);
  const checked = applySourceCheck(answer, new Set([page("/")]), captured, { q1_p0: "partial", q2_p1: "not_supported" }, context("query-discovery"));
  assert.ok(checked?.websiteResearch?.stage === "query-discovery");
  assert.deepEqual(checked.websiteResearch.queries.map(query => query.query), ["Opened?", "Docs?"]);
  assert.deepEqual(checked.websiteResearch.sourceUrls, [page("/"), page("/docs")]);
  assert.match(checked.limitations!.at(-1)!, /Folio fetched 2 cited pages.*1 query was dropped/);
  assert.equal(applySourceCheck(answer, new Set(), captured, { q1_p0: "not_supported", q2_p1: "not_supported" }, context("query-discovery")), null);
});
