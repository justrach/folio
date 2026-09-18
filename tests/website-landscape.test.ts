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
