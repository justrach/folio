import assert from 'node:assert/strict';
import test from 'node:test';
import {CategoryBatchRate} from '../scripts/category-batch-rate';
test('adaptive concurrency ramps only after healthy receipts and time, never above authorized capacity',()=>{
 const rate=new CategoryBatchRate(16,0);
 for(let i=0;i<3;i++)rate.receipt(1000);
 assert.equal(rate.desired,5);rate.ramp(30_000);assert.equal(rate.desired,8);
 for(let at=60_000;at<300_000;at+=30_000)for(let i=0;i<3;i++)rate.receipt(at);
 assert.equal(rate.desired,16);assert.equal(rate.canCreate(300_000,16),false);
});
test('upstream failures back off different-question scheduling; repeated failures and auth denial stop creates',()=>{
 const rate=new CategoryBatchRate(20,0);rate.failure(500,1000);
 assert.equal(rate.desired,2);assert.equal(rate.spacingMs,3000);assert.equal(rate.canCreate(20_000,0),false);
 assert.equal(rate.canCreate(31_000,0),true);rate.failure(500,32_000);rate.failure(500,64_000);
 assert.equal(rate.stoppedReason,'repeated-provider-failures');assert.equal(rate.canCreate(300_000,0),false);
 const denied=new CategoryBatchRate(20,0);denied.failure(403,0);assert.equal(denied.stoppedReason,'provider-access-denied');
});

test('a conflict backs off different questions without retrying or treating one conflict as permanent denial',()=>{
 const rate=new CategoryBatchRate(20,0);rate.failure(409,1000);
 assert.equal(rate.stoppedReason,null);assert.equal(rate.canCreate(2000,0),false);assert.equal(rate.canCreate(31000,0),true);
});
