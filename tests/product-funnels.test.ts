import test from 'node:test';
import assert from 'node:assert/strict';
import {funnelRates,journeyStages} from '../src/lib/product-funnels';
import {demoProductEvents} from '../src/lib/product-analytics-demo';
import type {UsageEvent} from '../src/lib/product-analytics-store';
test('funnels keep product and demo session paths separate and use ordered observed outcomes',()=>{
 const events=demoProductEvents();
 assert.deepEqual(journeyStages(events,'research').map(s=>s.value),[12,10,8,6,3]);
 assert.deepEqual(journeyStages(events,'content').map(s=>s.value),[3,2,1]);
 const at=(n:number)=>new Date(n*60000).toISOString();
 const row=(id:string,event:UsageEvent['event'],surface:string,result?:string):UsageEvent=>({id,browserId:'browser',sessionId:'same-session',event,area:'patches',surface,properties:result?{result}:{},at:at(Number(id))});
 const separated=[row('1','repair_download_requested','product'),row('2','repair_download_result','repair_demo','success')];
 assert.deepEqual(journeyStages(separated,'repair').map(s=>s.value),[1,0]);
 const failed=[row('1','repair_download_requested','product'),row('2','repair_download_result','product','failed')];
 assert.deepEqual(journeyStages(failed,'repair').map(s=>s.value),[1,0]);
 const success=[row('1','repair_download_requested','product'),row('2','repair_download_result','product','success')];
 assert.deepEqual(journeyStages(success,'repair').map(s=>s.value),[1,1]);
});
test('funnel rates preserve zero denominators as unmeasured and distinguish counts from rates',()=>{
 assert.equal(funnelRates([{key:'first',label:'First',value:0}])[0].ofStart,null);
 const rates=funnelRates([{key:'a',label:'A',value:12},{key:'b',label:'B',value:10},{key:'c',label:'C',value:8}]);
 assert.equal(rates[1].notObserved,2);assert.equal(rates[1].ofStart,10/12);assert.equal(rates[2].retained,.8);
});
