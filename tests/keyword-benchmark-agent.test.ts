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
const session = { id: "session_fixture", object: "agent.session", status: "idle", required_actions: [], environment: { id: "env_fixture", type: "none" }, metadata: { approved_hosts: "auth0.com,clerk.com" }, usage: null };
const turn = { id: "turn_fixture", session_id: session.id, status: "completed", subagent_id: null, usage: {input_tokens: 100, output_tokens: 50, total_tokens: 150} };
const items = [
  { id: "search_fixture", turn_id: turn.id, type: "web_search_call", status: "completed", action: {type: "search", query: "authentication passkeys"} },
  { id: "final_fixture", turn_id: turn.id, type: "message", role: "assistant", phase: "final_answer", status: "completed", content: [{type: "output_text", text: JSON.stringify(answer)}] },
];
const folioValidation = { id: "folio_json_schema", type: "folio_json_schema", turn_id: turn.id, status: "completed", exit_code: 0, output: "FOLIO_KEYWORD_JSON_VALID" };
function fixture(overrides: {session?: unknown;turns?: unknown[];items?: unknown[]} = {}, seen: RequestInit[] = []): typeof fetch {
  return async (url, init) => {
    seen.push(init ?? {});
    if (String(url).includes("/turns?")) return Response.json({data: overrides.turns ?? [turn], has_more: false});
    if (String(url).includes("/items?")) return Response.json({data: overrides.items ?? items, has_more: false});
    return Response.json(overrides.session ?? session, {headers: {"x-request-id": "req_fixture"}});
  };
}
test("hosted keyword payload contains only approved inputs and no hosted sandbox", async () => {
  const request = buildKeywordBenchmarkRequest({...input, baselineAnswer: "PRIVATE_BASELINE", referenceFacts: "PRIVATE_REFERENCES"} as typeof input);
  assert.equal(request.environment.type, "none");
  assert.equal("network" in request.environment, false);
  assert.equal("approved_hosts" in request.metadata ? request.metadata.approved_hosts : undefined, "auth0.com,clerk.com");
  assert.equal(request.agent.tools[0].mode, "live");
  assert.deepEqual(request.agent.tools[0].allowed_domains, ["auth0.com", "clerk.com"]);
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
test("completed research requires root final JSON and live search; hosted shells fail; reads are GET only", async () => {
  const seen: RequestInit[] = [];
  const observation = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({}, seen)});
  assert.equal(observation.status, "completed"); assert.equal(observation.answer?.mentions[0].name, "Clerk");
  assert.equal(observation.usage.totalTokens, 150); assert.equal(observation.usage.costUsd, null);
  assert.equal(observation.answer?.evidence?.find(e => e.id === "citation-support")?.outcome, "unmeasured");
  assert.equal(observation.answer?.evidence?.find(e => e.id === "folio-json-validated")?.outcome, "passed");
  assert.deepEqual(observation.answer?.collection?.validationItem, folioValidation);
  assert.ok(seen.every(init => init.method === "GET" && !init.body));
  await assert.rejects(reconcileKeywordBenchmarkSession(session.id, env, { fetcher: fixture(), expectedAllowedDomains: ["clerk.com"] }), /frozen reservation/);
  const missingSearch = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({items: items.filter(item => item.id !== "search_fixture")})});
  assert.equal(missingSearch.status, "failed"); assert.equal(missingSearch.answer, null);
  const hostedShell = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({items: [...items, { id: "command_fixture", turn_id: turn.id, type: "command_execution", status: "completed", exit_code: 0, output: "FOLIO_KEYWORD_JSON_VALID" }]})});
  assert.equal(hostedShell.status, "failed"); assert.equal(hostedShell.answer, null);
  const missingFinal = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({items: items.slice(0,1)})});
  assert.equal(missingFinal.status, "running"); assert.equal(missingFinal.answer, null);
  const noTurn = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({turns: [], items: []})});
  assert.equal(noTurn.status, "requires_action"); assert.equal(noTurn.initialInputUnconfirmed, true);
  assert.match(noTurn.error!, /initial submission remains unresolved/);
  const awaitingTurn = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({session: {...session, status: "in_progress"}, turns: [], items: []})});
  assert.equal(awaitingTurn.status, "running"); assert.equal(awaitingTurn.initialInputUnconfirmed, undefined);
  const subagent = await reconcileKeywordBenchmarkSession(session.id, env, {fetcher: fixture({turns: [{...turn, subagent_id: "child"}]})});
  assert.notEqual(subagent.status, "completed");
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

