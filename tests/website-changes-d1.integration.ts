import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentApiError, authenticateAgentApiKey, createAgentApiKey } from "../src/lib/agent-api-key-store";
import { createKeywordBenchmarkSuite, markKeywordBenchmarkCreateAttempt, reserveKeywordBenchmarkRun, updateKeywordBenchmarkRun } from "../src/lib/keyword-benchmark-store";
import { serveFolioMcp } from "../src/lib/folio-mcp";
import { getWebsiteChange, listWebsiteChanges, updateWebsiteChange } from "../src/lib/website-changes";
import type { WebsiteChange } from "../src/lib/website-change-outcome";
import type { AgentApiScope } from "../src/lib/agent-observation-types";

function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-website-change-fixtures", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000026" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["alice", "bob"]) {
    await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
    await db.prepare("INSERT INTO sites(id,user_id,url,name,created_at) VALUES(?,?,?,?,?)").bind(`site-${id}`, id, id === "alice" ? "https://example.com/" : "https://bob-site.com/", `${id} site`, 1000).run();
  }
}
const config = { model: "fixture-model", harnessVersion: "keyword-open-web-v2", environmentType: "openai_hosted", environmentFingerprint: "fixture-digest" };
const question = (query: string, targetUrl = "https://example.com/") => ({ query, targetUrl, language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", searchMode: "open-web" as const });
const other = { name: "Other tool", url: "https://other.com/" }, target = { name: "Example", url: "https://example.com/" };

/** Synthetic saved answers: illustrative fixtures, not provider output. */
async function answer(db: D1Database, caseId: string, at: Date, mentions: { name: string; url: string }[], citations: { url: string }[] = [], model = config.model) {
  let run = await reserveKeywordBenchmarkRun(db, "alice", { ...config, model, caseId, kind: "baseline" }, { maxRunsPerDay: null, maxActiveRuns: 1, now: at });
  run = await markKeywordBenchmarkCreateAttempt(db, "alice", run.id, run.revision);
  run = await updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "running", sessionId: `session_${run.id}` });
  return updateKeywordBenchmarkRun(db, "alice", run.id, run.revision, { status: "completed", answer: { text: "Synthetic answer", mentions, citations } });
}
async function connect(db: D1Database, ownerId: string, scopes: AgentApiScope[]) {
  const key = await createAgentApiKey(db, ownerId, { name: `${ownerId} agent`, scopes });
  const principal = await authenticateAgentApiKey(db, key.token, "read");
  const client = new Client({ name: "change-fixture", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"), { fetch: async (url, init) => serveFolioMcp(new Request(url, init), { db, principal, env: {} }) }));
  const call = async <T,>(name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })).structuredContent as { result?: T; error?: { code: string; requiredScope: string | null } };
  return { client, call, token: key.token };
}

