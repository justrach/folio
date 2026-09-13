import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { createWebsiteEvaluationSession, SAVED_SEO_TOOL_NAME, submitAgentToolResult, type AgentSession, type AgentTurn } from "../src/lib/agents";
import { frozenSavedSeoResult, pendingSavedSeoAction, returnSavedSeoEvidence } from "../src/lib/managed-seo-tool";
import { createEvaluationRun, getEvaluationRun } from "../src/lib/eval-store";
import { createDemoEvaluationRun, sha256Source } from "../src/lib/eval-verifier";
import type { EvaluationRun } from "../src/lib/evals";

const env = { OPENAI_API_KEY: "fixture-server-key", OPENAI_ALLOWED_USER_IDS: "alice" };
const action = { type: "function_call", name: SAVED_SEO_TOOL_NAME, turn_id: "turn_1", call_id: "call_1", arguments: {} };
const session: AgentSession = { id: "sess_fixture", object: "agent.session", created_at: 1, status: "requires_action", required_actions: [action] };
const turn: AgentTurn = { id: "turn_1", session_id: session.id, status: "waiting", created_at: 2, subagent_id: null };

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of ["0001_initial.sql", "0002_evaluations.sql", "0005_eval_evidence_deletion.sql", "0007_agent_tool_calls.sql"])
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), "utf8"));
  for (const id of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(id, id, `${id}@example.com`, Date.now(), Date.now());
  const db = { prepare(sql: string) {
    const statement = sqlite.prepare(sql);
    return { bind(...values: SQLInputValue[]) { return {
      async run() { return { success: true, meta: { changes: Number(statement.run(...values).changes) } }; },
      async first() { return statement.get(...values) ?? null; },
      async all() { return { success: true, results: statement.all(...values) }; },
    }; } };
  } } as unknown as D1Database;
  return { sqlite, db };
}

async function runFixture(): Promise<EvaluationRun> {
  const demo = await createDemoEvaluationRun();
  const capturedAt = new Date().toISOString();
  const report = { id: "report_fixture", domain: "example.com", createdAt: capturedAt, retrievedAt: capturedAt,
    publication: "private", state: "complete", result: {
      id: "lookup_fixture", domain: "example.com", provider: "DataForSEO", fetchedAt: capturedAt,
      organic: { status: "empty", data: null, costUsd: 0.01 },
      backlinks: { status: "success", data: { backlinks: 160, referringDomains: 64 }, costUsd: null },
      status: "partial", totalCostUsd: null, knownCostUsd: 0.01, costIsComplete: false, notes: [],
    } };
  const content = JSON.stringify(report);
  return { ...demo, id: crypto.randomUUID(), targetUrl: "https://example.com/", mode: "live", status: "requires_action", sessionId: session.id,
    result: null, agentOutput: undefined, events: [], error: null,
    captures: [{ id: `seo-report:${report.id}`, url: "https://example.com/", capturedAt, kind: "seo-report", content, sha256: await sha256Source(content) }] };
}

test("saved SEO tool is attached only for an explicitly selected report", async t => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body))); return Response.json(session);
  });
  const input = { domain: "example.com", brand: "Example", prompts: [], evidence: [{ id: "p", url: "https://example.com/", capturedAt: new Date().toISOString(), kind: "page" as const, content: "Example" }] };
  await createWebsiteEvaluationSession(input, env);
  await createWebsiteEvaluationSession({ ...input, savedSeoReportId: "report_fixture" }, env);
  assert.equal((bodies[0].agent as Record<string, unknown>).tools, undefined);
  const tools = (bodies[1].agent as Record<string, unknown>).tools as Record<string, unknown>[];
  assert.equal(tools.length, 1); assert.equal(tools[0].name, SAVED_SEO_TOOL_NAME);
  assert.deepEqual(tools[0].parameters, { type: "object", properties: {}, required: [], additionalProperties: false });
  assert.equal(typeof bodies[1].input, "string");
  assert.equal(JSON.parse(bodies[1].input as string).evidence[0].content, "Example");
});

