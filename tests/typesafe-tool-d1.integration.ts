import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { createTypesafeToolGrant, authenticateTypesafeTool, invokeTypesafeTool, serveTypesafeTool } from "../src/lib/typesafe-agent-tool";
import { parseCitationReview } from "../src/lib/typesafe-citations";
import { ownedCostSummary } from "../src/lib/provider-costs";
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
const env={OPENAI_API_KEY:'fixture',OPENAI_ALLOWED_USER_IDS:'alice',TYPESAFE_API_KEY:'fixture-typesafe',TYPESAFE_ALLOWED_USER_IDS:'alice',FOLIO_MCP_URL:'https://folio.example.com/api/mcp'};
test('TypeSafe tool runs inside authorized harness with metered idempotent bounded D1 calls',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-typesafe-tool-'));const current=runtime(dir);
 try{
  const db=await current.getD1Database('DB');await setup(db);
  const suite=await createKeywordBenchmarkSuite(db,'alice',{name:'Fixture',cases:[{query:'Which plan includes delivery?',targetUrl:'https://example.com',language:'en',locale:'en-US',rubricVersion:'keyword-observation-v1',searchMode:'open-web'}]});
  let payload:any;
  const run=await startKeywordBenchmark(db,'alice',{caseId:suite.cases[0].id,kind:'baseline',model:'gpt-5.6-luna'},env,{useTypesafeTools:true,fetcher:(async(_u,init)=>{payload=JSON.parse(String(init?.body));return Response.json({id:'session_fixture',object:'agent.session',status:'in_progress',required_actions:[]});}) as typeof fetch});
  const mcp=payload.agent.tools.find((t:any)=>t.server_label==='folio_typesafe');
  assert.deepEqual(mcp.allowed_tools,['typesafe_check_claim']);assert.equal(mcp.connection_origin,'service');assert.equal(payload.environment.network.access,'disabled');assert.match(run.harnessVersion,/typesafe-v1$/);
  assert.ok(!JSON.stringify(payload).includes(env.TYPESAFE_API_KEY));
  const token=mcp.transport.authorization.replace('Bearer ','');
  const principal=await authenticateTypesafeTool(db,token);
  assert.equal(JSON.stringify(await db.prepare('SELECT * FROM typesafe_tool_grants').all()).includes(token),false);
  await assert.rejects(createTypesafeToolGrant(db,'bob',run,{...env,TYPESAFE_ALLOWED_USER_IDS:'bob'}));
  const req=new Request('https://folio.example.com/api/typesafe-mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const list=await (await serveTypesafeTool(req,db,principal,env)).json() as any;
  assert.deepEqual(list.result.tools.map((t:any)=>t.name),['typesafe_check_claim']);
  let calls=0;const invoke:Parameters<typeof invokeTypesafeTool>[4]=async request=>{calls++;return parseCitationReview({model:'jev-fixture',answers:{claim:{type:'choice',choice:'supports',confidence:.98,probabilities:{supports:.99,contradicts:0,insufficient:.01}}},usage:{input_tokens:80,output_tokens:10}},request);};
  const args={requestKey:'stable-key',claim:'Members get delivery.',sourceText:'Members get delivery.',quote:'Members get delivery.'};
  await Promise.all([invokeTypesafeTool(db,principal,args,env,invoke),invokeTypesafeTool(db,principal,args,env,invoke)]);assert.equal(calls,1);
  const callReq=new Request('https://folio.example.com/api/typesafe-mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'typesafe_check_claim',arguments:args}})});
  const callResult=await (await serveTypesafeTool(callReq,db,principal,env)).json() as any;
  assert.equal(JSON.parse(callResult.result.content[0].text).status,'completed');assert.equal(calls,1);
  await assert.rejects(invokeTypesafeTool(db,principal,{...args,claim:'Different claim'},env,invoke),/different input/);
  const rejected=await invokeTypesafeTool(db,principal,{...args,requestKey:'missing-quote',quote:'absent'},env,invoke);assert.equal(rejected.status,'rejected');assert.equal(calls,1);
  await assert.rejects(invokeTypesafeTool(db,{...principal,ownerId:'bob'},args,env,invoke));
  await invokeTypesafeTool(db,principal,{...args,requestKey:'second-key'},env,invoke);
  const fail=async()=>{calls++;throw new Error('timeout');};
  const failed={...args,requestKey:'third-key'};assert.equal((await invokeTypesafeTool(db,principal,failed,env,fail)).status,'needs_attention');
  await invokeTypesafeTool(db,principal,failed,env,fail);assert.equal(calls,3);
  await assert.rejects(invokeTypesafeTool(db,principal,{...args,requestKey:'fourth-key'},env,invoke),/allowance/);
  const costs=(await ownedCostSummary(db,'alice')).groups.filter(g=>g.source==='agent-semantic-tool');assert.equal(costs.reduce((a,g)=>a+g.runs,0),3);assert.equal(costs.reduce((a,g)=>a+(g.input_tokens??0),0),160);assert.ok(costs.every(g=>g.estimated_token_micros===null));
  await db.prepare('UPDATE typesafe_tool_grants SET expires_at=0').run();await assert.rejects(authenticateTypesafeTool(db,token));
  await db.prepare('UPDATE typesafe_tool_grants SET expires_at=?').bind(Date.now()+30000).run();
  await db.prepare('UPDATE keyword_benchmark_runs SET cancel_attempt_at=? WHERE id=?').bind(Date.now(),run.id).run();await assert.rejects(authenticateTypesafeTool(db,token));
 }finally{await current.dispose();await rm(dir,{recursive:true,force:true});}
});
