import assert from "node:assert/strict";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getAgentsConnectionStatus, AgentsIntegrationError, createWebsiteEvaluationSession, getAgentSessionTurns,
  cancelAgentSessionTurn, serializeWebsiteEvaluationInput,
} from "../src/lib/agents";
import {
  managedRunAccess, projectAgentItems, startEvaluationRun,
  reconcileEvaluationRun, cancelEvaluationRun, captureEvaluationWebsite,
} from "../src/lib/agent-runs";
import { createDemoEvaluationRun, DEMO_AGENT_OUTPUT, DEMO_WEBSITE_HTML } from "../src/lib/eval-verifier";
import type { EvaluationRun } from "../src/lib/evals";

const env = { OPENAI_API_KEY: "fixture-server-key", OPENAI_ALLOWED_USER_IDS: "approved-user", SCAN_ALLOWED_HOSTS: "example.com" };
const session = { id: "sess_fixture", object: "agent.session", status: "idle", created_at: 1, required_actions: [] };
const evaluationInput = { domain: "example.com", brand: "Example", prompts: ["Read the page"], evidence: [{ id: "p1", url: "https://example.com/", kind: "page" as const, capturedAt: new Date().toISOString(), content: "Example page" }] };

/** Minimal D1 contract fixture: owner isolation and compare-and-swap are real in
 * the separate store tests; this allows lifecycle tests without provider calls. */
function memoryDb(options: { failSessionSaves?: number; loseSessionSaveResponse?: boolean } = {}) {
  const rows = new Map<string, { owner: string; run: EvaluationRun }>();
  let sessionSaveFailures = options.failSessionSaves ?? 0;
  let loseSessionSaveResponse = options.loseSessionSaveResponse ?? false;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO evaluation_runs")) {
                const run = JSON.parse(values[9] as string) as EvaluationRun;
                rows.set(run.id, { owner: values[1] as string, run });
                return { meta: { changes: 1 } };
              }

              throw new Error("Unexpected SQL");
            },
            async first() {
              if (sql.includes("UPDATE evaluation_runs")) {
                const row = rows.get(values[6] as string);
                if (!row || row.owner !== values[5] || row.run.revision !== values[7]) return null;
                const next = JSON.parse(values[4] as string) as EvaluationRun;
                if (next.sessionId && sessionSaveFailures-- > 0) throw new Error("Database unavailable");
                row.run = next;
                if (next.sessionId && loseSessionSaveResponse) { loseSessionSaveResponse = false; throw new Error("Database acknowledgement lost after commit"); }
                return { id: next.id };
              }
              if (sql.includes("INSERT INTO evaluation_runs")) {
                const run = JSON.parse(values[9] as string) as EvaluationRun;
                rows.set(run.id, { owner: values[1] as string, run });
                return { id: run.id };
              }
              const row = rows.get(values[1] as string);
              return row && row.owner === values[0] ? { result_json: JSON.stringify(row.run) } : null;
            },
            async all() {
              return { results: [...rows.values()].filter(row => row.owner === values[0]).map(row => ({ result_json: JSON.stringify(row.run) })) };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, rows };
}

test("paid-run access uses exact server-approved user IDs and leaks no key", () => {
  assert.equal(managedRunAccess(env, "approved-user").canRun, true);
  assert.equal(managedRunAccess(env, "approved").canRun, false);
  assert.equal(managedRunAccess(env, "me@example.com").canRun, false);
  assert.equal(managedRunAccess(env, "").canRun, false);
  assert.equal(managedRunAccess({ ...env, OPENAI_API_KEY: "" }, "approved-user").configured, false);
  assert.ok(!JSON.stringify(managedRunAccess(env, "approved-user")).includes(env.OPENAI_API_KEY));
  const exempt = { ...env, OPENAI_UNMETERED_USER_IDS: "approved-user" };
  assert.equal(managedRunAccess(exempt, "approved-user").maxRunsPerDay, null);
  assert.equal(managedRunAccess({ ...exempt, OPENAI_UNMETERED_USER_IDS: "prefix-approved-user" }, "approved-user").maxRunsPerDay, 1);
  assert.equal(managedRunAccess({ ...exempt, OPENAI_ALLOWED_USER_IDS: "other-user" }, "approved-user").canRun, false);
  assert.equal(managedRunAccess({ ...exempt, OPENAI_ALLOWED_USER_IDS: "approved-user,other-user" }, "other-user").maxRunsPerDay, 1);
});

