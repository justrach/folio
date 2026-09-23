import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { ownedCostSummary } from "../src/lib/provider-costs";
import { createDemoEvaluationRun } from "../src/lib/eval-verifier";
import { createEvaluationRun, updateEvaluationRun } from "../src/lib/eval-store";
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-cost-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000015" } },
    } }],
  });
}

test("D1 cost snapshots backfill, survive restart, isolate owners and never sum cumulative polls", async () => {
 const directory = await mkdtemp(join(tmpdir(),"folio-costs-")); let current = runtime(directory);
 try {
  let db = await current.getD1Database("DB");
  const migrationDir = new URL("../migrations/", import.meta.url);
  const names = (await readdir(migrationDir)).filter(n=>n.endsWith(".sql")).sort();
  for (const name of names.filter(n=>n<"0015"))
   await db.batch(unstable_splitSqlQuery(await readFile(new URL(name,migrationDir),"utf8")).map(sql=>db.prepare(sql)));
  for(const owner of ["alice","bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner,owner,`${owner}@example.test`,1,1).run();
  const base = {...await createDemoEvaluationRun(),id:"alice-live",mode:"live" as const,status:"queued" as const,model:"gpt-6-astra",sessionId:null,captures:[],events:[],result:null,usage:null};
  await createEvaluationRun(db,"alice",{...await createDemoEvaluationRun(),id:"demo-excluded"});
  let run = await createEvaluationRun(db,"alice",base);
  await createEvaluationRun(db,"bob",{...base,id:"bob-live"});
  for(const name of names.filter(n=>n>="0015")) await db.batch(unstable_splitSqlQuery(await readFile(new URL(name,migrationDir),"utf8")).map(sql=>db.prepare(sql)));
  const newRates = await db.prepare("SELECT model, version, input_usd_per_million, cached_usd_per_million, output_usd_per_million FROM provider_cost_rates WHERE model IN ('gpt-6-luna','gpt-6-sol') ORDER BY model").all();
  assert.deepEqual(newRates.results, [
    { model: "gpt-6-luna", version: "openai-standard-short-2026-09-23", input_usd_per_million: 0.1, cached_usd_per_million: 0.01, output_usd_per_million: 0.5 },
    { model: "gpt-6-sol", version: "openai-standard-short-2026-09-23", input_usd_per_million: 2, cached_usd_per_million: 0.2, output_usd_per_million: 10 },
  ]);
  assert.equal((await ownedCostSummary(db,"alice")).groups[0].unknown_runs,1);
  assert.equal((await ownedCostSummary(db,"alice")).recent.length,1);
  run = await updateEvaluationRun(db,"alice",{...run,status:"running",usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:200}}});
  const summary = await ownedCostSummary(db,"alice");
  assert.equal(summary.groups[0].estimated_token_micros,13200);
  assert.equal(summary.groups[0].runs,1);
  await assert.rejects(updateEvaluationRun(db,"alice",{...run,revision:run.revision-1}));
  await assert.rejects(updateEvaluationRun(db,"bob",run));
  assert.equal((await ownedCostSummary(db,"bob")).groups[0].estimated_token_micros,null);
  const before = await db.prepare("SELECT COUNT(*) n FROM provider_cost_observations").first<{n:number}>();
  run = await updateEvaluationRun(db,"alice",{...run,error:"poll-only"});
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM provider_cost_observations").first<{n:number}>())!.n,before!.n);
  run = await updateEvaluationRun(db,"alice",{...run,status:"failed",usage:{input_tokens:2000,output_tokens:200}});
  assert.equal((await ownedCostSummary(db,"alice")).groups[0].estimated_token_micros,30000,"latest cumulative total replaces earlier observation in summary");
  await db.prepare("INSERT INTO seo_reports(id,user_id,domain,created_at) VALUES('seo','alice','example.test',1)").run();
  assert.equal((await ownedCostSummary(db,"alice")).groups.find(g=>g.source==='seo')!.reported_known_micros,null);
  await db.prepare("UPDATE seo_reports SET retrieved_at=2,result_json=? WHERE id='seo'").bind(JSON.stringify({status:"partial",knownCostUsd:0.0123,totalCostUsd:null,costIsComplete:false,organic:{costUsd:0.0123},backlinks:{costUsd:null}})).run();
  const seo=(await ownedCostSummary(db,"alice")).groups.find(g=>g.source==='seo')!;
  assert.equal(seo.reported_known_micros,12300);assert.equal(seo.reported_complete_runs,0);assert.equal(seo.unknown_runs,1);
  await assert.rejects(db.prepare("UPDATE provider_cost_observations SET estimated_token_micros=0").run());
  await assert.rejects(ownedCostSummary(db,""));
  // Deleting source evidence must not remove cost accounting.
  await db.prepare("DELETE FROM seo_reports WHERE id='seo'").run();
  await current.dispose();current=runtime(directory);db=await current.getD1Database("DB");
  const restored=await ownedCostSummary(db,"alice");assert.equal(restored.groups.find(g=>g.source==='seo')!.reported_known_micros,12300);
  assert.equal(restored.groups.find(g=>g.source==='evaluation')!.estimated_token_micros,30000);
 } finally {await current.dispose();await rm(directory,{recursive:true,force:true});}
});
