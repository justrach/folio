import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { agentIdentifier, agentMaxAge, agentObservationKind, onlyFields, parseAgentKeyInput, parseAgentObservation, parseAgentQuery } from "../src/lib/agent-api-input";
import { AgentApiError, createAgentApiKey } from "../src/lib/agent-api-key-store";
import { AGENT_API_ENDPOINTS, agentApiMarkdown, agentOpenApiSpec } from "../src/lib/agent-api-reference";
import { GET as openApiResponse } from "../src/app/api/openapi.json/route";
import { GET as markdownResponse } from "../src/app/docs/api/reference.md/route";
import { agentApiErrorResponse } from "../src/lib/agent-api";
import { KeywordBenchmarkStoreError } from "../src/lib/keyword-benchmark-store";
import { EvalStoreError } from "../src/lib/eval-store";

const invalid = (action: () => unknown) => assert.throws(action, (error: unknown) => error instanceof AgentApiError && error.status === 400);

test("agent selectors accept only the exact corresponding saved ID and known fields", () => {
  assert.deepEqual(parseAgentObservation({kind: "website", websiteId: "site_1"}), {kind: "website", websiteId: "site_1", maxAgeSeconds: 86400});
  assert.deepEqual(parseAgentObservation({kind: "keyword", caseId: "case-1", maxAgeSeconds: 0}), {kind: "keyword", caseId: "case-1", maxAgeSeconds: 0});
  for (const input of [
    {kind: "keyword", caseId: "case-1", websiteId: "site-1"},
    {kind: "website", caseId: "case-1"}, {kind: "keyword", websiteId: "site-1"},
    {kind: "keyword", caseId: "case-1", ownerId: "another-owner"},
    {kind: "keyword", caseId: "case-1", query: "Replacement prompt"},
    {kind: "website", websiteId: "site-1", url: "https://replacement.example/"},
    {kind: "keyword", caseId: "case-1", model: "override"},
  ]) invalid(() => parseAgentObservation(input));
  for (const value of [undefined, null, "", "KEYWORD", "run"]) invalid(() => agentObservationKind(value));
  for (const value of [undefined, null, 2, "", "a/b", "a?b", " a", "a b", "a".repeat(129), "_first", "-first"]) invalid(() => agentIdentifier(value));
  assert.equal(agentIdentifier("A" + "b".repeat(127)), "A" + "b".repeat(127));
  invalid(() => onlyFields({unexpected: true}, []));
});

test("agent query parser rejects duplicate, mixed, unknown and prototype-named parameters", () => {
  const parse = (query: string) => parseAgentObservation(parseAgentQuery(`https://folio.example/api/v1/observations?${query}`));
  assert.deepEqual(parse("kind=keyword&caseId=case_1&maxAgeSeconds=0"), {kind: "keyword", caseId: "case_1", maxAgeSeconds: 0});
  for (const query of [
    "kind=keyword&kind=keyword&caseId=case_1", "kind=keyword&caseId=one&caseId=two",
    "kind=keyword&caseId=case_1&maxAgeSeconds=0&maxAgeSeconds=1",
    "kind=keyword&caseId=case_1&%63aseId=case_2", "kind=keyword&caseId=case_1&websiteId=site_1",
    "kind=keyword&caseId=case_1&ownerId=other", "kind=keyword&caseId=case_1&__proto__=ignored",
    "kind=keyword&caseId=case_1&constructor=ignored", "kind=keyword&caseId=case_1&toString=ignored",
  ]) invalid(() => parse(query));
  for (const value of ["", "-1", "1.5", "1e3", "+1", "Infinity", "NaN", " 1", "604801", "999999999999999999999999"])
    invalid(() => parse(`kind=keyword&caseId=case_1&maxAgeSeconds=${encodeURIComponent(value)}`));
});

test("freshness defaults to one day; zero and seven days are preserved without coercion", () => {
  assert.equal(agentMaxAge(undefined), 86400);
  for (const value of [0, 1, 86400, 604800]) assert.equal(agentMaxAge(value), value);
  for (const value of [-1, 604801, 0.1, NaN, Infinity, null, true, "0", "86400"]) invalid(() => agentMaxAge(value));
});

test("key request projection rejects overrides and invalid scopes/lifetimes fail before database access", async () => {
  assert.deepEqual(parseAgentKeyInput({name: "Research", scopes: ["read"]}), {name: "Research", scopes: ["read"]});
  for (const input of [{name: "Research", scopes: ["read"], ownerId: "other"}, {name: "Research", scopes: ["admin"]}, {name: "Research", scopes: "read"}, {name: "Research", scopes: ["read"], expiresInDays: "30"}])
    invalid(() => parseAgentKeyInput(input));
  const db = {prepare() { throw new Error("Invalid key input must never reach D1"); }} as unknown as D1Database;
  for (const input of [
    {name: "Research", scopes: ["read", "read"]}, {name: "Research", scopes: ["evaluate"]}, {name: "Research", scopes: []},
    {name: " ", scopes: ["read"]}, {name: "a".repeat(101), scopes: ["read"]}, {name: "bad\nname", scopes: ["read"]},
    ...[0, 91, 1.5, NaN, Infinity].map(expiresInDays => ({name: "Research", scopes: ["read"], expiresInDays})),
  ]) await assert.rejects(() => createAgentApiKey(db, "fixture-owner", parseAgentKeyInput(input)), AgentApiError);
});