test("only one fresh required action on the sole active root turn may receive saved SEO", () => {
  assert.deepEqual(pendingSavedSeoAction(session, [turn]), { turnId: "turn_1", callId: "call_1" });
  const invalid = [
    { ...session, status: "idle" as const },
    { ...session, required_actions: [] },
    { ...session, required_actions: [action, action] },
    { ...session, required_actions: [{ ...action, name: "seo_backlinks_summary" }] },
    { ...session, required_actions: [{ ...action, arguments: { reportId: "someone-elses-report" } }] },
    { ...session, required_actions: [{ ...action, arguments: "{}" }] },
    { ...session, required_actions: [{ ...action, turn_id: "turn_other" }] },
  ];
  for (const value of invalid) assert.equal(pendingSavedSeoAction(value, [turn]), null);
  assert.equal(pendingSavedSeoAction(session, [{ ...turn, status: "completed" }]), null);
  assert.equal(pendingSavedSeoAction(session, [{ ...turn, subagent_id: "agent_child" }]), null);
  assert.equal(pendingSavedSeoAction(session, [{ ...turn, session_id: "other" }]), null);
  assert.equal(pendingSavedSeoAction(session, [turn, { ...turn, id: "turn_other" }]), null);
});

test("frozen tool evidence preserves source hash, timestamps, null costs, and partial observations", async () => {
  const run = await runFixture();
  const output = await frozenSavedSeoResult(run);
  assert.equal(output.content, run.captures[0].content);
  assert.equal(output.sourceHashSha256, run.captures[0].sha256);
  assert.equal(output.providerLookupPerformed, false); assert.equal(output.additionalSeoCostUsd, 0);
  const source = JSON.parse(output.content as string);
  assert.equal(source.result.totalCostUsd, null); assert.equal(source.result.status, "partial");
  await assert.rejects(frozenSavedSeoResult({ ...run, captures: [] }), /no single selected/);
  await assert.rejects(frozenSavedSeoResult({ ...run, captures: [run.captures[0], run.captures[0]] }), /no single selected/);
  await assert.rejects(frozenSavedSeoResult({ ...run, captures: [{ ...run.captures[0], content: "changed" }] }), /integrity/);
  await assert.rejects(frozenSavedSeoResult({ ...run, targetUrl: "https://different.example/" }), /does not match/);
});

test("cross-account and unapproved callers cause no provider requests", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network"); });
  await assert.rejects(returnSavedSeoEvidence(db, "bob", run.id, env), /not found/);
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, { ...env, OPENAI_ALLOWED_USER_IDS: "bob" }), /not approved/);
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, {}), /Connect an OpenAI/);
  assert.equal(calls, 0);
});

test("explicit saved tool return reserves before one provider POST and exposes exact output in private activity", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  const urls: string[] = []; let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); urls.push(url);
    assert.ok(url.startsWith("https://api.openai.com/v1/agents/sessions/sess_fixture"));
    if (init?.method === "POST") {
      posts++;
      assert.equal(sqlite.prepare("SELECT state FROM agent_tool_calls WHERE run_id = ?").get(run.id)?.state, "reserved");
      const saved = await getEvaluationRun(db, "alice", run.id);
      assert.ok(saved!.events.some(event => event.id === "saved-seo-tool-call_1"));
      const body = JSON.parse(String(init.body));
      const returned = body.events[0];
      assert.equal(returned.type, "agent.session.input.tool_result");
      assert.equal(returned.turn_id, "turn_1"); assert.equal(returned.call_id, "call_1"); assert.equal(returned.success, true);
      assert.equal(JSON.parse(returned.output).content, run.captures[0].content);
      assert.equal(new Headers(init.headers).get("OpenAI-Beta"), "agents=v1");
      return new Response(null, { status: 204 });
    }
    return url.includes("/turns?") ? Response.json({ data: [turn], has_more: false }) : Response.json(session);
  });
  const returned = await returnSavedSeoEvidence(db, "alice", run.id, env);
  assert.equal(returned.status, "running"); assert.equal(posts, 1);
  assert.equal(returned.events.at(-1)?.data?.submissionState, "submitted");
  assert.equal(returned.events.at(-1)?.status, "completed");
  assert.equal(returned.publication, "private");
  const reads = urls.length;
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, env), /already reserved/);
  assert.equal(urls.length, reads, "A duplicate click makes no provider request");
});

