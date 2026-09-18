import test from 'node:test';
import assert from 'node:assert/strict';
import {websiteLandscape} from '../src/lib/website-landscape';
import type {PublicSearchObservation} from '../src/lib/public-search-rankings';
const observation=(model:string,date:string,sites:[string,number][]):PublicSearchObservation=>({id:model+date,queryId:'q',model,observedAt:date,status:'completed',surface:'openai-managed-agents',searchMode:'open-web',harnessVersion:'v1',environmentType:'test',citations:[],limitations:[],recommendations:sites.map(([url,position])=>({name:url,url,position,citationUrls:[]}))});
test('website metrics deduplicate hosts and models without counting absent models as failures',()=>{
 const rows=[observation('a','2026-09-01',[['https://old.test',1]]),observation('a','2026-09-02',[['https://www.one.test/a',1],['https://one.test/b',2]]),observation('b','2026-09-02',[['https://one.test',3],['https://two.test',1]])];
 const result=websiteLandscape(rows,'q');assert.equal(result.answers,2);assert.equal(result.rows.length,2);assert.equal(result.rows[0].domain,'one.test');assert.equal(result.rows[0].position,2);assert.equal(result.rows[0].share,100);assert.equal(result.rows[1].share,50);
 assert.equal(websiteLandscape(rows,'q','a').rows.length,1);assert.deepEqual(websiteLandscape(rows,'missing'),{answers:0,rows:[]});
});

test('reviewed documentation aliases identify the same website',()=>{const r=websiteLandscape([observation('a','2026-09-01',[['https://docs.railway.com/a',1]]),observation('b','2026-09-01',[['https://railway.com',2]])],'q');assert.equal(r.rows.length,1);assert.equal(r.rows[0].share,100);});

import {websiteOverview} from '../src/lib/website-landscape';
test('overview gives models equal weight instead of overweighting more collected answers',()=>{
 const first=observation('a','2026-09-01',[['https://one.test',1]]);
 const second={...observation('a','2026-09-01',[['https://other.test',1]]),queryId:'q2'};
 const third=observation('b','2026-09-01',[['https://one.test',3]]);
 const overview=websiteOverview([first,second,third],['q','q2'],['a','b','c']);
 const row=overview.rows.find(r=>r.domain==='one.test')!;
 assert.equal(row.share,75);assert.equal(row.position,2);assert.equal(row.appearances,2);assert.equal(row.perModel[2].share,null);assert.equal(overview.complete,false);assert.equal(overview.measuredModels,2);
});
test('overview respects question/model scope and latest answer per pair',()=>{
 const older=observation('a','2026-09-01',[['https://old.test',1]]), newer=observation('a','2026-09-02',[['https://new.test',2]]);
 const result=websiteOverview([older,newer],['q'],['a']);assert.equal(result.answers,1);assert.equal(result.complete,true);assert.equal(result.rows[0].domain,'new.test');
 assert.equal(websiteOverview([newer],['else'],['a']).rows.length,0);
});

import {PUBLIC_CORE_QUERIES} from '../src/lib/public-search-rankings';
test('core cohort excludes both expanded question libraries',()=>{assert.equal(PUBLIC_CORE_QUERIES.length,35);assert.ok(PUBLIC_CORE_QUERIES.some(q=>q.id==='ikea-product-and-delivery-v1'));});

test('catalog documentation aliases combine but unrelated shared-host projects do not',()=>{
 const result=websiteLandscape([observation('a','2026-09-01',[['https://docs.browserbase.com',1],['https://browserbase.com',2],['https://one.github.io',3],['https://two.github.io',4]])],'q');
 assert.equal(result.rows.length,3);assert.equal(result.rows.find(r=>r.domain==='browserbase.com')?.name,'Browserbase');
});