test("open-web mode uses unfiltered Astra search with environment none and a distinct identity", async () => {
  const open = { ...input, searchMode: "open-web" as const, allowedDomains: [] };
  const payload = buildKeywordBenchmarkRequest({ ...open, targetUrl: "https://private-target.example/", baselineAnswer: "PRIVATE_ANSWER", referenceFacts: "PRIVATE_FACTS" } as typeof open);
  assert.deepEqual(payload.agent.tools, [{ type: "web_search", mode: "live", context_size: "low" }]);
  assert.deepEqual(payload.environment, { type: "none" });
  assert.equal(payload.agent.model, "gpt-6-astra");
  assert.equal(payload.metadata.harness_version, "keyword-open-web-v3");
  assert.equal("search_mode" in payload.metadata ? payload.metadata.search_mode : undefined, "open-web");
  assert.ok(!JSON.stringify(payload).includes("private-target"));
  assert.ok(!JSON.stringify(payload).includes("PRIVATE_"));
  assert.ok(!("approvedResearchHosts" in JSON.parse(payload.input)));
  assert.throws(() => buildKeywordBenchmarkRequest({ ...open, allowedDomains: ["clerk.com"] }), /cannot carry/);
  assert.throws(() => buildKeywordBenchmarkRequest({ ...open, model: "another-model" }), /supported model/);
  assert.equal(keywordAgentHarnessVersion(), "keyword-research-v2");
  assert.equal(keywordAgentHarnessVersion("open-web"), "keyword-open-web-v3");
  const identity = { harness: "keyword-research-v2", environment: "none", domains: ["auth0.com", "clerk.com"], search: "live", reasoning: "low", multiAgent: false };
  assert.equal(await keywordEnvironmentFingerprint(input.allowedDomains), createHash("sha256").update(JSON.stringify(identity)).digest("hex"));
  assert.notEqual(await keywordEnvironmentFingerprint([], "open-web"), await keywordEnvironmentFingerprint(input.allowedDomains));
});

test("open-web completion preserves full provider search evidence and final answer without corpus laundering", async () => {
  const openSession = { ...session, environment: { id: "env_fixture", type: "none" }, metadata: { search_mode: "open-web" } };
  const openAnswer = { ...answer, mentions: [{ name: "Aider", url: "https://aider.chat/", reason: "Returned recommendation.", citationUrls: ["https://aider.chat/docs/"] }],
    citations: [{ url: "https://aider.chat/docs/", title: "Aider docs" }], limitations: ["One API observation, not a general ranking."] };
  const search = { ...items[0], action: { type: "search", queries: ["terminal coding harness tools"], sources: [{ type: "url", url: "https://aider.chat/docs/", title: "Aider docs" }] } };
  const openItems = [search, { ...items[1], content: [{ type: "output_text", text: JSON.stringify(openAnswer) }] }];
  const options = { fetcher: fixture({ session: openSession, items: openItems }), expectedSearchMode: "open-web" as const, expectedAllowedDomains: [] };
  const observed = await reconcileKeywordBenchmarkSession(session.id, env, options);
  assert.equal(observed.status, "completed");
  assert.equal(observed.answer?.mentions[0].name, "Aider");
  assert.equal(observed.answer?.collection?.finalAnswerJson, JSON.stringify(openAnswer));
  assert.deepEqual(observed.answer?.collection?.searchItems, [search]);
  assert.deepEqual(observed.answer?.collection?.validationItem, folioValidation);
  assert.equal(observed.answer?.collection?.sessionId, session.id);
  assert.equal(observed.answer?.collection?.rootTurnId, turn.id);
  assert.equal(observed.answer?.collection?.finalAnswerItemId, items[1].id);
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

for (const [model,label] of [["gpt-6-luna","Luna 6"],["gpt-6-sol","Sol 6"]]) test(`${label} open-web requests retain the bounded hosted search contract`,()=>{
 const payload=buildKeywordBenchmarkRequest({...input,model,searchMode:"open-web",allowedDomains:[]});
 assert.equal(payload.agent.model,model);
 assert.ok(payload.agent.instructions.includes(`single ${label} API-agent`));
 assert.doesNotMatch(payload.agent.instructions,/single Astra API-agent/);
 assert.deepEqual(payload.environment,{type:"none"});
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

test('TypeSafe is opt-in service MCP for each open-web model and changes harness provenance',()=>{
 for(const model of ['gpt-6-luna','gpt-6-sol','gpt-6-astra']) {
  const plain={...input,model,allowedDomains:[],searchMode:'open-web' as const};
  assert.equal(buildKeywordBenchmarkRequest(plain).agent.tools.length,1);
  const payload=buildKeywordBenchmarkRequest({...plain,typesafeMcp:{url:'https://folio.example.com/api/typesafe-mcp',authorization:'Bearer folio_typesafe_'+'a'.repeat(64)}});
  assert.equal(payload.agent.tools[1].type,'mcp');assert.match(payload.metadata.harness_version,/-typesafe-v1$/);
  assert.deepEqual(payload.environment,{type:'none'});assert.ok(!payload.input.includes('folio_typesafe_'));
 }
 assert.throws(()=>buildKeywordBenchmarkRequest({...input,typesafeMcp:{url:'http://localhost/api/typesafe-mcp',authorization:'secret'}}));
});
