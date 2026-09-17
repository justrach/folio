import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { D1Database } from "@cloudflare/workers-types";
import { Miniflare } from "miniflare";
import { unstable_splitSqlQuery } from "wrangler";
import { createKeywordBenchmarkSuite, reserveKeywordBenchmarkRun, markKeywordBenchmarkCreateAttempt, updateKeywordBenchmarkRun } from "../src/lib/keyword-benchmark-store";
import { getKeywordPublication, previewKeywordPublication, publishKeywordObservation, withdrawKeywordObservation, readSharedKeywordObservations, mergeSharedKeywordObservations } from "../src/lib/public-keyword-store";
import { publicKeywordRunFixture, publicKeywordQuery } from "./fixtures/public-keyword";
import { buildPublicDashboard } from "../src/lib/public-dashboard";
function runtime(directory: string) {
  return new Miniflare({ host: "127.0.0.1", port: 0, cf: false, telemetry: { enabled: false },
    resourcePersistencePath: join(directory, "persist"), resourceTmpPath: join(directory, "runtime-tmp"),
    workers: [{ config: { name: "folio-keyword-benchmark-fixtures", type: "worker", compatibilityDate: "2026-09-13",
      manifest: { mainModule: "worker.mjs", modules: { "worker.mjs": { type: "esm", contents: 'export default { fetch() { return new Response("Fixture binding", {status:404}); } };' } } },
      env: { DB: { type: "d1", id: "d1d10000-0000-4000-8000-000000000009" } },
    } }],
  });
}
async function setup(db: D1Database) {
  const directory = new URL("../migrations/", import.meta.url);
  for (const name of (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort()) {
    const sql = unstable_splitSqlQuery(await readFile(new URL(name, directory), "utf8"));
    const results = await db.batch(sql.map(statement => db.prepare(statement)));
    assert.ok(results.every(result => result.success), `${name} must apply in actual D1.`);
  }
  for (const owner of ["alice", "bob"]) await db.prepare("INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)").bind(owner, owner, `${owner}@example.test`, Date.now(), Date.now()).run();
}

test("owner publication preview, atomic races, withdrawal and restart use actual isolated D1", {timeout:90_000}, async()=>{
 const directory=await mkdtemp(join(tmpdir(),"folio-publication-d1-"));let current:Miniflare|undefined;
 try {
  current=runtime(directory);let db=await current.getD1Database("DB");await setup(db);
  const fixture=publicKeywordRunFixture();
  const suite=await createKeywordBenchmarkSuite(db,"alice",{name:"Website publication",cases:[{...fixture.case,targetUrl:"https://example.com/"}]});
  let run=await reserveKeywordBenchmarkRun(db,"alice",{caseId:suite.cases[0].id,kind:"baseline",model:fixture.model,harnessVersion:fixture.harnessVersion,environmentType:fixture.environmentType,environmentFingerprint:fixture.environmentFingerprint});
  run=await markKeywordBenchmarkCreateAttempt(db,"alice",run.id,run.revision);
  run=await updateKeywordBenchmarkRun(db,"alice",run.id,run.revision,{status:"completed",sessionId:fixture.sessionId,answer:fixture.answer,providerMetadata:fixture.providerMetadata});
  const metadata={audience:publicKeywordQuery.audience,category:publicKeywordQuery.category};
  const preview=await previewKeywordPublication(db,"alice",run.id,metadata,[publicKeywordQuery]);
  assert.equal(preview.payload.queries[0].id,publicKeywordQuery.id);
  assert.equal((await readSharedKeywordObservations(db)).length,0,"preview must not publish");
  for(const forbidden of [run.id,suite.id,fixture.sessionId!,"referenceFacts","targetUrl","Raw private response"])
   assert.equal(JSON.stringify(preview.payload).includes(forbidden),false,forbidden);
  await assert.rejects(previewKeywordPublication(db,"bob",run.id,metadata));
  await assert.rejects(publishKeywordObservation(db,"bob",run.id,metadata,preview.reviewHash));
  await assert.rejects(publishKeywordObservation(db,"alice",run.id,metadata,"stale",[publicKeywordQuery]));
  const race=await Promise.allSettled([1,2].map(()=>publishKeywordObservation(db!,"alice",run.id,metadata,preview.reviewHash,[publicKeywordQuery])));
  assert.equal(race.filter(value=>value.status==="fulfilled").length,1);
  let saved=await getKeywordPublication(db,"alice",run.id);assert.equal(saved.published,true);
  const shared=await readSharedKeywordObservations(db);
  const base={format:"folio-public-search-rankings-v1",queries:[],observations:[]};
  const progress={format:"folio-public-search-progress-v1",updatedAt:"2026-09-13T00:00:00.000Z",queries:[]};
  const merged=mergeSharedKeywordObservations(base,progress,shared);
  const dashboard=buildPublicDashboard(merged.rankings,merged.progress);
  const catalogMerge=mergeSharedKeywordObservations({...base,queries:[publicKeywordQuery]},
   {...progress,queries:[{queryId:publicKeywordQuery.id,status:"not-started"}]},shared);
  assert.equal(catalogMerge.progress.queries[0].status,"completed","shared result completes an otherwise unstarted catalog question");
  assert.equal(dashboard.summary.publishedQueryCount,1);assert.equal(dashboard.observations[0].recommendations[0].position,1);
  const olderPreview=await previewKeywordPublication(db,"alice",run.id,metadata,[publicKeywordQuery]);
  await current.dispose();current=runtime(directory);db=await current.getD1Database("DB");
  assert.equal((await readSharedKeywordObservations(db)).length,1,"publication persists across restart");
  await assert.rejects(withdrawKeywordObservation(db,"bob",run.id,saved.revision));
  await assert.rejects(withdrawKeywordObservation(db,"alice",run.id,saved.revision+1));
  await withdrawKeywordObservation(db,"alice",run.id,saved.revision);
  assert.equal((await readSharedKeywordObservations(db)).length,0);
  await assert.rejects(publishKeywordObservation(db,"alice",run.id,metadata,olderPreview.reviewHash,[publicKeywordQuery]),/preview changed/);
  const fresh=await previewKeywordPublication(db,"alice",run.id,metadata,[publicKeywordQuery]);
  await publishKeywordObservation(db,"alice",run.id,metadata,fresh.reviewHash,[publicKeywordQuery]);
  assert.equal((await readSharedKeywordObservations(db)).length,1,"explicit fresh preview can republish");
  await db.prepare("DELETE FROM keyword_benchmark_suites WHERE id=? AND user_id=?").bind(suite.id,"alice").run();
  assert.equal((await readSharedKeywordObservations(db)).length,0,"source deletion cascades publication");
 } finally {try{await current?.dispose();}finally{await rm(directory,{recursive:true,force:true});}}
});
