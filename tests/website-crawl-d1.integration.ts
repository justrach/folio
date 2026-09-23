import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { startEvaluationRun, reconcileEvaluationRun, cancelEvaluationRun } from "../src/lib/agent-runs";
import { authenticateCrawl,readCrawlPage,reviewCrawl,getCrawlResult,validateCrawlFinal,serveCrawl } from "../src/lib/website-crawl";
import { parseCitationReview } from "../src/lib/typesafe-citations";
import { ownedCostSummary } from "../src/lib/provider-costs";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";
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
const env={OPENAI_API_KEY:'fixture-openai',OPENAI_ALLOWED_USER_IDS:'alice',OPENAI_AGENTS_MODEL:'gpt-6-astra',OPENAI_MAX_RUNS_PER_DAY:'10',TYPESAFE_API_KEY:'fixture-typesafe',TYPESAFE_ALLOWED_USER_IDS:'alice',FOLIO_MCP_URL:'https://folio.example.com/api/mcp'};
test('Luna crawl: actual D1 bounded pages, one Jev review, saved reconciliation, isolation and deletion',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-crawl-')), mf=runtime(dir);
 try{
  const db=await mf.getD1Database('DB');await setup(db);
  let payload:any,creates=0;
  const session={id:'sess_crawl_fixture',object:'agent.session',created_at:1,status:'in_progress',required_actions:[]};
  t.mock.method(globalThis,'fetch',async(_u:any,init:any)=>{creates++;payload=JSON.parse(init.body);return Response.json(session);});
  const run=await startEvaluationRun(db,'alice',{mode:'managed',domain:'https://example.com/',websiteCrawl:true},env);
  assert.equal(run.status,'running');assert.equal(run.model,'gpt-6-luna');assert.equal(run.workflow,'website-crawl-v1');assert.equal(creates,1);
  assert.equal(payload.agent.model,'gpt-6-luna');assert.equal(payload.environment.network.access,'disabled');assert.equal(payload.agent.tools.length,1);
  assert.deepEqual(payload.agent.tools[0].allowed_tools,['crawl_read_page','crawl_review_pages']);assert.ok(!JSON.stringify(payload).includes(env.TYPESAFE_API_KEY));
  const token=payload.agent.tools[0].transport.authorization.replace('Bearer ',''),p=await authenticateCrawl(db,token);
  assert.ok(!JSON.stringify(await db.prepare('SELECT * FROM website_crawl_grants').all()).includes(token));
  await assert.rejects(startEvaluationRun(db,'bob',{mode:'managed',domain:'https://example.com',websiteCrawl:true},env));
  await assert.rejects(startEvaluationRun(db,'alice',{mode:'managed',domain:'http://example.com',websiteCrawl:true},env));
  const req=new Request('https://folio.example.com/api/crawl-mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
  const tools=await (await serveCrawl(req,db,p,env)).json() as any;assert.equal(tools.result.tools.length,2);assert.equal(creates,1,'discovery makes no provider request');
  let gets=0;
  const pageFetch:typeof fetch=async(input,init)=>{gets++;assert.equal(init?.method??'GET','GET');return new Response(`<title>Fixture</title><script>private script text</script><p>Tool for small teams. Plans cost $10 monthly.</p>${Array.from({length:12},(_,i)=>`<a href="/page-${i}">Page ${i}</a>`).join('')}<a href="https://evil.example.com/">Outside</a>`,{headers:{'content-type':'text/html'}});};
  await assert.rejects(readCrawlPage(db,p,'https://evil.example.com/',pageFetch));
  await assert.rejects(readCrawlPage(db,p,'https://example.com/undiscovered',pageFetch));
  await assert.rejects(readCrawlPage(db,{...p,ownerId:'bob'},p.target,pageFetch));assert.equal(gets,0);
  const first=await readCrawlPage(db,p,p.target,pageFetch);assert.equal(first.status,'completed');assert.ok(!first.page.text.includes('private script text'));assert.equal(first.page.links.length,12);
  await readCrawlPage(db,p,p.target,pageFetch);assert.equal(gets,1,'same URL is never fetched twice');
  await Promise.all(Array.from({length:12},(_,i)=>readCrawlPage(db,p,`https://example.com/page-${i}`,pageFetch).catch(()=>null)));
  assert.equal(gets,10);assert.equal((await getCrawlResult(db,'alice',run.id)).attemptedPages,10);assert.equal((await getCrawlResult(db,'bob',run.id)).pages.length,0);
  let reviews=0;
  const invoke:Parameters<typeof reviewCrawl>[3]=async request=>{reviews++;assert.equal(Object.keys(request.questions).length,30);assert.ok(!JSON.stringify(request).includes(env.OPENAI_API_KEY));return parseCitationReview({model:'jev-fixture',answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:'choice',choice:'supports',confidence:.9,probabilities:{supports:.9,contradicts:0,insufficient:.1}}])),usage:{input_tokens:3000,output_tokens:200}},request);};
  await Promise.all([reviewCrawl(db,p,env,invoke),reviewCrawl(db,p,env,invoke)]);assert.equal(reviews,1);
  await reviewCrawl(db,p,env,invoke);assert.equal(reviews,1);
  const result=await getCrawlResult(db,'alice',run.id);assert.equal(result.reviewStatus,'completed');assert.equal(result.review?.results.length,30);
  await assert.rejects(readCrawlPage(db,p,'https://example.com/page-11',pageFetch));
  const costs=await ownedCostSummary(db,'alice');const group=costs.groups.find(g=>g.source==='crawl-semantic-review');assert.equal(group?.runs,1);assert.equal(group?.input_tokens,3000);assert.equal(group?.estimated_token_micros,null);
  const final=JSON.stringify({workflow:'website-crawl-v1',pageIds:result.pages.map(p=>p.id),limitations:['HTML only']});
  assert.doesNotThrow(()=>validateCrawlFinal(final,result));assert.throws(()=>validateCrawlFinal(JSON.stringify({workflow:'website-crawl-v1',pageIds:['invented'],limitations:[]}),result));
  t.mock.method(globalThis,'fetch',async(input:any)=>{const u=String(input);if(u.includes('/turns'))return Response.json({data:[{id:'turn_crawl',session_id:session.id,created_at:1,status:'completed',usage:{input_tokens:800,output_tokens:50}}],has_more:false});if(u.includes('/items'))return Response.json({data:[{id:'final_crawl',turn_id:'turn_crawl',type:'message',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:final}]}],has_more:false});return Response.json({...session,status:'idle'});});
  const complete=await reconcileEvaluationRun(db,'alice',run.id,env);assert.equal(complete.status,'completed');assert.equal(complete.result,null);assert.equal(complete.crawlResult?.pages.length,10);assert.equal(reviews,1);
  await assert.rejects(authenticateCrawl(db,token));
  await deleteEvaluationEvidence(db,'alice',run.id,complete.revision);
  assert.equal((await getCrawlResult(db,'alice',run.id)).pages.length,0);assert.equal((await db.prepare('SELECT result_json FROM website_crawl_reviews').first<any>()).result_json,null);
  assert.equal((await ownedCostSummary(db,'alice')).groups.find(g=>g.source==='crawl-semantic-review')?.input_tokens,3000);
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('crawl failure and cancellation preserve unknown paid outcomes without retries',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-crawl-fail-')),mf=runtime(dir);
 try{
  const db=await mf.getD1Database('DB');await setup(db);let payload:any;
  t.mock.method(globalThis,'fetch',async(_u:any,init:any)=>{payload=JSON.parse(init.body);return Response.json({id:'sess_failure_fixture',object:'agent.session',created_at:1,status:'in_progress',required_actions:[]});});
  const run=await startEvaluationRun(db,'alice',{mode:'managed',domain:'https://example.com/',websiteCrawl:true},env);
  const token=payload.agent.tools[0].transport.authorization.replace('Bearer ',''),p=await authenticateCrawl(db,token);
  await readCrawlPage(db,p,p.target,async()=>new Response('<p>Fixture</p>',{headers:{'content-type':'text/html'}}));
  let calls=0;const fail=async()=>{calls++;throw new Error('ambiguous timeout');};
  await reviewCrawl(db,p,env,fail);await reviewCrawl(db,p,env,fail);assert.equal(calls,1);assert.equal((await getCrawlResult(db,'alice',run.id)).reviewStatus,'needs_attention');
  await cancelEvaluationRun(db,'alice',run.id,env);await assert.rejects(authenticateCrawl(db,token));
  await assert.rejects(readCrawlPage(db,p,'https://example.com/new',async()=>{throw new Error('must not fetch');}));
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('capture finishing after deletion returns no unsaved page text',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'folio-crawl-delete-')),mf=runtime(dir);
 try{
  const db=await mf.getD1Database('DB');await setup(db);let payload:any;
  t.mock.method(globalThis,'fetch',async(_u:any,init:any)=>{payload=JSON.parse(init.body);return Response.json({id:'sess_deletion_fixture',created_at:1,object:'agent.session',status:'in_progress',required_actions:[]});});
  const run=await startEvaluationRun(db,'alice',{mode:'managed',domain:'https://example.com/',websiteCrawl:true},env);
  const p=await authenticateCrawl(db,payload.agent.tools[0].transport.authorization.replace('Bearer ',''));
  const result=await readCrawlPage(db,p,p.target,async()=>{
   await db.prepare("UPDATE evaluation_runs SET status='failed' WHERE id=?").bind(run.id).run();
   await deleteEvaluationEvidence(db,'alice',run.id,run.revision);
   return new Response('<p>Must not return deleted content</p>',{headers:{'content-type':'text/html'}});
  });
  assert.equal(result.status,'failed');assert.equal(result.page,null);
  assert.equal((await getCrawlResult(db,'alice',run.id)).pages.length,0);
 }finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