test("missing credentials and unapproved accounts never make a provider request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("Unexpected network call"); });
  await assert.rejects(createWebsiteEvaluationSession(evaluationInput, {}), (error: unknown) => error instanceof AgentsIntegrationError && error.code === "NOT_CONFIGURED");
  await assert.rejects(startEvaluationRun(memoryDb().db, "other-user", { mode: "managed", domain: "example.com" }, env), /not approved/);
  assert.equal(calls, 0);
});

test("managed create reserves its attempt before one POST containing the initial input", async (t) => {
  const { db, rows } = memoryDb();
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, method: init?.method ?? "GET", body });
    assert.equal(new Headers(init?.headers).get("OpenAI-Beta"), "agents=v1");
    if (url.endsWith("/agents/sessions")) {
      const saved = [...rows.values()][0].run;
      assert.equal(saved.captures.length, 1);
      assert.ok(saved.events.some(entry => entry.id === "session-create-attempt"));
      assert.equal(typeof body.input, "string", "environment:none requires initial input");
      const submitted = JSON.parse(body.input as string);
      assert.equal(submitted.evidence[0].content, DEMO_WEBSITE_HTML);
      assert.equal(submitted.runId, saved.id);
      assert.equal((body.metadata as Record<string, unknown>).run_id, saved.id);
      assert.ok(!JSON.stringify(body).includes("expectedFacts"));
      assert.deepEqual(body.environment, { type: "none" });
      assert.ok(!("tools" in (body.agent as Record<string, unknown>)), "No fake application tool claims");
      return Response.json(session);
    }
    throw new Error("Unexpected endpoint");
  });
  const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com", brand: "Example" }, env);
  assert.equal(run.status, "running");
  assert.equal(run.sessionId, "sess_fixture");
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.equal(run.publication, "private");
  assert.equal(run.captures[0].content, DEMO_WEBSITE_HTML);
});

test("website captures retain a complete 182KB page, enforce 190KB bytes and preflight escaped input before a create attempt", async t => {
  const prefix = "<!doctype html><html><head><title>Fixture</title></head><body><main>";
  const suffix = "</main></body></html>";
  const pageOfSize = (bytes: number, fill = "x") => prefix + fill.repeat(bytes - prefix.length - suffix.length) + suffix;
  let html = pageOfSize(182_000), posts = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://example.com/") return new Response(html, { headers: { "Content-Type": "text/html" } });
    posts++;
    const body = JSON.parse(String(init?.body));
    assert.equal(JSON.parse(body.input).evidence[0].content, html, "Submitted evidence must not be truncated.");
    return Response.json(session);
  });
  const capture = await captureEvaluationWebsite("https://example.com/", env);
  assert.equal(capture.content, html); assert.equal(new TextEncoder().encode(capture.content).byteLength, 182_000);
  const largeRun = await startEvaluationRun(memoryDb().db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(largeRun.status, "running"); assert.equal(largeRun.captures[0].content, html); assert.equal(posts, 1);
  html = pageOfSize(190_000);
  assert.equal((await captureEvaluationWebsite("https://example.com/", env)).content, html, "The exact capture boundary is accepted.");
  html = pageOfSize(190_001);
  await assert.rejects(captureEvaluationWebsite("https://example.com/", env), /size limit/);
  // JSON quotes double during serialization: a page can fit its byte bound but
  // still exceed the unchanged 200K-character provider input ceiling.
  html = pageOfSize(120_000, '"');
  const tooLarge = await startEvaluationRun(memoryDb().db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(tooLarge.status, "failed"); assert.equal(tooLarge.sessionId, null); assert.equal(tooLarge.captures[0].content, html);
  assert.equal(tooLarge.events.some(value => value.id === "session-create-attempt"), false);
  assert.match(tooLarge.error!, /200,000 character/); assert.equal(posts, 1);
  assert.throws(() => serializeWebsiteEvaluationInput({ ...evaluationInput, evidence: [{ ...evaluationInput.evidence[0], content: '"'.repeat(110_000) }] }), /200,000 character/);
});

test("ambiguous create remains unconfirmed and reconciliation never retries it", async (t) => {
  const { db } = memoryDb();
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    if (init?.method === "POST") posts++;
    throw new Error("Network response lost");
  });
  const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(run.sessionId, null);
  assert.equal(run.status, "requires_action");
  assert.match(run.error!, /could not be confirmed/);
  assert.equal(posts, 1);
  const reconciled = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(reconciled.status, "requires_action");
  assert.match(reconciled.error!, /Cost is unconfirmed/);
  assert.equal(posts, 1);
});

