import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentsIntegrationError, createWebsiteEvaluationSession, getAgentSession,
} from "../src/lib/agents";

const env = { OPENAI_API_KEY: "fixture-transport-secret" };
const session = { id: "sess_transport", object: "agent.session", status: "idle", created_at: 1, required_actions: [] };
const input = {
  domain: "example.com", brand: "Example", prompts: ["Extract supported facts"],
  evidence: [{ id: "page-1", url: "https://example.com/", capturedAt: "2026-09-13T00:00:00Z", kind: "page" as const, content: "Private captured source" }],
};

test("provider redirects cannot replay an authenticated evidence submission", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    assert.equal(String(url), "https://api.openai.com/v1/agents/sessions");
    assert.equal(init?.redirect, "manual");
    return new Response("Private provider error", { status: 307, headers: { location: "https://unexpected.example/" } });
  });
  await assert.rejects(createWebsiteEvaluationSession(input, env), (error: unknown) =>
    error instanceof AgentsIntegrationError && error.status === 307 && !error.message.includes("Private provider error"));
  assert.equal(calls, 1);
});

test("declared and streamed provider bodies are bounded before parsing", async t => {
  const cases = [
    () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "1000001" } }),
    () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(600_000)));
        controller.enqueue(new TextEncoder().encode("x".repeat(600_000)));
        controller.close();
      },
    }), { headers: { "Content-Type": "application/json" } }),
    () => new Response("not JSON", { headers: { "Content-Type": "text/html" } }),
  ];
  let current = 0;
  t.mock.method(globalThis, "fetch", async () => cases[current]());
  for (; current < cases.length; current++) {
    await assert.rejects(getAgentSession(session.id, env), (error: unknown) =>
      error instanceof AgentsIntegrationError && error.code === "INVALID_RESPONSE");
  }
});

test("bounded JSON decoding preserves multibyte content across streamed chunks", async t => {
  const encoded = new TextEncoder().encode(JSON.stringify({ ...session, error: "Evidence ✓" }));
  const split = encoded.findIndex((value) => value === 0xe2) + 1;
  t.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoded.slice(0, split));
      controller.enqueue(encoded.slice(split));
      controller.close();
    },
  }), { headers: { "Content-Type": "application/json; charset=utf-8" } }));
  assert.equal((await getAgentSession(session.id, env)).error, "Evidence ✓");
});

test("unexpected session identifiers are rejected before they enter stored UI state", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...session, id: "../private-session" }));
  await assert.rejects(getAgentSession(session.id, env), /Unexpected agent session response/);
});

test("provider session responses must belong to the requested saved session", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...session, id: "sess_someone_else" }));
  await assert.rejects(getAgentSession(session.id, env), /different session identifier/);
});