test("D1 records an agent's change with its baseline, pairs only matched retests after the owner's publication, and isolates owners", { timeout: 120_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "folio-website-changes-")), current = runtime(directory);
  const provider = t.mock.method(globalThis, "fetch", async () => { throw new Error("No provider calls permitted"); });
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const day = 86_400_000, start = Date.now();
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Buyer questions", cases: [question("Which tool handles pricing pages?"), question("Which tool has migration help?"), question("Which tool is free?"), question("Which tool fits other.com?", "https://other.com/")] });
    // Saved case order is not the input order; select by question text.
    const [pricing, migration, free, foreign] = ["pricing pages", "migration help", "is free", "other.com"].map(part => suite.cases.find(item => item.query.includes(part))!.id);
    const pricingBefore = await answer(db, pricing, new Date(start - 3 * day), [other]);
    await answer(db, migration, new Date(start - 3 * day), [other, target]);
    const runs = async () => (await db.prepare("SELECT COUNT(*) AS n FROM keyword_benchmark_runs").first<{ n: number }>())!.n;
    const before = await runs();

    const agent = await connect(db, "alice", ["read", "changes"]), reader = await connect(db, "alice", ["read"]), stranger = await connect(db, "bob", ["read", "changes"]);
    try {
      const input = { websiteId: "site-alice", title: "Answer pricing and migration questions", summary: "Added a pricing table and a migration guide.", caseIds: [pricing, migration, free], files: ["content/pricing.md", "content/migrate.md"], requestKey: "aeo-fixture-key" };
      assert.equal((await reader.call("folio_change_record", input)).error?.requiredScope, "changes");
      assert.equal((await stranger.call("folio_change_record", input)).error?.code, "not_found");
      assert.equal((await agent.call("folio_change_record", { ...input, caseIds: [pricing, foreign] })).error?.code, "invalid_input");
      // Concurrent first submissions with one requestKey save exactly one record.
      const raced = await Promise.all(Array.from({ length: 6 }, () => agent.call<{ change: WebsiteChange; replayed: boolean }>("folio_change_record", input)));
      assert.equal(raced.filter(item => item.result?.replayed === false).length, 1);
      const recorded = raced.find(item => item.result?.replayed === false)!.result!;
      assert.ok(raced.every(item => item.result?.change.id === recorded.change.id)); assert.equal(recorded.change.status, "proposed"); assert.equal(recorded.change.recordedBy.keyName, "alice agent");
      assert.deepEqual(recorded.change.questions.map(item => item.state), ["awaiting_publication", "awaiting_publication", "awaiting_publication"]);
      assert.deepEqual(recorded.change.questions.map(item => item.baseline?.targetNamed ?? null), ["no", "yes", null]);
      assert.equal(recorded.change.questions[0].baseline?.runId, pricingBefore.id); assert.equal(recorded.change.questions[1].baseline?.position, 2);
      // A later retry returns the same record; a different payload under the same key is refused.
      const replay = (await agent.call<{ change: WebsiteChange; replayed: boolean }>("folio_change_record", input)).result!;
      assert.equal(replay.replayed, true); assert.equal(replay.change.id, recorded.change.id);
      assert.equal((await agent.call("folio_change_record", { ...input, title: "A different change" })).error?.code, "conflict");
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM website_changes").first<{ n: number }>())!.n, 1);
      assert.equal(JSON.stringify((await db.prepare("SELECT * FROM website_changes").all()).results).includes("aeo-fixture-key"), false);

      // Other owners see nothing; a read-only key of the same owner can read but not update.
      assert.deepEqual((await stranger.call<{ items: unknown[] }>("folio_changes", {})).result?.items, []);
      assert.equal((await stranger.call("folio_changes", { changeId: recorded.change.id })).error?.code, "not_found");
      assert.equal((await stranger.call("folio_change_update", { changeId: recorded.change.id, status: "published" })).error?.code, "not_found");
      assert.equal((await reader.call("folio_change_update", { changeId: recorded.change.id, status: "published" })).error?.requiredScope, "changes");
      assert.equal((await reader.call<{ items: WebsiteChange[] }>("folio_changes", { websiteId: "site-alice" })).result?.items[0].id, recorded.change.id);
      await assert.rejects(getWebsiteChange(db, "bob", recorded.change.id), error => error instanceof AgentApiError && error.status === 404);
      await assert.rejects(updateWebsiteChange(db, "bob", recorded.change.id, { status: "withdrawn" }, "owner"), error => error instanceof AgentApiError && error.status === 404);

      // A future publication time is refused; the owner's confirmation is saved as reported, not verified.
      await assert.rejects(updateWebsiteChange(db, "alice", recorded.change.id, { status: "published", publishedAt: new Date(start + day).toISOString() }, "owner"), error => error instanceof AgentApiError && error.status === 400);
      const published = (await updateWebsiteChange(db, "alice", recorded.change.id, { status: "published", publishedAt: new Date(start - day).toISOString() }, "owner")).change;
      assert.equal(published.publication?.reportedBy, "owner"); assert.match(published.publication!.provenance, /did not verify/);
      assert.deepEqual(published.questions.map(item => item.state), ["awaiting_retest", "awaiting_retest", "baseline_unmeasured"]);
      assert.equal(published.outcome.awaitingRetest, 2); assert.match(published.nextStep, /maxAgeSeconds 0/);

      // One matched retest, one with a different model. Only the matched pair reports movement.
      const pricingAfter = await answer(db, pricing, new Date(start - day / 2), [target, other], [{ url: "https://example.com/pricing" }]);
      await answer(db, migration, new Date(start - day / 2), [target], [], "another-model");
      const read = (await agent.call<{ items: WebsiteChange[] }>("folio_changes", { changeId: recorded.change.id })).result!.items[0];
      assert.deepEqual(read.questions.map(item => item.state), ["retested", "incompatible_retest", "baseline_unmeasured"]);
      assert.equal(read.questions[0].movement, "newly_named"); assert.equal(read.questions[0].retest?.runId, pricingAfter.id); assert.equal(read.questions[0].retest?.targetCited, true);
      assert.equal(read.questions[1].movement, null); assert.deepEqual(read.questions[1].reasons, ["The model changed."]);
      assert.deepEqual(read.outcome, { targeted: 3, retested: 1, improved: 1, declined: 0, unchanged: 0, unknown: 0, awaitingRetest: 0, unmeasured: 2 });
      assert.equal(JSON.stringify(read).includes("Synthetic answer"), false);
      // The agent repeating "published" does not move the owner's reported time or unpair the retest.
      const repeated = (await agent.call<{ change: WebsiteChange }>("folio_change_update", { changeId: recorded.change.id, status: "published" })).result!.change;
      assert.equal(repeated.publication?.at, published.publication?.at); assert.equal(repeated.publication?.reportedBy, "owner"); assert.equal(repeated.questions[0].state, "retested");

      // Recording, reading and updating changes started no evaluation and made no provider request.
      assert.equal(await runs(), before + 2); assert.equal(provider.mock.callCount(), 0);

      const withdrawn = (await agent.call<{ change: WebsiteChange }>("folio_change_update", { changeId: recorded.change.id, status: "withdrawn" })).result!.change;
      assert.equal(withdrawn.status, "withdrawn"); assert.ok(withdrawn.questions.every(item => item.state === "withdrawn"));
      assert.equal((await agent.call("folio_change_update", { changeId: recorded.change.id, status: "published" })).error?.code, "conflict");
      assert.equal((await listWebsiteChanges(db, "alice")).items.length, 1);
      await db.prepare("DELETE FROM sites WHERE id=? AND user_id=?").bind("site-alice", "alice").run();
      assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM website_changes").first<{ n: number }>())!.n, 0);
    } finally { await agent.client.close(); await reader.client.close(); await stranger.client.close(); }
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