test("5xx and unreadable successful creation remain unconfirmed without a retry", async t => {
  let response = () => new Response("temporary", { status: 503 });
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url) === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    posts++; return response();
  });
  for (const outcome of [
    () => new Response("temporary", { status: 503 }),
    () => new Response("{malformed", { headers: { "Content-Type": "application/json" } }),
  ]) {
    response = outcome;
    const { db } = memoryDb();
    const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com" }, env);
    assert.equal(run.status, "requires_action");
    assert.equal(run.sessionId, null);
    assert.match(run.error!, /Cost is unconfirmed/);
  }
  assert.equal(posts, 2);
});

test("definite create rejection is recorded separately from ambiguous creation", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url) === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    calls++; return new Response("Private error detail", { status: 400 });
  });
  const run = await startEvaluationRun(memoryDb().db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(run.status, "failed"); assert.match(run.error!, /rejected session creation/);
  assert.ok(!run.error!.includes("Private error detail")); assert.equal(calls, 1);
});

test("a received session survives transient persistence failures without a second provider POST", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url) === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    calls++; return Response.json(session);
  });
  for (const options of [{ failSessionSaves: 1 }, { loseSessionSaveResponse: true }]) {
    const { db, rows } = memoryDb(options);
    const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com" }, env);
    assert.equal(run.status, "running"); assert.equal(run.sessionId, session.id);
    assert.equal(rows.get(run.id)?.run.sessionId, session.id);
  }
  assert.equal(calls, 2);
});

test("a received session ID remains in the returned run when persistence stays unavailable", async t => {
  let posts = 0;
  const { db, rows } = memoryDb({ failSessionSaves: 10 });
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
    if (String(url) === "https://example.com/") return new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } });
    posts++; return Response.json(session);
  });
  const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(run.status, "requires_action"); assert.equal(run.sessionId, session.id);
  assert.match(run.error!, /Keep this session ID/);
  assert.equal(rows.get(run.id)?.run.sessionId, null);
  assert.ok(rows.get(run.id)?.run.events.some(entry => entry.id === "session-create-attempt"));
  assert.equal(posts, 1);
});

test("a usable session ID is preserved when the successful create response has an unexpected shape", async t => {
  t.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => String(url) === "https://example.com/"
    ? new Response(DEMO_WEBSITE_HTML, { headers: { "Content-Type": "text/html" } })
    : Response.json({ ...session, status: "new_provider_status" }));
  const { db, rows } = memoryDb();
  const run = await startEvaluationRun(db, "approved-user", { mode: "managed", domain: "example.com" }, env);
  assert.equal(run.status, "requires_action"); assert.equal(run.sessionId, session.id);
  assert.equal(rows.get(run.id)?.run.sessionId, session.id);
});

async function savedLiveRun() {
  const demo = await createDemoEvaluationRun();
  const run: EvaluationRun = { ...demo, mode: "live", status: "running", sessionId: "sess_fixture", model: "fixture-model", result: null, agentOutput: undefined, error: null, events: [] };
  const store = memoryDb();
  store.rows.set(run.id, { owner: "approved-user", run });
  return { ...store, run };
}

test("reconcile paginates saved items, requires completed root turn, then independently verifies JSON", async (t) => {
  const { db, run } = await savedLiveRun();
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "GET", "Reconciliation must never create or resume paid work");
    const url = String(input); urls.push(url);
    if (url.includes("/turns?")) return Response.json({ data: [{ id: "turn_1", session_id: session.id, created_at: 2, status: "completed", subagent_id: null, usage: { input_tokens: 123, output_tokens: 45, total_tokens: 168 } }], has_more: false });
    if (url.includes("/items?") && !url.includes("after=")) return Response.json({ data: [{ id: "reasoning_1", type: "reasoning", summary: "Never display reasoning" }], has_more: true, last_id: "reasoning_1" });
    if (url.includes("/items?")) return Response.json({ data: [{ id: "msg_final", type: "message", role: "assistant", phase: "final_answer", status: "completed", turn_id: "turn_1", content: [{ type: "output_text", text: JSON.stringify(DEMO_AGENT_OUTPUT) }] }], has_more: false });
    return Response.json(session);
  });
  const result = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(result.status, "completed");
  assert.equal(result.result?.failed, 0);
  assert.deepEqual(result.usage, { input_tokens: 123, output_tokens: 45, total_tokens: 168 });
  assert.ok(urls.some(url => url.includes("after=reasoning_1")));
  assert.ok(!JSON.stringify(result.events).includes("Never display reasoning"));
});

