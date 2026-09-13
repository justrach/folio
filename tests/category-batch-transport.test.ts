import test from 'node:test';
import assert from 'node:assert/strict';
import {ProviderMutationGate} from '../scripts/category-batch-transport';
test('slow mutations never overlap and the next waits after completion, not merely after start',async()=>{
 let now=10_000,active=0,peak=0;const starts:number[]=[];
 const gate=new ProviderMutationGate(1500,()=>now,async ms=>{now+=ms;});
 await Promise.all(Array.from({length:8},(_,index)=>gate.run(async()=>{starts.push(now);active++;peak=Math.max(peak,active);await Promise.resolve();now+=index%2?4000:2000;active--;})));
 assert.equal(peak,1);
 for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>=3500);
});
test('a failed mutation is not retried and does not poison the gate for a different request',async()=>{
 let now=10_000,attempts=0;const gate=new ProviderMutationGate(1500,()=>now,async ms=>{now+=ms;});
 const first=gate.run(async()=>{attempts++;throw Error('ambiguous fixture');});
 const second=gate.run(async()=>{attempts++;return 'different question';});
 await assert.rejects(first,/ambiguous/);assert.equal(await second,'different question');assert.equal(attempts,2);
});
