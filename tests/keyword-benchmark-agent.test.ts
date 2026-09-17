import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKeywordBenchmarkRequest, cancelKeywordBenchmarkSession, createKeywordBenchmarkSession,
  keywordAllowedDomains, keywordAgentHarnessVersion, keywordEnvironmentFingerprint, KeywordAgentError,
  parseKeywordBenchmarkAnswer, reconcileKeywordBenchmarkSession,
} from "../src/lib/keyword-benchmark-agent";
import { createHash } from "node:crypto";

const env = { OPENAI_API_KEY: "fixture-keyword-secret" };
const input = { runId: "run_fixture", caseId: "case_fixture", query: "Which authentication tools document passkeys?", language: "English", locale: "en-US", model: "gpt-6-astra", allowedDomains: ["clerk.com", "auth0.com"] };
const answer = { text: "A public-documentation comparison.", mentions: [{ name: "Clerk", url: "https://clerk.com/", reason: "Relevant documentation.", citationUrls: ["https://clerk.com/docs"] }], citations: [{url: "https://clerk.com/docs", title: "Clerk documentation"}], limitations: ["Restricted to approved sources."] };
const session = { id: "session_fixture", object: "agent.session", status: "idle", required_actions: [], environment: { id: "env_fixture", type: "openai_hosted", network: {access: "restricted", allowed_domains: input.allowedDomains } }, usage: null };
const turn = { id: "turn_fixture", session_id: session.id, status: "completed", subagent_id: null, usage: {input_tokens: 100, output_tokens: 50, total_tokens: 150} };
const items = [
  { id: "search_fixture", turn_id: turn.id, type: "web_search_call", status: "completed", action: {type: "search", query: "authentication passkeys"} },
  { id: "command_fixture", turn_id: turn.id, type: "command_execution", status: "completed", exit_code: 0, output: "FOLIO_KEYWORD_JSON_VALID", command: "python validate.py" },
  { id: "final_fixture", turn_id: turn.id, type: "message", role: "assistant", phase: "final_answer", status: "completed", content: [{type: "output_text", text: JSON.stringify(answer)}] },
];
function fixture(overrides: {session?: unknown;turns?: unknown[];items?: unknown[]} = {}, seen: RequestInit[] = []): typeof fetch {
  return async (url, init) => {
    seen.push(init ?? {});
    if (String(url).includes("/turns?")) return Response.json({data: overrides.turns ?? [turn], has_more: false});
    if (String(url).includes("/items?")) return Response.json({data: overrides.items ?? items, has_more: false});
    return Response.json(overrides.session ?? session, {headers: {"x-request-id": "req_fixture"}});
  };
}
test("hosted keyword payload contains only approved inputs and independent network policies", async () => {
  const request = buildKeywordBenchmarkRequest({...input, baselineAnswer: "PRIVATE_BASELINE", referenceFacts: "PRIVATE_REFERENCES"} as typeof input);
  assert.equal(request.environment.type, "openai_hosted");
  assert.deepEqual(request.environment.network, {access: "restricted", allowed_domains: ["auth0.com", "clerk.com"]});
  assert.equal(request.agent.tools[0].mode, "live");
  assert.deepEqual(request.agent.tools[0].allowed_domains, request.environment.network.allowed_domains);
  assert.equal(request.agent.multi_agent.enabled, false);
  assert.equal(JSON.stringify(request).includes("PRIVATE_"), false);
  assert.equal(JSON.stringify(request).includes(env.OPENAI_API_KEY), false);
  assert.equal("max_tokens" in request.agent, false);
  assert.equal(await keywordEnvironmentFingerprint(input.allowedDomains), await keywordEnvironmentFingerprint([...input.allowedDomains].reverse()));
  assert.notEqual(await keywordEnvironmentFingerprint(input.allowedDomains), await keywordEnvironmentFingerprint(["clerk.com"]));
  for (const host of ["localhost", "127.0.0.1", "foo.local", "*.clerk.com", "https://clerk.com", "clerk.com:443", "CLERK.COM"]) assert.throws(() => keywordAllowedDomains([host]));
});
test("one create POST preserves metadata and treats ambiguous responses as non-retryable", async () => {
  let calls = 0;
  const receipt = await createKeywordBenchmarkSession(input, env, {fetcher: async (url, init) => {
    calls++; assert.equal(url, "https://api.openai.com/v1/agents/sessions"); assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual"); assert.equal(new Headers(init?.headers).get("OpenAI-Beta"), "agents=v1");
    return Response.json(session, {headers: {"x-request-id": "req_saved"}});
  }});
  assert.equal(calls, 1); assert.equal(receipt.sessionId, session.id); assert.equal(receipt.providerMetadata.environmentId, "env_fixture");
  assert.equal(receipt.providerMetadata.requestId, "req_saved"); assert.equal(receipt.usage.costUsd, null);
  calls = 0;
  await assert.rejects(createKeywordBenchmarkSession(input, env, {fetcher: async () => {calls++; throw new Error(env.OPENAI_API_KEY);}}),
    error => error instanceof KeywordAgentError && error.ambiguous && !error.message.includes(env.OPENAI_API_KEY));
  assert.equal(calls, 1);
  await assert.rejects(createKeywordBenchmarkSession(input, env, {fetcher: async () => Response.json({id: session.id})}),
    error => error instanceof KeywordAgentError && error.ambiguous && error.sessionId === session.id);
  await assert.rejects(createKeywordBenchmarkSession(input, env, {fetcher: async () => new Response(env.OPENAI_API_KEY, {status: 307, headers: {location: "https://example.net"}})}),
    error => error instanceof KeywordAgentError && error.status === 307 && !error.message.includes(env.OPENAI_API_KEY));
});
test("completed research requires root final JSON, search and successful sandbox evidence; reads are GET only", async () => {
  const seen: RequestInit[] = [];
  const observation = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({}, seen)});
  assert.equal(observation.status, "completed"); assert.equal(observation.answer?.mentions[0].name, "Clerk");
  assert.equal(observation.usage.totalTokens, 150); assert.equal(observation.usage.costUsd, null);
  assert.equal(observation.answer?.evidence?.find(e => e.id === "citation-support")?.outcome, "unmeasured");
  assert.ok(seen.every(init => init.method === "GET" && !init.body));
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, { fetcher: fixture(), expectedAllowedDomains: ["clerk.com"] }), /frozen reservation/);
  for (const removed of ["search_fixture", "command_fixture"]) {
    const result = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({items: items.filter(item => item.id !== removed)})});
    assert.equal(result.status, "failed"); assert.equal(result.answer, null);
  }
  const missingFinal = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({items: items.slice(0,2)})});
  assert.equal(missingFinal.status, "running"); assert.equal(missingFinal.answer, null);
  const noTurn = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({turns: [], items: []})});
  assert.equal(noTurn.status, "requires_action"); assert.equal(noTurn.initialInputUnconfirmed, true);
  assert.match(noTurn.error!, /initial submission remains unresolved/);
  const awaitingTurn = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({session: {...session, status: "in_progress"}, turns: [], items: []})});
  assert.equal(awaitingTurn.status, "running"); assert.equal(awaitingTurn.initialInputUnconfirmed, undefined);
  const subagent = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({turns: [{...turn, subagent_id: "child"}]})});
  assert.notEqual(subagent.status, "completed");
  const nullableExit = await reconcileKeywordBenchmarkSession(session.id, env, { fetcher: fixture({ items: items.map(item => item.type === "command_execution" ? { ...item, exit_code: null } : item) }) });
  assert.equal(nullableExit.status, "completed");
  assert.equal(nullableExit.answer?.evidence?.find(item => item.id === "sandbox-exit-code")?.outcome, "unmeasured");
  for (const exit_code of [1, -1, undefined]) {
    const failedCommand = await reconcileKeywordBenchmarkSession(session.id, env, { fetcher: fixture({ items: items.map(item => item.type === "command_execution" ? { ...item, exit_code } : item) }) });
    assert.equal(failedCommand.status, "failed");
  }
});
test("failed and cancelled outcomes are preserved and cancellation never creates input", async () => {
  for (const state of ["failed", "cancelled"] as const) {
    const result = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({turns: [{...turn, status: state}]})});
    assert.equal(result.status, state); assert.equal(result.answer, null);
  }
  const waiting = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({session: {...session, status: "requires_action"}})});
  assert.equal(waiting.status, "requires_action");
  let calls = 0;
  await cancelKeywordBenchmarkSession(session.id, env, {fetcher: async (url, init) => {
    calls++; assert.equal(String(url), `https://api.openai.com/v1/agents/sessions/${session.id}/events`);
    assert.deepEqual(JSON.parse(String(init?.body)), {events: [{type: "agent.session.input.cancel"}]});
    return new Response(null, {status: 204});
  }});
  assert.equal(calls, 1);
});
test("citation and response limits fail closed without inventing verified outcomes", async () => {
  assert.ok(parseKeywordBenchmarkAnswer(answer, input.allowedDomains));
  for (const url of ["http://clerk.com/docs", "https://evil.example/docs", "https://key@clerk.com/docs", "javascript:alert(1)"]) {
    assert.equal(parseKeywordBenchmarkAnswer({...answer, citations: [{url, title: "Invalid"}]}, input.allowedDomains), null);
  }
  assert.equal(parseKeywordBenchmarkAnswer({...answer, mentions: [{...answer.mentions[0], citationUrls: ["https://clerk.com/unknown"]}]}, input.allowedDomains), null);
  await assert.rejects(createKeywordBenchmarkSession(input, env, {fetcher: async () => new Response(" ".repeat(1_000_001), {headers: {"content-type": "application/json"}})}), KeywordAgentError);
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, {fetcher: async url => {
    if (String(url).includes("/items?")) return Response.json({data: [], has_more: true, last_id: "cursor"});
    return fixture()(url);
  }}), /pagination/);
});

