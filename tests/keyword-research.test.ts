import assert from "node:assert/strict";
import test from "node:test";
import {getRelatedKeywords,normalizeKeywordSeed} from "../src/lib/dataforseo";
const env={DATAFORSEO_LOGIN:"fixture",DATAFORSEO_PASSWORD:"fixture",DATAFORSEO_ALLOWED_USER_IDS:"alice"};
test("keyword research bounds provider requests and preserves zero, unknown, dates and task cost",async()=>{
 let count=0;
 const result=await getRelatedKeywords(" Website Checker ",{userId:"alice"},{env,fetcher:async(url,init)=>{
  count++;assert.equal(String(url),"https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live");
  assert.deepEqual(JSON.parse(String(init?.body)),[{keyword:"website checker",location_code:2840,language_code:"en",depth:2,limit:20,include_seed_keyword:true,include_serp_info:false}]);
  return Response.json({status_code:20000,cost:99,tasks:[{id:"fixture-task",cost:0.012,status_code:20000,result:[{items:[{keyword_data:{keyword:"free checker",keyword_info:{search_volume:0,cpc:null,competition:0,last_updated_time:"2026-09-01",monthly_searches:[{year:2026,month:8,search_volume:0}]}}}]}]}]});
 }});
 assert.equal(count,1);assert.equal(result.costUsd,.012);assert.equal(result.data?.keywords[0].searchVolume,0);assert.equal(result.data?.keywords[0].cpcUsd,null);assert.equal(result.data?.keywords[0].monthlySearches[0].searchVolume,0);
 assert.equal(result.data?.keywords[0].updatedAt,"2026-09-01");
});
test("keyword access/input failures make no request and network failures never retry",async()=>{
 let count=0;const fetcher:typeof fetch=async()=>{count++;throw Error("private provider text");};
 await assert.rejects(getRelatedKeywords("checker",{userId:"bob"},{env,fetcher}));
 await assert.rejects(getRelatedKeywords("\nsecret",{userId:"alice"},{env,fetcher}));assert.equal(count,0);
 const result=await getRelatedKeywords("checker",{userId:"alice"},{env,fetcher});assert.equal(count,1);assert.equal(result.status,"error");assert.equal(result.costUsd,null);assert.ok(!JSON.stringify(result).includes("private provider text"));
 assert.equal(normalizeKeywordSeed("  Website   Checker "),"website checker");
});
