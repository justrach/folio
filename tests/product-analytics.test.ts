import test from 'node:test';
import assert from 'node:assert/strict';
import {safeProductProperties,parseProductEvent,analyticsArea,analyticsSurface} from '../src/lib/product-analytics-schema';
import {productUsageSummary,researchFunnel,isAnalyticsOperator} from '../src/lib/product-analytics-store';
import {captureProductEvent} from '../src/lib/product-analytics-server';
import {demoProductEvents} from '../src/lib/product-analytics-demo';
const uuid='00000000-0000-4000-8000-000000000001';
test('analytics accepts only bounded event labels and excludes private text, URL and owner fields',()=>{assert.deepEqual(safeProductProperties({area:'evaluations',surface:'product',step:2,prompt:'private',caption:'private',url:'https://private.test?key=secret',ownerId:'alice',email:'private@test',error_code:'https://private.test',duration_ms:Infinity}),{area:'evaluations',surface:'product',step:2});assert.equal(analyticsArea('/private-url/path'),'other');assert.equal(analyticsSurface(new URLSearchParams('view=demo&demo=analytics')),'analytics_demo');assert.equal(parseProductEvent({event:'prompt text',browser_id:uuid,session_id:uuid,event_id:uuid}),null);});
test('funnel counts ordered sessions and does not count a failed or merely running report as success',()=>{const data=demoProductEvents();assert.equal(productUsageSummary(data.filter(e=>e.surface==='product')).visitors,12);assert.deepEqual(researchFunnel(data).map(s=>s.count),[12,10,8,6,3]);const failed=data.map(e=>e.event==='report_viewed'?{...e,properties:{status:'failed'}}:e);assert.equal(researchFunnel(failed)[3].count,0);const summary=productUsageSummary(data);for(const p of summary.people)assert.equal(p.views+p.work+p.exports+p.errors,p.events);});
test('operator access is exact and has no implicit default administrator',()=>{assert.equal(isAnalyticsOperator('alice',undefined),false);assert.equal(isAnalyticsOperator('alice','alice-other,bob'),false);assert.equal(isAnalyticsOperator('alice',' alice,bob '),true);assert.equal(isAnalyticsOperator(null,'alice'),false);});
test('capture rejects cross-origin, oversized, and malformed events before obtaining storage',async()=>{let reads=0;const db=async()=>{reads++;throw new Error('not expected');};const env={BETTER_AUTH_URL:'https://usefolio.site'};let response=await captureProductEvent(new Request('https://usefolio.site/api/analytics',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'}),env,db);assert.equal(response.status,403);response=await captureProductEvent(new Request('https://usefolio.site/api/analytics',{method:'POST',headers:{origin:'https://usefolio.site'},body:'x'.repeat(4097)}),env,db);assert.equal(response.status,413);response=await captureProductEvent(new Request('https://usefolio.site/api/analytics',{method:'POST',headers:{origin:'https://usefolio.site'},body:'{}'}),env,db);assert.equal(response.status,400);assert.equal(reads,0);});

// Real report policy: the same owner allowlist as main's internal admin surface.
test('admin report reuses existing admin accounts and rejects ordinary sessions before storage',async()=>{
 const {readAdminAnalyticsReport}=await import('../src/lib/product-analytics-report');
 const {ADMIN_OWNERS}=await import('../src/lib/admin-emails');
 let reads=0;
 const db=async()=>{reads++;return {prepare:()=>({bind:()=>({all:async()=>({results:[]})})})} as unknown as import('@cloudflare/workers-types').D1Database;};
 const req=new Request('https://usefolio.site/api/analytics/report');
 assert.equal((await readAdminAnalyticsReport(req,null,db)).status,401);
 assert.equal((await readAdminAnalyticsReport(req,{id:'ordinary',email:'ordinary@example.test'},db)).status,403);
 assert.equal(reads,0);
 const response=await readAdminAnalyticsReport(req,{id:'admin-fixture',email:ADMIN_OWNERS[0]},db);
 assert.equal(response.status,200);assert.equal(reads,1);
 assert.deepEqual((await response.json()).events,[]);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('new workflow events accept only bounded action labels, never private payloads',()=>{
 const properties=safeProductProperties({action:'return_evidence',method:'google',flow:'fresh',kind:'repair_bundle',status:'requires_action',reason:'raw private error',sessionId:'provider-private',sourceUrl:'https://secret.test',step:4});
 assert.deepEqual(properties,{action:'return_evidence',method:'google',flow:'fresh',kind:'repair_bundle',status:'requires_action',step:4});
 for(const event of ['repair_download_requested','followup_prepared','comparison_opened','evaluation_action_result','onboarding_step_completed'])assert.ok(parseProductEvent({event,browser_id:uuid,session_id:uuid,event_id:uuid,properties}));
});

test('analytics binding never falls back to the main report database',async()=>{
 const {analyticsDatabase}=await import('../src/lib/product-analytics-db');
 const main={prepare(){throw new Error('Business database must not be touched');}};
 assert.throws(()=>analyticsDatabase({DB:main} as never),/isolated analytics/);
 const analytics={} as import('@cloudflare/workers-types').D1Database;
 assert.equal(analyticsDatabase({DB:main,ANALYTICS_DB:analytics} as never),analytics);
});
test('a pending analytics write does not hold up the interaction response',async()=>{
 let release!:(db:import('@cloudflare/workers-types').D1Database)=>void;
 const db=new Promise<import('@cloudflare/workers-types').D1Database>(resolve=>{release=resolve;});
 let background:Promise<unknown>|undefined;
 const request=new Request('https://usefolio.site/api/analytics',{method:'POST',headers:{origin:'https://usefolio.site'},body:JSON.stringify({event:'page_view',browser_id:uuid,session_id:uuid,event_id:uuid})});
 const response=await captureProductEvent(request,{},()=>db,task=>{background=task;});
 assert.equal(response.status,202);assert.deepEqual(await response.json(),{queued:true});assert.ok(background);
 release({batch:async()=>[{results:[]},{results:[{id:uuid}]}],prepare:()=>({bind(){return this;}})} as unknown as import('@cloudflare/workers-types').D1Database);
 assert.equal(await background,true);
});