test("open-web mode uses unfiltered Astra search with disabled shell networking and a distinct identity", async () => {
  const open = { ...input, searchMode: "open-web" as const, allowedDomains: [] };
  const payload = buildKeywordBenchmarkRequest({ ...open, targetUrl: "https://private-target.example/", baselineAnswer: "PRIVATE_ANSWER", referenceFacts: "PRIVATE_FACTS" } as typeof open);
  assert.deepEqual(payload.agent.tools, [{ type: "web_search", mode: "live", context_size: "low" }]);
  assert.deepEqual(payload.environment.network, { access: "disabled" });
  assert.equal(payload.agent.model, "gpt-6-astra");
  assert.equal(payload.metadata.harness_version, "keyword-open-web-v2");
  assert.equal(payload.metadata.search_mode, "open-web");
  assert.ok(!JSON.stringify(payload).includes("private-target"));
  assert.ok(!JSON.stringify(payload).includes("PRIVATE_"));
  assert.ok(!("approvedResearchHosts" in JSON.parse(payload.input)));
  assert.throws(() => buildKeywordBenchmarkRequest({ ...open, allowedDomains: ["clerk.com"] }), /cannot carry/);
  assert.throws(() => buildKeywordBenchmarkRequest({ ...open, model: "another-model" }), /supported model/);
  assert.equal(keywordAgentHarnessVersion(), "keyword-research-v1");
  assert.equal(keywordAgentHarnessVersion("open-web"), "keyword-open-web-v2");
  const legacyIdentity = { harness: "keyword-research-v1", environment: "openai_hosted", domains: ["auth0.com", "clerk.com"], search: "live", reasoning: "low", multiAgent: false };
  assert.equal(await keywordEnvironmentFingerprint(input.allowedDomains), createHash("sha256").update(JSON.stringify(legacyIdentity)).digest("hex"));
  assert.notEqual(await keywordEnvironmentFingerprint([], "open-web"), await keywordEnvironmentFingerprint(input.allowedDomains));
});

