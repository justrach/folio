import assert from "node:assert/strict";
import test from "node:test";
import { buildCodegraffKeywordTask, createCodegraffKeywordSession, reconcileCodegraffKeywordSession } from "../src/lib/codegraff-keyword-agent";
import { keywordBenchmarkExecutionConfig, keywordProvider } from "../src/lib/keyword-benchmark-service";
import { validateKeywordCollectionEvidence } from "../src/lib/keyword-search-mode";

const env = { CODEGRAFF_API_KEY: "cg_sk_fixture_not_real" };
const box = "3b393408-aaaa-bbbb-cccc-000000000001";
const input = { runId: "run_1", caseId: "case_1", query: "best terminal coding agents", language: "English", locale: "en-US",
  model: "gpt-6-luna", allowedDomains: [], searchMode: "open-web" as const };

/** Synthetic gateway: records requests, serves one sandbox and a supplied state file. */
function gateway(state: unknown) {
  const calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method: init?.method ?? "GET", path, body });
    if (path === "/v1/sandboxes" && init?.method === "POST") return Response.json({ id: box, state: "started", provider: "daytona" }, { status: 201 });
    if (path.endsWith("/exec")) return Response.json({ exitCode: 0, result: String(body?.command).includes("launch.sh") ? "FOLIO_AGENT_LAUNCHED\n" : "" });
    if (path.endsWith("/upload")) return Response.json({ ok: true });
    if (path.endsWith("/download")) return state === 404 ? Response.json({ error: { message: "Sandbox not found" } }, { status: 404 })
      : Response.json({ contentBase64: Buffer.from(JSON.stringify(state)).toString("base64") });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { calls, fetcher };
}

const answer = {
  text: "Shortlist from retrieved sources.",
  mentions: [{ name: "Aider", url: "https://aider.chat/", reason: "Terminal pair programming.", citationUrls: ["https://aider.chat/docs/"] }],
  citations: [{ url: "https://aider.chat/docs/", title: "Aider docs" }],
  limitations: ["Not a benchmark."],
};
const completed = (text: string, extra: Record<string, unknown> = {}) => ({
  state: "completed", model: "gpt-6-luna", text, error: null, toolCalls: [{ name: "mcp__folio__web_search", input: "{}", isError: false }],
  searches: [{ query: "terminal coding agents", ok: true, results: [{ url: "https://aider.chat/docs", title: "Aider" }], costMicroUsd: 5000 }],
  fetches: [], repairTurns: 0, repairIssues: [], firstAttemptText: null, usage: { inputTokens: 1000, outputTokens: 200, costUsd: 0.002, apiCalls: 3 },
  startedAt: "2026-11-11T00:00:00.000Z", finishedAt: "2026-11-11T00:01:00.000Z", ...extra,
});

test("Codegraff keyword task withholds targets, caps searches and requires retrieved citations", () => {
  const task = buildCodegraffKeywordTask(input);
  assert.equal(task.model, "codegraff/gpt-6-luna");
  assert.equal(task.maxSearches, 5);
  assert.equal(task.requireRetrievedCitations, true);
  assert.deepEqual(JSON.parse(task.prompt), { query: "best terminal coding agents", language: "English", locale: "en-US", scope: "Public web research; returned recommendation order only" });
  assert.throws(() => buildCodegraffKeywordTask({ ...input, model: "gpt-6.1-terra" }));
  assert.throws(() => buildCodegraffKeywordTask({ ...input, seoMcp: { url: "https://usefolio.site/api/x", authorization: "Bearer x" } }));
  const reviewed = buildCodegraffKeywordTask({ ...input, searchMode: "reviewed-domains", allowedDomains: ["aider.chat"] });
  assert.deepEqual(reviewed.includeDomains, ["aider.chat"]);
});

test("creation makes one standard (non-fleet) sandbox and never puts the key in the task", async () => {
  const { calls, fetcher } = gateway(null);
  const receipt = await createCodegraffKeywordSession(input, env, { fetcher });
  assert.equal(receipt.sessionId, `cgs_${box}`);
  assert.equal(receipt.status, "in_progress");
  const creates = calls.filter(call => call.path === "/v1/sandboxes");
  assert.equal(creates.length, 1);
  assert.equal(creates[0].body?.provider, "daytona");
  const task = calls.find(call => String(call.body?.path).endsWith("/task.json"));
  assert.ok(task && !Buffer.from(String(task.body?.contentBase64), "base64").toString().includes("cg_sk_"));
  assert.ok(calls.some(call => String(call.body?.command).includes("launch.sh")));
});

