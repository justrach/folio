import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CODEGRAFF_KEYWORD_HARNESS_VERSION, CODEGRAFF_KEYWORD_MODEL, CODEGRAFF_OPEN_WEB_HARNESS_VERSION, CODEGRAFF_OPEN_WEB_MODEL,
  assertCodegraffKeywordInput, codegraffKeywordFingerprint, codegraffKeywordHarnessVersion,
  isCodegraffKeywordSession, runCodegraffKeywordTurn, usesCodegraffKeyword,
} from "../src/lib/codegraff-keyword-agent";
import { KeywordAgentError } from "../src/lib/keyword-benchmark-agent";

const key = "cg_sk_fixture_not_a_real_key";
const env = { CODEGRAFF_API_KEY: key };
const input = {
  runId: "run_fixture", caseId: "case_fixture", query: "Which authentication tools document passkeys?",
  language: "English", locale: "en-US", model: CODEGRAFF_OPEN_WEB_MODEL, allowedDomains: [] as string[], searchMode: "open-web" as const,
};
const reviewedInput = { ...input, model: CODEGRAFF_KEYWORD_MODEL, allowedDomains: ["clerk.com"], searchMode: "reviewed-domains" as const };
const answer = {
  text: "A public-documentation comparison.",
  mentions: [{ name: "Clerk", url: "https://clerk.com/", reason: "Relevant documentation.", citationUrls: ["https://clerk.com/docs"] }],
  citations: [{ url: "https://clerk.com/docs", title: "Clerk documentation" }],
  limitations: ["Restricted to supplied search results."],
};
const search = { results: [{ title: "Clerk docs", url: "https://clerk.com/docs", text: "Passkeys are documented." }] };

test("Codegraff keyword routing stays off SEO/TypeSafe and OpenAI-only fixtures", () => {
  assert.equal(usesCodegraffKeyword(env), true);
  assert.equal(usesCodegraffKeyword({ CODEGRAFF_API_KEY: "not-a-codegraff-key" }), false);
  assert.equal(usesCodegraffKeyword(env, { useSeoTools: true }), false);
  assert.equal(usesCodegraffKeyword(env, { useTypesafeTools: true }), false);
  assert.equal(codegraffKeywordHarnessVersion("open-web"), CODEGRAFF_OPEN_WEB_HARNESS_VERSION);
  assert.equal(codegraffKeywordHarnessVersion("reviewed-domains"), CODEGRAFF_KEYWORD_HARNESS_VERSION);
  assert.equal(isCodegraffKeywordSession(`cgk_${"a".repeat(32)}`), true);
  assert.equal(isCodegraffKeywordSession("session_fixture"), false);
  assert.throws(() => assertCodegraffKeywordInput({ ...input, model: "gpt-5.6-luna" }), error => error instanceof KeywordAgentError && error.code === "INVALID_INPUT");
  assert.throws(() => assertCodegraffKeywordInput({ ...reviewedInput, model: CODEGRAFF_OPEN_WEB_MODEL }), error => error instanceof KeywordAgentError && error.code === "INVALID_INPUT");
  assert.throws(() => assertCodegraffKeywordInput({ ...input, allowedDomains: ["clerk.com"] }), error => error instanceof KeywordAgentError && error.code === "INVALID_INPUT");
  assert.throws(() => assertCodegraffKeywordInput({ ...input, seoMcp: { url: "https://example.com", authorization: "Bearer x" } }), error => error instanceof KeywordAgentError && error.code === "INVALID_INPUT");
});

test("Codegraff fingerprints stay mode-specific and omit credentials", async () => {
  const open = await codegraffKeywordFingerprint([], "open-web");
  const again = await codegraffKeywordFingerprint([], "open-web");
  const reviewed = await codegraffKeywordFingerprint(["clerk.com", "auth0.com"], "reviewed-domains");
  assert.equal(open, again);
  assert.notEqual(open, reviewed);
  assert.notEqual(open, await codegraffKeywordFingerprint([], "open-web", "gpt-6-astra"));
  assert.equal(open.includes(key), false);
  assert.match(open, /^[0-9a-f]{64}$/);
});

