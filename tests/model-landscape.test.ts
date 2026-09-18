import test from 'node:test';
import assert from 'node:assert/strict';
import {median,summarizeLandscape,type ModelLandscapeData} from '../src/lib/model-landscape';
test('landscape medians use paired complete measurements; totals retain failures and unknowns',()=>{
 const data:ModelLandscapeData={format:'folio-model-landscape-v1',observedAt:'2026-09-18',questionCount:5,planned:20,points:[
 {queryId:'a',model:'gpt-5.6-luna',status:'completed',seconds:30,costUsd:.02},
 {queryId:'b',model:'gpt-5.6-luna',status:'completed',seconds:50,costUsd:.04},
 {queryId:'c',model:'gpt-5.6-luna',status:'failed',seconds:180,costUsd:.06},
 {queryId:'d',model:'gpt-5.6-luna',status:'completed',seconds:20,costUsd:null},
 {queryId:'e',model:'gpt-5.6-luna',status:'failed',seconds:null,costUsd:0},
 ]};
 const luna=summarizeLandscape(data).find(m=>m.label==='Luna')!;
 assert.equal(luna.completed,3);assert.equal(luna.plotted,2);assert.equal(luna.seconds,40);assert.equal(luna.costUsd,.03);assert.equal(luna.totalCostUsd,.12);assert.equal(luna.knownCosts,4);
 const astra=summarizeLandscape(data)[0];assert.equal(astra.costUsd,null);assert.equal(astra.totalCostUsd,null);assert.equal(astra.completed,0);
 assert.equal(median([]),null);assert.equal(median([4,1,3]),3);
});

test('published landscape contains only the authorized 10 by 4 public matrix',async()=>{
 const {readFile}=await import('node:fs/promises');
 const data:ModelLandscapeData=JSON.parse(await readFile(new URL('../src/data/model-landscape.json',import.meta.url),'utf8'));
 assert.equal(data.planned,40);assert.equal(data.questionCount,10);assert.equal(data.points.length,40);
 assert.equal(new Set(data.points.map(p=>p.queryId)).size,10);
 assert.equal(new Set(data.points.map(p=>`${p.queryId}/${p.model}`)).size,40);
 for(const p of data.points){
  assert.deepEqual(Object.keys(p).sort(),['costUsd','model','queryId','seconds','status']);
  assert.ok(p.costUsd===null||Number.isFinite(p.costUsd)&&p.costUsd>=0);
  assert.ok(p.seconds===null||Number.isFinite(p.seconds)&&p.seconds>=0);
 }
 for(const m of summarizeLandscape(data))assert.equal(m.attempts,10);
});