test("a completed run yields a validated answer, usage with search cost, and collection evidence", async () => {
  const { fetcher } = gateway(completed(JSON.stringify(answer)));
  const observation = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher, expectedSearchMode: "open-web" });
  assert.equal(observation.status, "completed");
  assert.equal(observation.answer?.mentions[0].name, "Aider");
  assert.equal(observation.usage.costUsd, 0.007);
  assert.equal(observation.providerMetadata.turnId, `cgt_${box}`);
  const collection = validateKeywordCollectionEvidence(observation.answer!.collection);
  assert.equal(collection.rootTurnId, `cgt_${box}`);
  assert.equal(collection.validationItem.type, "folio_host_validation");
  assert.ok(observation.answer!.evidence!.some(item => item.id === "citations-retrieved" && item.outcome === "passed"));
});

test("citations the run never retrieved, or answers without search, are rejected", async () => {
  const invented = { ...answer, citations: [{ url: "https://example-invented.dev/page", title: "x" }],
    mentions: [{ ...answer.mentions[0], citationUrls: ["https://example-invented.dev/page"] }] };
  const rejected = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway(completed(JSON.stringify(invented))).fetcher, expectedSearchMode: "open-web" });
  assert.equal(rejected.status, "failed");
  assert.match(rejected.error!, /not retrieved/);
  const fetched = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway(completed(JSON.stringify(invented), { fetches: ["https://example-invented.dev/page"] })).fetcher, expectedSearchMode: "open-web" });
  assert.equal(fetched.status, "completed");
  const noSearch = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway(completed(JSON.stringify(answer), { searches: [] })).fetcher, expectedSearchMode: "open-web" });
  assert.equal(noSearch.status, "failed");
});

test("running, failed and vanished sandboxes map onto run states", async () => {
  const running = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway({ state: "running", toolCalls: [], searches: [] }).fetcher, expectedSearchMode: "open-web" });
  assert.equal(running.status, "running");
  const failed = await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway({ state: "failed", error: "provider said: secret detail", toolCalls: [] }).fetcher, expectedSearchMode: "open-web" });
  assert.equal(failed.status, "failed");
  assert.doesNotMatch(failed.error!, /secret detail/);
  assert.equal((await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway(404).fetcher, expectedSearchMode: "open-web" })).status, "failed");
  assert.equal((await reconcileCodegraffKeywordSession(`cgs_${box}`, env, { fetcher: gateway(404).fetcher, expectedSearchMode: "open-web", cancelRequested: true })).status, "cancelled");
});

test("provider selection prefers Codegraff and keeps OpenAI for tools, unserved models and explicit override", async () => {
  const both = { ...env, OPENAI_API_KEY: "fixture-not-real" };
  assert.equal(keywordProvider(both, "gpt-6-luna"), "codegraff");
  assert.equal(keywordProvider(both, "gpt-6-luna", { seo: true }), "openai");
  assert.equal(keywordProvider(both, "gpt-6.1-terra"), "openai");
  assert.equal(keywordProvider({ ...both, KEYWORD_AGENT_PROVIDER: "openai" }, "gpt-6-luna"), "openai");
  assert.equal(keywordProvider({ OPENAI_API_KEY: "fixture-not-real" }, "gpt-6-luna"), "openai");
  const config = await keywordBenchmarkExecutionConfig({ query: "q", targetUrl: null, language: "English", locale: "en-US", rubricVersion: "v1", searchMode: "open-web" }, both);
  assert.equal(config.environmentType, "codegraff_sandbox");
  assert.equal(config.harnessVersion, "keyword-open-web-codegraff-v1");
  const tools = await keywordBenchmarkExecutionConfig({ query: "q", targetUrl: null, language: "English", locale: "en-US", rubricVersion: "v1", searchMode: "open-web" }, both, { useTypesafeTools: true });
  assert.equal(tools.environmentType, "openai_hosted");
});