test("one hosted search then one glm turn; Folio JSON is required; OpenAI is never called", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const observed = await runCodegraffKeywordTurn(reviewedInput, env, {
    fetcher: async (url, init) => {
      seen.push({ url: String(url), init });
      if (String(url).includes("/v1/search")) return Response.json(search, { headers: { "x-request-id": "req_search" } });
      if (String(url).includes("/v1/chat/completions")) {
        return Response.json({ choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }, { headers: { "x-request-id": "req_chat" } });
      }
      throw new Error(`unexpected ${String(url)}`);
    },
  });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, "https://gateway.codegraff.com/v1/search");
  assert.equal(seen[1].url, "https://gateway.codegraff.com/v1/chat/completions");
  assert.ok(seen.every(call => !call.url.includes("openai") && new Headers(call.init?.headers).get("authorization") === `Bearer ${key}`));
  const chat = JSON.parse(String(seen[1].init?.body));
  assert.equal(chat.model, CODEGRAFF_KEYWORD_MODEL);
  assert.equal(observed.status, "completed");
  assert.equal(observed.answer?.mentions[0].name, "Clerk");
  assert.equal(observed.usage.totalTokens, 15);
  assert.equal(observed.usage.costUsd, null);
  assert.equal(observed.providerMetadata.searchProvider, "codegraff-gateway-v1-search");
  assert.equal(observed.providerMetadata.searchResultCount, 1);
  assert.deepEqual(observed.providerMetadata.searchHosts, ["clerk.com"]);
  assert.equal(isCodegraffKeywordSession(observed.sessionId), true);
  assert.equal(JSON.stringify(observed).includes(key), false);
});

test("open-web dispatch makes one model-native Responses search and saves only retrieved citations", async () => {
  const seen: { url: string; init?: RequestInit }[] = [];
  const response = {
    id: "resp_fixture", status: "completed", output: [
      { type: "web_search_call", status: "completed", action: { sources: [{ type: "url", url: "https://clerk.com/docs" }] } },
      { type: "message", status: "completed", content: [{ type: "output_text", text: JSON.stringify(answer) }] },
    ],
    tool_usage: { web_search: { num_requests: 1 } },
    usage: { input_tokens: 500, output_tokens: 150, total_tokens: 650 },
  };
  const fetcher: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return Response.json(response, { headers: { "x-request-id": "req_responses" } });
  };
  const observed = await runCodegraffKeywordTurn(input, env, { fetcher });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://gateway.codegraff.com/v1/responses");
  assert.equal(new Headers(seen[0].init?.headers).get("authorization"), `Bearer ${key}`);
  const body = JSON.parse(String(seen[0].init?.body));
  assert.equal(body.model, CODEGRAFF_OPEN_WEB_MODEL);
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
  assert.deepEqual(body.include, ["web_search_call.action.sources"]);
  assert.equal(body.max_tool_calls, 3);
  assert.equal(observed.status, "completed");
  assert.equal(observed.answer?.citations[0].url, "https://clerk.com/docs");
  assert.equal(observed.usage.totalTokens, 650);
  assert.equal(observed.providerMetadata.turnId, "resp_fixture");
  assert.equal(observed.providerMetadata.searchProvider, "codegraff-responses-web-search");
  assert.equal(observed.providerMetadata.searchResultCount, 1);
  assert.equal(JSON.stringify(observed).includes(key), false);

  const invented = await runCodegraffKeywordTurn(input, env, { fetcher: async () => Response.json({ ...response,
    output: [response.output[0], { type: "message", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ ...answer,
      citations: [{ url: "https://unseen.example/source", title: "Unseen" }], mentions: [] }) }] }],
  }) });
  assert.equal(invented.status, "failed");
  assert.equal(invented.answer, null);
  const incomplete = await runCodegraffKeywordTurn(input, env, { fetcher: async () => Response.json({ ...response, status: "incomplete" }) });
  assert.equal(incomplete.status, "failed");
});

test("empty search or invalid JSON fails without a second attempt; 4xx is rejected; transport stays ambiguous", async () => {
  let searches = 0;
  const empty = await runCodegraffKeywordTurn(reviewedInput, env, {
    fetcher: async (url) => {
      if (String(url).includes("/v1/search")) { searches++; return Response.json({ results: [] }); }
      throw new Error("chat should not run");
    },
  });
  assert.equal(searches, 1);
  assert.equal(empty.status, "failed");
  assert.equal(empty.answer, null);
  assert.equal(empty.providerMetadata.searchResultCount, 0);

  let chats = 0;
  const invalid = await runCodegraffKeywordTurn(reviewedInput, env, {
    fetcher: async (url) => {
      if (String(url).includes("/v1/search")) return Response.json(search);
      chats++;
      return Response.json({ choices: [{ message: { content: "not-json" } }] });
    },
  });
  assert.equal(chats, 1);
  assert.equal(invalid.status, "failed");
  assert.equal(invalid.answer, null);

  await assert.rejects(runCodegraffKeywordTurn(reviewedInput, env, { fetcher: async () => new Response("no", { status: 401 }) }),
    error => error instanceof KeywordAgentError && error.code === "UPSTREAM_ERROR" && !error.ambiguous && !error.message.includes(key));
  await assert.rejects(runCodegraffKeywordTurn(reviewedInput, env, { fetcher: async () => { throw new Error(key); } }),
    error => error instanceof KeywordAgentError && error.ambiguous && !error.message.includes(key));
});
