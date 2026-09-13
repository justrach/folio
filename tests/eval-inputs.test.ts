import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { startEvaluationRun } from "../src/lib/agent-runs";
import { reserveSeoReport, completeSeoReport } from "../src/lib/seo-store";
import type { SeoOverviewResult } from "../src/lib/dataforseo";
import { DEMO_WEBSITE_HTML } from "../src/lib/eval-verifier";

function database() {
  const sqlite = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  for (const filename of readdirSync(dir).filter(f => f.endsWith(".sql")).sort())
    sqlite.exec(readFileSync(new URL(filename, dir), "utf8"));
  for (const owner of ["alice", "bob"])
    sqlite.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").run(owner, owner, `${owner}@example.test`, 1, 1);
  const db = { prepare(sql:string) { const statement=sqlite.prepare(sql);return { bind(...values:SQLInputValue[]) {return {
    async run(){return {meta:{changes:Number(statement.run(...values).changes)}}},
    async first(){return statement.get(...values)??null},
    async all(){return {results:statement.all(...values)}},
  }}}}} as unknown as D1Database;
  return {db,sqlite};
}
const env={OPENAI_API_KEY:"fixture-key",OPENAI_ALLOWED_USER_IDS:"alice,bob",SCAN_ALLOWED_HOSTS:"example.com"};
async function savedReport(db:D1Database,owner="alice",domain="example.com"){
  const pending=await reserveSeoReport(db,owner,domain);
  const fetchedAt=new Date().toISOString();
  const observation={status:"empty",data:null,costUsd:0.01,taskId:"fixture",providerVersion:null,endpoint:"fixture",fetchedAt,error:null};
  return completeSeoReport(db,owner,pending.id,{provider:"DataForSEO",domain,fetchedAt,status:"complete",organic:observation,backlinks:observation,totalCostUsd:0.02,knownCostUsd:0.02,costIsComplete:true,notes:["unique-private-seo-marker"]} as unknown as SeoOverviewResult);
}

test("live launch freezes owner references while giving the model only the explicitly configured saved-report tool",async t=>{
  const {db,sqlite}=database();t.after(()=>sqlite.close());
  const seo=await savedReport(db);const outbound:Record<string,unknown>[]=[];
  t.mock.method(globalThis,"fetch",async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input);
    if(url==="https://example.com/")return new Response(DEMO_WEBSITE_HTML,{headers:{"content-type":"text/html"}});
    const body=JSON.parse(String(init?.body));outbound.push(body);
    if(url.endsWith("/agents/sessions"))return Response.json({id:"sess_fixture",object:"agent.session",status:"idle",created_at:1,required_actions:[]});
    if(url.endsWith("/events"))return new Response(null,{status:204});
    throw new Error("Unexpected provider endpoint");
  });
  const expectedFacts={source:"owner-confirmed" as const,productName:"owner-only-reference-marker",pricing:{amount:7788,currency:"USD",interval:"year"}};
  const run=await startEvaluationRun(db,"alice",{mode:"managed",domain:"example.com",expectedFacts,seoReportId:seo.id},env);
  assert.deepEqual(run.expectedFacts,expectedFacts);
  assert.equal(run.captures.filter(c=>c.kind==="seo-report").length,1);
  assert.ok(run.captures.some(c=>c.content.includes("unique-private-seo-marker")));
  const sent=JSON.stringify(outbound);assert.ok(!sent.includes("owner-only-reference-marker"));assert.ok(!sent.includes("7788"));assert.ok(!sent.includes("unique-private-seo-marker"));
  assert.equal(outbound.length,1,"One create POST includes initial evidence; no second initial-input event");
  assert.equal(typeof outbound[0].input,"string");
  assert.ok(sent.includes("read_saved_seo_report"));assert.ok(sent.includes(seo.id));
  assert.equal(run.status,"running");
});

test("saved SEO report ownership and domain are checked before reserving or contacting any provider",async t=>{
  const {db,sqlite}=database();t.after(()=>sqlite.close());
  const other=await savedReport(db,"bob");const wrongDomain=await savedReport(db,"alice","other.example.com");let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++;throw new Error("Unexpected request")});
  await assert.rejects(startEvaluationRun(db,"alice",{mode:"managed",domain:"example.com",seoReportId:other.id},env),/completed private SEO report/);
  await assert.rejects(startEvaluationRun(db,"alice",{mode:"managed",domain:"example.com",seoReportId:wrongDomain.id},env),/exact website domain/);
  assert.equal(calls,0);
  assert.equal((sqlite.prepare("SELECT COUNT(*) AS n FROM evaluation_runs").get() as {n:number}).n,0);
});