test("open-web completion preserves full provider search evidence and final answer without corpus laundering", async () => {
  const openSession = { ...session, environment: { ...session.environment, network: { access: "disabled" } } };
  const openAnswer = { ...answer, mentions: [{ name: "Aider", url: "https://aider.chat/", reason: "Returned recommendation.", citationUrls: ["https://aider.chat/docs/"] }],
    citations: [{ url: "https://aider.chat/docs/", title: "Aider docs" }], limitations: ["One API observation, not a general ranking."] };
  const search = { ...items[0], action: { type: "search", queries: ["terminal coding harness tools"], sources: [{ type: "url", url: "https://aider.chat/docs/", title: "Aider docs" }] } };
  const openItems = [search, items[1], { ...items[2], content: [{ type: "output_text", text: JSON.stringify(openAnswer) }] }];
  const options = { fetcher: fixture({ session: openSession, items: openItems }), expectedSearchMode: "open-web" as const, expectedAllowedDomains: [] };
  const observed = await reconcileKeywordBenchmarkSession(session.id, env, options);
  assert.equal(observed.status, "completed");
  assert.equal(observed.answer?.mentions[0].name, "Aider");
  assert.equal(observed.answer?.collection?.finalAnswerJson, JSON.stringify(openAnswer));
  assert.deepEqual(observed.answer?.collection?.searchItems, [search]);
  assert.deepEqual(observed.answer?.collection?.validationItem, items[1]);
  assert.equal(observed.answer?.collection?.sessionId, session.id);
  assert.equal(observed.answer?.collection?.rootTurnId, turn.id);
  assert.equal(observed.answer?.collection?.finalAnswerItemId, items[2].id);
  assert.equal(observed.answer?.collection?.searchMode, "open-web");
  assert.equal(observed.answer?.evidence?.find(item => item.id === "citation-support")?.outcome, "unmeasured");
  const manyCalls = await reconcileKeywordBenchmarkSession(session.id, env, { ...options,
    fetcher: fixture({ session: openSession, items: [...openItems, ...Array.from({ length: 8 }, (_, index) => ({ ...search, id: `extra_search_${index}` }))] }) });
  assert.equal(manyCalls.status, "completed");
  assert.deepEqual(manyCalls.answer?.limitations, openAnswer.limitations, "Collector diagnostics must not modify the retained model answer's public fields.");
  assert.equal(manyCalls.answer?.evidence?.find(item => item.id === "tool-call-target")?.outcome, "failed");
  assert.equal(parseKeywordBenchmarkAnswer(openAnswer, input.allowedDomains), null);
  assert.ok(parseKeywordBenchmarkAnswer(openAnswer, [], "open-web"));
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, { ...options, fetcher: fixture() }), /frozen reservation/);
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, { ...options, expectedSearchMode: "reviewed-domains", expectedAllowedDomains: input.allowedDomains }), /frozen reservation/);
  for (const url of ["https://127.0.0.1/", "https://169.254.169.254/", "https://docs.internal/", "https://localhost/", "https://user:secret@aider.chat/", "https://aider.chat:8443/", "http://aider.chat/", "javascript:alert(1)"]) {
    assert.equal(parseKeywordBenchmarkAnswer({ ...openAnswer, citations: [{ url, title: "Invalid public source" }] }, [], "open-web"), null);
  }
});