test("public schemas and Markdown are static placeholder contracts and distinguish reads from paid ensure", async () => {
  const spec = agentOpenApiSpec();
  assert.equal(spec.openapi, "3.1.0");
  assert.deepEqual(spec.servers, [{url: "/api/v1"}]);
  assert.equal(Object.keys(spec.paths).length, 13);
  const paths = spec.paths as Record<string, Record<string, {description: string; parameters: {name: string; required?: boolean}[]; requestBody?: unknown; responses: Record<string, unknown>}>>;
  assert.match(paths["/observations"].get.description, /does not start a task/);
  assert.equal(paths["/observations"].get.requestBody, undefined);
  assert.match(paths["/observations/ensure"].post.description, /usage charges/);
  assert.equal(paths["/observations/ensure"].post.parameters.find(p => p.name === "Idempotency-Key")?.required, true);
  assert.ok(paths["/observations/ensure"].post.responses["202"]);
  for (const endpoint of AGENT_API_ENDPOINTS) if ("body" in endpoint && endpoint.id === "ensure") assert.deepEqual(parseAgentObservation(endpoint.body), endpoint.body);
  const markdown = agentApiMarkdown();
  assert.match(markdown, /GET \/observations reports saved data and freshness only/);
  assert.match(markdown, /same key and identical body/);
  assert.match(markdown, /not a universal search-engine position/);
  assert.match(markdown, /not.*consumer ChatGPT|measurement of the consumer ChatGPT/);
  for (const publicText of [JSON.stringify(spec), markdown]) {
    assert.doesNotMatch(publicText, /folio_v1_[a-f0-9]{64}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|OPENAI_API_KEY|DATAFORSEO_PASSWORD|\/Users\//);
  }
  const jsonResponse = openApiResponse(), mdResponse = markdownResponse();
  assert.equal(jsonResponse.status, 200); assert.deepEqual(await jsonResponse.json(), spec);
  assert.match(jsonResponse.headers.get("cache-control")!, /public/);
  assert.equal(mdResponse.status, 200); assert.match(mdResponse.headers.get("content-type")!, /^text\/markdown/);
  assert.equal(await mdResponse.text(), markdown);
});

test("an unresolved keyword cancellation remains a conflict, and unknown failures hide internal details", async () => {
  const conflict = agentApiErrorResponse(new KeywordBenchmarkStoreError("Creation is unresolved. Inspect the existing run before requesting cancellation.", 409));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), {error: {code: "conflict", message: "Creation is unresolved. Inspect the existing run before requesting cancellation."}});
  const unknown = agentApiErrorResponse(new Error("PRIVATE_PROVIDER_OR_DATABASE_DETAIL"));
  assert.equal(unknown.status, 503); assert.doesNotMatch(await unknown.text(), /PRIVATE_PROVIDER_OR_DATABASE_DETAIL/);
  const unauthenticated = agentApiErrorResponse(new AgentApiError("Authentication is required.", 401, "unauthorized"));
  assert.equal(unauthenticated.headers.get("www-authenticate"), "Bearer");
});

test("website storage conflicts preserve HTTP status without exposing internal failure text", async () => {
  for (const status of [403, 404, 409]) {
    const response = agentApiErrorResponse(new EvalStoreError("PRIVATE_DATABASE_CONTEXT", status));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.error.code, status === 409 ? "conflict" : "invalid_request");
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE_DATABASE_CONTEXT/);
  }
  const conflict = agentApiErrorResponse(new EvalStoreError("Concurrent update"));
  assert.deepEqual(await conflict.json(), { error: { code: "conflict", message: "This evaluation changed. Retrieve its saved state before continuing." } });
});

test("only transient API rate limits advertise Retry-After", () => {
  const rateLimit = agentApiErrorResponse(new AgentApiError("Try again later.", 429, "rate_limited"));
  assert.equal(rateLimit.status, 429); assert.equal(rateLimit.headers.get("retry-after"), "60");
  for (const error of [
    new AgentApiError("This saved request was denied capacity.", 429, "run_limit"),
    new AgentApiError("Ten active keys already exist.", 429, "key_limit"),
    new KeywordBenchmarkStoreError("The account has reached its benchmark allowance.", 429),
    new EvalStoreError("The account has reached its website allowance.", 429),
  ]) {
    const response = agentApiErrorResponse(error);
    assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), null);
  }
});
