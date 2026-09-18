import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { queryAgentSeo } from "../src/lib/agent-seo";
import { AgentApiError, createAgentApiKey, authenticateAgentApiKey } from "../src/lib/agent-api-key-store";
import { createSandboxSeoGrant, authenticateSandboxSeoGrant } from "../src/lib/sandbox-seo";
import { startKeywordBenchmark } from "../src/lib/keyword-benchmark-service";
import { createKeywordBenchmarkSuite } from "../src/lib/keyword-benchmark-store";
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-agent-api-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000011" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort())
    await db.batch(unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8")).map(sql => db.prepare(sql)));
  for (const id of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(id, id, `${id}@example.test`, Date.now(), Date.now()).run();
}
const env = { DATAFORSEO_LOGIN: "fixture", DATAFORSEO_PASSWORD: "fixture", DATAFORSEO_ALLOWED_USER_IDS: "alice,bob", OPENAI_API_KEY: "fixture", OPENAI_ALLOWED_USER_IDS: "alice", FOLIO_MCP_URL: "https://folio.example.com/api/mcp" };
test("D1 paid SEO retries race once, isolate owners, share browser allowance and preserve partial outcomes", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-seo-mcp-")), current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    let calls = 0;
    const fetcher = (async () => { calls++; return Response.json({ status_code: 20000, tasks: [{ id: "fixture", status_code: 40501, cost: 0, result: null }] }); }) as typeof fetch;
    const results = await Promise.all(Array.from({ length: 8 }, () => queryAgentSeo(db, "alice", "example.com", "same-request-key", { env, fetcher })));
    assert.equal(calls, 2, "only the two distinct overview provider endpoints execute");
    assert.equal(new Set(results.map(item => item.report.id)).size, 1);
    await queryAgentSeo(db, "alice", "example.com", "same-request-key", { env, fetcher }); assert.equal(calls, 2);
    await assert.rejects(queryAgentSeo(db, "alice", "other.com", "same-request-key", { env, fetcher }), error => error instanceof AgentApiError && error.status === 409);
    await queryAgentSeo(db, "bob", "example.com", "same-request-key", { env, fetcher }); assert.equal(calls, 4);
    await db.prepare("UPDATE rate_limit SET count=20 WHERE key=?").bind("folio:seo-data:alice").run();
    await assert.rejects(queryAgentSeo(db, "alice", "example.com", "new-request-key", { env, fetcher }), error => error instanceof AgentApiError && error.status === 429);
    assert.equal(calls, 4);
    const key = await createAgentApiKey(db, "alice", { name: "Old evaluate scope", scopes: ["read", "evaluate"] });
    await assert.rejects(authenticateAgentApiKey(db, key.token, "seo"), error => error instanceof AgentApiError && error.status === 403);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});