test("idle without completed turn cannot become a successful evaluation", async (t) => {
  const { db, run } = await savedLiveRun();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => String(input).includes("?")
    ? Response.json({ data: [], has_more: false }) : Response.json(session));
  const result = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(result.status, "requires_action");
  assert.equal(result.result, null);
  assert.match(result.error!, /Idle alone is not completion/);
});

test("a terminal turn with a not-yet-visible final item remains recoverable", async (t) => {
  const { db, run } = await savedLiveRun();
  let itemReads = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "GET");
    if (String(input).includes("/turns?")) return Response.json({ data: [{ id: "t", session_id: session.id, created_at: 1, status: "completed" }], has_more: false });
    if (String(input).includes("/items?")) return Response.json({ data: ++itemReads === 1 ? [] : [{ id: "m", type: "message", role: "assistant", phase: "final_answer", status: "completed", turn_id: "t", content: [{ type: "output_text", text: JSON.stringify(DEMO_AGENT_OUTPUT) }] }], has_more: false });
    return Response.json(session);
  });
  const first = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(first.status, "running"); assert.equal(first.result, null);
  const second = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(second.status, "completed"); assert.equal(second.result?.failed, 0);
});

test("preparation checkpoints cannot be raced by another tab's reconciliation", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  rows.get(run.id)!.run = { ...run, status: "queued", events: [] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network expected"); });
  const unchanged = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(unchanged.revision, run.revision); assert.equal(calls, 0);
  await assert.rejects(cancelEvaluationRun(db, "approved-user", run.id, env), /being prepared/);
});

test("an expired preparation lease recovers saved provider state without resubmission", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  const past = new Date(Date.now() - 180_000).toISOString();
  rows.get(run.id)!.run = { ...run, status: "queued", updatedAt: past, events: [] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "GET"); calls++;
    return String(input).includes("?") ? Response.json({ data: [], has_more: false }) : Response.json(session);
  });
  const recovered = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(recovered.status, "requires_action"); assert.equal(calls, 3);
});

test("an expired preparation without a saved session releases its active reservation", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  const past = new Date(Date.now() - 180_000).toISOString();
  rows.get(run.id)!.run = { ...run, status: "queued", sessionId: null, updatedAt: past, events: [] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network"); });
  const recovered = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(recovered.status, "failed"); assert.equal(calls, 0);
  assert.match(recovered.error!, /Preparation expired/);
});

test("an expired create attempt without a session ID never becomes a no-spend failure", async t => {
  const { db, rows, run } = await savedLiveRun();
  const past = new Date(Date.now() - 180_000).toISOString();
  rows.get(run.id)!.run = { ...run, status: "queued", sessionId: null, updatedAt: past,
    events: [{ id: "session-create-attempt", at: past, type: "status", title: "Creating session with captured evidence" }] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network"); });
  const recovered = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(recovered.status, "requires_action"); assert.equal(calls, 0);
  assert.match(recovered.error!, /cost is unknown/);
});

test("a recovered provider-queued turn stays reconcilable after its lease checkpoint", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  rows.get(run.id)!.run = { ...run, status: "queued", updatedAt: new Date(Date.now() - 180_000).toISOString(), events: [] };
  let reads = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    reads++;
    if (String(input).includes("/turns?")) return Response.json({ data: [{ id: "t", session_id: session.id, created_at: 1, status: "queued" }], has_more: false });
    if (String(input).includes("/items?")) return Response.json({ data: [], has_more: false });
    return Response.json({ ...session, status: "in_progress" });
  });
  const first = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(first.status, "queued");
  await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(reads, 6, "Recovered provider work must not regain the preparation lock");
});

test("replaying a run reuses frozen captures and expected facts without recapturing", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  const previous = { ...run, status: "completed" as const, targetUrl: "https://example.com/" };
  rows.get(run.id)!.run = previous;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.ok(String(input).startsWith("https://api.openai.com/"), "Replay must not recapture the website");
    return String(input).endsWith("/agents/sessions") ? Response.json({ ...session, id: "sess_replay" }) : new Response(null, { status: 204 });
  });
  const replay = await startEvaluationRun(db, "approved-user", { mode: "managed", rerunOf: run.id }, env);
  assert.equal(replay.status, "running");
  assert.deepEqual(replay.captures, previous.captures);
  assert.deepEqual(replay.expectedFacts, previous.expectedFacts);
  assert.equal(replay.suiteVersion, previous.suiteVersion);
  assert.notEqual(replay.id, previous.id);
});

