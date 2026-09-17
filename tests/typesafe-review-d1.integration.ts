import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { startSemanticReview, getSemanticReview } from "../src/lib/typesafe-review-store";
import { parseCitationReview } from "../src/lib/typesafe-citations";
import { deleteEvaluationEvidence } from "../src/lib/eval-deletion";
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

test("semantic review D1 reservations, isolation, failures, deletion and costs", async()=>{
 const directory=await mkdtemp(join(tmpdir(),"folio-semantic-"));const current=runtime(directory);
 try {
  const db=await current.getD1Database("DB");
  const dir=new URL("../migrations/",import.meta.url);
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) await db.batch(unstable_splitSqlQuery(await readFile(new URL(name,dir),'utf8')).map(sql=>db.prepare(sql)));
  for(const owner of ['alice','bob']) await db.prepare('INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)').bind(owner,owner,`${owner}@example.test`,1,1).run();
  const base={...await createDemoEvaluationRun(),mode:'live' as const};
  const env={TYPESAFE_API_KEY:'fixture-key',TYPESAFE_ALLOWED_USER_IDS:'alice,bob'};
  const run=await createEvaluationRun(db,'alice',{...base,id:'semantic-1'},{maxLivePerDay:null});
  let calls=0;
  const invoke:Parameters<typeof startSemanticReview>[5]=async request=>{calls++;return parseCitationReview({model:'jev-fixture',answers:Object.fromEntries(Object.keys(request.questions).map(id=>[id,{type:'choice',choice:'supports',confidence:.99,probabilities:{supports:.99,contradicts:0,insufficient:.01}}])),usage:{input_tokens:100,output_tokens:10}},request);};
  await assert.rejects(startSemanticReview(db,'bob',run.id,0,env,invoke),/not found/);
  await assert.rejects(startSemanticReview(db,'alice',run.id,1,env,invoke),/Refresh/);
  await assert.rejects(startSemanticReview(db,'alice',run.id,0,{},invoke),/not enabled/);
  const pair=await Promise.all([startSemanticReview(db,'alice',run.id,0,env,invoke),startSemanticReview(db,'alice',run.id,0,env,invoke)]);
  assert.equal(calls,1);assert.ok(pair.some(x=>x?.status==='completed'));
  assert.equal((await startSemanticReview(db,'alice',run.id,0,env,invoke))?.status,'completed');assert.equal(calls,1);
  assert.equal(await getSemanticReview(db,'bob',run.id),null);
  const cost=(await ownedCostSummary(db,'alice')).groups.find(g=>g.provider==='typesafe')!;
  assert.equal(cost.runs,1);assert.equal(cost.unknown_runs,1);assert.equal(cost.input_tokens,100);assert.equal(cost.estimated_token_micros,null);
  await deleteEvaluationEvidence(db,'alice',run.id,0);
  assert.equal(await getSemanticReview(db,'alice',run.id),null);
  assert.equal((await db.prepare('SELECT result_json FROM typesafe_reviews WHERE run_id=?').bind(run.id).first<{result_json:string|null}>())?.result_json,null);
  assert.equal((await ownedCostSummary(db,'alice')).groups.find(g=>g.provider==='typesafe')?.input_tokens,100);
  // Timeout cannot create a second provider call when the owner submits again.
  const failed=await createEvaluationRun(db,'alice',{...base,id:'semantic-failure'},{maxLivePerDay:null});
  const fail=async()=>{calls++;throw new Error('private provider payload');};
  assert.equal((await startSemanticReview(db,'alice',failed.id,0,env,fail))?.status,'needs_attention');
  await startSemanticReview(db,'alice',failed.id,0,env,fail);assert.equal(calls,2);
  // Deletion while inference is in flight cannot restore the erased evidence.
  const race=await createEvaluationRun(db,'alice',{...base,id:'semantic-race'},{maxLivePerDay:null});
  await startSemanticReview(db,'alice',race.id,0,env,async req=>{await deleteEvaluationEvidence(db,'alice',race.id,0);return invoke(req,"fixture-key");});
  assert.equal((await db.prepare('SELECT result_json,input_tokens FROM typesafe_reviews WHERE run_id=?').bind(race.id).first<{result_json:string|null;input_tokens:number}>())?.result_json,null);
  // Daily reservations include failures and erased reviews.
  for(let i=0;i<2;i++){const r=await createEvaluationRun(db,'alice',{...base,id:`quota-${i}`},{maxLivePerDay:null});await startSemanticReview(db,'alice',r.id,0,env,invoke);}
  const limit=await createEvaluationRun(db,'alice',{...base,id:'quota-blocked'},{maxLivePerDay:null});
  await assert.rejects(startSemanticReview(db,'alice',limit.id,0,env,invoke),/allowance/);assert.equal(calls,5);
 }finally{await current.dispose();await rm(directory,{recursive:true,force:true});}
});