test("D1 sandbox capability is hashed, selected-domain-only, expires and uses service-origin MCP outside shell network", { timeout: 90_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-sandbox-seo-")), current = runtime(directory);
  try {
    const db = await current.getD1Database("DB"); await setup(db);
    const suite = await createKeywordBenchmarkSuite(db, "alice", { name: "Fixture", cases: [{ query: "What does example do?", targetUrl: "https://example.com/", language: "en", locale: "en-US", rubricVersion: "keyword-observation-v1", searchMode: "open-web" }] });
    let payload: any;
    const run = await startKeywordBenchmark(db, "alice", { caseId: suite.cases[0].id, kind: "baseline", model: "gpt-5.6-luna" }, env, { useSeoTools: true, fetcher: (async (_url, init) => {
      payload = JSON.parse(String(init?.body)); return Response.json({ id: "session_fixture", object: "agent.session", status: "in_progress", required_actions: [] });
    }) as typeof fetch });
    const mcp = payload.agent.tools.find((tool: any) => tool.type === "mcp");
    assert.equal(mcp.connection_origin, "service"); assert.equal(payload.environment.network.access, "disabled");
    assert.deepEqual(mcp.allowed_tools, ["folio_sandbox_seo", "folio_keyword_research"]);
    const token = mcp.transport.authorization.replace("Bearer ", "");
    assert.equal(JSON.stringify(payload.input).includes(token), false);
    const principal = await authenticateSandboxSeoGrant(db, token); assert.equal(principal.domain, "example.com"); assert.equal(principal.ownerId, "alice");
    assert.equal(JSON.stringify(await db.prepare("SELECT * FROM sandbox_seo_grants").all()).includes(token), false);
    assert.match(run.harnessVersion, /seo-v2$/);
    await assert.rejects(createSandboxSeoGrant(db, "bob", run, { ...env, DATAFORSEO_ALLOWED_USER_IDS: "bob" }));
    await db.prepare("UPDATE sandbox_seo_grants SET expires_at=0 WHERE run_id=?").bind(run.id).run();
    await assert.rejects(authenticateSandboxSeoGrant(db, token), error => error instanceof AgentApiError && error.status === 401);
    await db.prepare("UPDATE sandbox_seo_grants SET expires_at=? WHERE run_id=?").bind(Date.now() + 30_000, run.id).run();
    await db.prepare("UPDATE keyword_benchmark_runs SET cancel_attempt_at=? WHERE id=?").bind(Date.now(), run.id).run();
    await assert.rejects(authenticateSandboxSeoGrant(db, token), error => error instanceof AgentApiError && error.status === 401);
  } finally { await current.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test("D1 keyword research: Luna tools, concurrent quotas, saved costs, owner isolation and no ambiguous retries",{timeout:90000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),"folio-keyword-research-")),current=runtime(directory);
 try{
  const db=await current.getD1Database("DB");await setup(db);
  const {queryKeywordResearch}=await import("../src/lib/keyword-research");
  const {ownedCostSummary}=await import("../src/lib/provider-costs");
  const {invokeFolioTool,serveFolioMcp}=await import("../src/lib/folio-mcp");
  const suite=await createKeywordBenchmarkSuite(db,"alice",{name:"Fixture",cases:[{query:"What free tool could this website offer?",targetUrl:"https://example.com/",language:"en",locale:"en-US",rubricVersion:"keyword-observation-v1",searchMode:"open-web"}]});
  let payload:any;
  await startKeywordBenchmark(db,"alice",{caseId:suite.cases[0].id,kind:"baseline"},env,{useSeoTools:true,fetcher:async(_url,init)=>{payload=JSON.parse(String(init?.body));return Response.json({id:"session_research",object:"agent.session",status:"in_progress",required_actions:[]});}});
  assert.equal(payload.agent.model,"gpt-5.6-luna");
  const tool=payload.agent.tools.find((t:any)=>t.type==="mcp"),token=tool.transport.authorization.replace("Bearer ","");
  const sandbox=await authenticateSandboxSeoGrant(db,token);assert.equal(sandbox.toolVersion,2);
  let calls=0;
  const fetcher:typeof fetch=async()=>{calls++;return Response.json({status_code:20000,tasks:[{id:"research-task",status_code:20000,cost:.015,result:[{items:[{keyword_data:{keyword:"free checker",keyword_info:{search_volume:25}}}]}]}]});};
  const context={db,principal:{ownerId:"alice",keyId:sandbox.grantId,scopes:["seo" as const]},sandbox,env};
  const listRequest=()=>new Request("https://folio.example.com/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/list"})});
  const listed=await (await serveFolioMcp(listRequest(),context)).json() as any;
  assert.deepEqual(listed.result.tools.map((t:any)=>t.name),["folio_sandbox_seo","folio_keyword_research"]);assert.equal(calls,0);
  const legacy=await (await serveFolioMcp(listRequest(),{...context,sandbox:{...sandbox,toolVersion:1}})).json() as any;
  assert.deepEqual(legacy.result.tools.map((t:any)=>t.name),["folio_sandbox_seo"]);
  const input={domain:"example.com",seed:"website checker",requestKey:"research-fixture"};
  const values=await Promise.all(Array.from({length:8},()=>queryKeywordResearch(db,"alice",input,{env,fetcher},sandbox)));
  assert.equal(calls,1);assert.equal(new Set(values.map(v=>v.id)).size,1);
  const replay=await queryKeywordResearch(db,"alice",{...input,seed:" Website Checker ",requestKey:"changed-by-model"},{env,fetcher},sandbox);
  assert.equal(replay.replayed,true);assert.equal(calls,1);
  await assert.rejects(queryKeywordResearch(db,"bob",input,{env,fetcher},sandbox));
  await assert.rejects(queryKeywordResearch(db,"alice",{...input,domain:"other.com"},{env,fetcher},sandbox));
  const more=await Promise.allSettled(Array.from({length:6},(_,i)=>queryKeywordResearch(db,"alice",{...input,seed:`checker ${i}`},{env,fetcher},sandbox)));
  assert.equal(more.filter(r=>r.status==="fulfilled").length,2);assert.equal(calls,3);
  const costs=await ownedCostSummary(db,"alice");const group=costs.groups.find(g=>g.source==="keyword-research")!;
  assert.equal(group.runs,3);assert.equal(group.reported_known_micros,45000);assert.equal(group.unknown_runs,0);
  assert.equal((await ownedCostSummary(db,"bob")).groups.length,0);
  // Expired/cancelled capabilities cannot make another reservation even if stale context survived auth.
  await db.prepare("DELETE FROM keyword_research_requests WHERE grant_id=?").bind(sandbox.grantId).run();
  await db.prepare("UPDATE keyword_benchmark_runs SET cancel_attempt_at=? WHERE id=?").bind(Date.now(),sandbox.runId).run();
  await assert.rejects(queryKeywordResearch(db,"alice",input,{env,fetcher},sandbox));assert.equal(calls,3);
  let attempts=0;const failing:typeof fetch=async()=>{attempts++;throw Error("ambiguous provider POST");};
  const failed=await queryKeywordResearch(db,"bob",input,{env,fetcher:failing});assert.equal(failed.status,"needs_attention");
  await queryKeywordResearch(db,"bob",input,{env,fetcher:failing});assert.equal(attempts,1);
  await assert.rejects(queryKeywordResearch(db,"bob",{...input,seed:"different"},{env,fetcher:failing}));
  assert.equal((await ownedCostSummary(db,"bob")).groups[0].unknown_runs,1);
  const withoutSeo={...context,sandbox:undefined,principal:{ownerId:"bob",keyId:"read-only",scopes:["read" as const]}};
  await assert.rejects(invokeFolioTool("folio_keyword_research",{...input,confirmSpend:true},withoutSeo));
  // Real SDK invocation also retains structured metrics and billed task cost.
  t.mock.method(globalThis,"fetch",fetcher);
  const request=new Request("https://folio.example.com/api/mcp",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json, text/event-stream"},body:JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"folio_keyword_research",arguments:{...input,requestKey:"external-fixture",confirmSpend:true}}})});
  const result=await (await serveFolioMcp(request,{...context,sandbox:undefined})).json() as any;
  assert.equal(result.result.isError,undefined);assert.equal(result.result.structuredContent.result.result.costUsd,.015);
  const daily=await Promise.allSettled(Array.from({length:18},(_,i)=>queryKeywordResearch(db,"alice",{...input,requestKey:`daily-fixture-${i}`},{env,fetcher})));
  assert.equal(daily.filter(r=>r.status==="fulfilled").length,14);
 }finally{await current.dispose();await rm(directory,{recursive:true,force:true});}
});