test("malformed final JSON fails without exposing model-generated scores", async (t) => {
  const { db, run } = await savedLiveRun();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (String(input).includes("/turns?")) return Response.json({ data: [{ id: "t", session_id: session.id, created_at: 1, status: "completed" }], has_more: false });
    if (String(input).includes("/items?")) return Response.json({ data: [{ id: "m", type: "message", role: "assistant", phase: "final_answer", status: "completed", turn_id: "t", content: [{ type: "output_text", text: '{"score":100}' }] }], has_more: false });
    return Response.json(session);
  });
  const result = await reconcileEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(result.status, "failed"); assert.equal(result.result, null); assert.equal(result.agentOutput, undefined);
});

test("private ownership is checked before any provider reconciliation or cancellation", async (t) => {
  const { db, run } = await savedLiveRun();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network"); });
  await assert.rejects(reconcileEvaluationRun(db, "someone-else", run.id, env), /not found/);
  await assert.rejects(cancelEvaluationRun(db, "someone-else", run.id, env), /not found/);
  assert.equal(calls, 0);
});

test("cancel uses documented input.cancel and does not invent a terminal result", async (t) => {
  const { db, run } = await savedLiveRun();
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), "https://api.openai.com/v1/agents/sessions/sess_fixture/events");
    assert.deepEqual(JSON.parse(String(init?.body)), { events: [{ type: "agent.session.input.cancel" }] });
    return new Response(null, { status: 204 });
  });
  const result = await cancelEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(result.status, "running"); assert.match(result.events.at(-1)!.title, /Cancellation requested/);
  await assert.rejects(cancelAgentSessionTurn("bad/id", env), /Invalid session identifier/);
});

test("an accepted provider-queued turn can still be cancelled", async (t) => {
  const { db, rows, run } = await savedLiveRun();
  rows.get(run.id)!.run = { ...run, status: "queued", events: [{ id: "input-accepted", type: "status", title: "Task accepted by OpenAI", at: run.createdAt }] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return new Response(null, { status: 204 }); });
  await cancelEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(calls, 1);
});

test("cancellation reserves one attempt before the POST and never retries an ambiguous response", async t => {
  const { db, rows, run } = await savedLiveRun(); let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++; assert.ok(rows.get(run.id)!.run.events.some(value => value.id === "cancel-attempt"));
    throw new Error("Fixture cancellation acknowledgement lost");
  });
  const raced = await Promise.allSettled([cancelEvaluationRun(db, "approved-user", run.id, env), cancelEvaluationRun(db, "approved-user", run.id, env)]);
  assert.ok(raced.some(value => value.status === "fulfilled")); assert.equal(calls, 1);
  const retry = await cancelEvaluationRun(db, "approved-user", run.id, env);
  assert.equal(retry.status, "requires_action"); assert.equal(calls, 1);
  assert.equal(retry.events.some(value => value.id === "cancel-acknowledged"), false);
});

test("saved-item UI projection excludes reasoning and private input", () => {
  const events = projectAgentItems([
    { id: "u", type: "message", role: "user", content: [{ type: "input_text", text: "private prompt" }] },
    { id: "r", type: "reasoning", summary: "private reasoning" },
    { id: "a", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Bearer private-key-123" }] },
    { id: "f", type: "function_call", name: "observed_function", arguments: { password: "do-not-expose" }, status: "completed" },
  ], new Date().toISOString());
  assert.equal(events.length, 2);
  const encoded = JSON.stringify(events);
  assert.ok(!encoded.includes("private prompt")); assert.ok(!encoded.includes("private reasoning"));
  assert.ok(!encoded.includes("private-key-123")); assert.ok(!encoded.includes("do-not-expose"));
});

test("provider activity projection is bounded to recent items and short excerpts", () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: `m-${i}`, type: "message", role: "assistant", content: [{ type: "output_text", text: "x".repeat(40_000) }] }));
  const events = projectAgentItems(items, new Date().toISOString());
  assert.equal(events.length, 100);
  assert.ok(events.every(entry => (entry.detail?.length ?? 0) <= 1500));
  assert.ok(JSON.stringify(events).length < 200_000);
});

test("invalid provider turn ownership is rejected", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ data: [{ id: "t", session_id: "other-session", status: "completed", created_at: 0 }], has_more: false }));
  await assert.rejects(getAgentSessionTurns("sess_fixture", {}, env), /Unexpected session turns response/);
});

test("website evaluation defaults to Luna", () => {
 assert.equal(getAgentsConnectionStatus({}).model,"gpt-6-luna");
 assert.equal(getAgentsConnectionStatus({OPENAI_AGENTS_MODEL:"gpt-6-astra"}).model,"gpt-6-luna");
});