for (const [model,label] of [["gpt-5.6-luna","Luna"],["gpt-5.6-sol","Sol"],["gpt-5.6-terra","Terra"]]) test(`${label} open-web requests retain the bounded hosted search contract`,()=>{
 const payload=buildKeywordBenchmarkRequest({...input,model,searchMode:"open-web",allowedDomains:[]});
 assert.equal(payload.agent.model,model);
 assert.ok(payload.agent.instructions.includes(`single ${label} API-agent`));
 assert.doesNotMatch(payload.agent.instructions,/single Astra API-agent/);
 assert.equal(payload.environment.type,"openai_hosted");
 assert.deepEqual(payload.environment.network,{access:"disabled"});
 assert.equal(payload.agent.multi_agent.enabled,false);
});

test("recorded cache tokens come from the selected cumulative usage, never added twice", async () => {
  for (const cached of [40,0,-1,101,"40"]) {
    const result = await reconcileKeywordBenchmarkSession(session.id, env, { fetcher: fixture({
      session:{...session,usage:{input_tokens:99999,output_tokens:99999}},
      turns:[{...turn,usage:{...turn.usage,input_tokens_details:{cached_tokens:cached}}}]
    }) });
    assert.equal(result.usage.inputTokens,100);
    assert.equal(result.usage.cachedInputTokens, typeof cached === "number" && cached >= 0 && cached <= 100 ? cached : undefined);
    assert.equal(result.usage.costUsd,null);
  }
});