test("ambiguous result submission is durably marked and never blindly retried", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { posts++; throw new Error("Request arrived but response lost"); }
    return String(input).includes("/turns?") ? Response.json({ data: [turn], has_more: false }) : Response.json(session);
  });
  const result = await returnSavedSeoEvidence(db, "alice", run.id, env);
  assert.equal(result.status, "requires_action"); assert.match(result.error!, /could not be confirmed/);
  assert.equal(sqlite.prepare("SELECT state FROM agent_tool_calls WHERE run_id = ?").get(run.id)?.state, "uncertain");
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, env), /already reserved/);
  assert.equal(posts, 1);
});

test("concurrent explicit clicks send at most one result using the actual reservation SQL", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") { posts++; return new Response(null, { status: 204 }); }
    return String(input).includes("/turns?") ? Response.json({ data: [turn], has_more: false }) : Response.json(session);
  });
  const results = await Promise.allSettled([returnSavedSeoEvidence(db, "alice", run.id, env), returnSavedSeoEvidence(db, "alice", run.id, env)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(posts, 1);
});

test("unmatched required action never reserves or resumes a model turn", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "GET");
    return String(input).includes("/turns?") ? Response.json({ data: [turn], has_more: false })
      : Response.json({ ...session, required_actions: [{ ...action, arguments: { domain: "other.example" } }] });
  });
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, env), /no matching pending/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_tool_calls").get()?.count, 0);
});

test("tool transport rejects unsafe IDs or oversized outputs without network", async t => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No network expected"); });
  await assert.rejects(submitAgentToolResult("bad/id", { turnId: "turn_1", callId: "call_1" }, {}, env), /Invalid session/);
  await assert.rejects(submitAgentToolResult(session.id, { turnId: "bad/id", callId: "call_1" }, {}, env), /Invalid agent function/);
  await assert.rejects(submitAgentToolResult(session.id, { turnId: "turn_1", callId: "call_1" }, { content: "x".repeat(80_001) }, env), /size limit/);
});

test("an already requested cancellation cannot be resumed by returning a saved tool result", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const fixture = await runFixture();
  const run = await createEvaluationRun(db, "alice", { ...fixture, events: [{ id: "cancel", type: "status", at: fixture.updatedAt, title: "Cancellation requested" }] });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("No network expected"); });
  await assert.rejects(returnSavedSeoEvidence(db, "alice", run.id, env), /no active managed tool request/);
  assert.equal(calls, 0);
});

test("the ledger stores no evidence and deletion erases call metadata atomically", async t => {
  const { db, sqlite } = database(); t.after(() => sqlite.close());
  const run = await createEvaluationRun(db, "alice", await runFixture());
  sqlite.prepare("INSERT INTO agent_tool_calls VALUES(?,?,?,?,?,?,?,?,?)").run(run.id, "alice", session.id, "turn_1", "call_1", SAVED_SEO_TOOL_NAME, "reserved", Date.now(), Date.now());
  assert.ok(!JSON.stringify(sqlite.prepare("SELECT * FROM agent_tool_calls").get()).includes("DataForSEO"));
  sqlite.prepare("UPDATE evaluation_runs SET deleted_at = ? WHERE id = ?").run(Date.now(), run.id);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM agent_tool_calls").get()?.count, 0);
});
