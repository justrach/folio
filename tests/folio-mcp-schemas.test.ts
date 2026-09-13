import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { folioSuccessSchemas, folioOutputSchema } from "../src/lib/folio-mcp-schemas";
import { serveFolioMcp, invokeFolioTool, type FolioToolContext } from "../src/lib/folio-mcp";
import { visibilityReport } from "../src/lib/visibility";
import { compareVisibility } from "../src/lib/visibility-comparison";
import { evaluateHtml } from "../src/lib/evaluation";
import { fetchSeoOverview } from "../src/lib/dataforseo";

const at="2026-09-13T00:00:00.000Z";
const context={db:{},principal:{keyId:"fixture",ownerId:"alice",scopes:["read","evaluate","seo"]},env:{}} as FolioToolContext;
const page={nextCursor:null,truncated:false,ordering:"created_at DESC, id DESC"};
const keywordRun={id:"run",kind:"keyword",status:"completed",model:"fixture",surface:"openai-managed-agents",createdAt:at,updatedAt:at,observedAt:at,result:{text:"Illustrative answer",mentions:[{name:"Cline",url:"https://github.com/cline/cline",citationUrls:["https://cline.bot/"]}],citations:[{url:"https://cline.bot/",title:"Cline"}]},usage:{inputTokens:null,outputTokens:null,totalTokens:null,costUsd:null},error:null,pollUrl:"/api/v1/runs/keyword/run",recovery:null,provenance:{searchMode:"open-web",harnessVersion:"fixture-v1",environmentFingerprint:"fixture",environmentType:"hosted",allowedDomains:[],completedSearchCount:1}};
const observation={disposition:"saved",freshness:{maxAgeSeconds:86400,observedAt:at,ageSeconds:10,fresh:true},run:keywordRun};
const saved={...observation,selectionMeaning:"Compatible saved observation",latestCompletedRun:keywordRun,compatibleRun:keywordRun,latestAttempt:keywordRun,currentAttempt:null,historyState:"fresh",compatibility:{latestCompletedMatchesCurrent:true,mismatchReasons:[]}};
const pendingReport={id:"seo",domain:"example.com",createdAt:at,retrievedAt:null,publication:"private",state:"pending",result:null};
const error={code:"not_found",message:"Missing saved target",retryDisposition:"correct_request_before_retry",requiredScope:null};
const rawRun:Parameters<typeof compareVisibility>[0][number]={kind:"baseline",baselineRunId:null,publication:"private",sessionId:null,createAttemptAt:null,deadlineAt:null,cancelAttemptAt:null,cancelAcknowledgedAt:null,updatedAt:at,revision:0,usage:keywordRun.usage,providerMetadata:{environmentId:null,requestId:null,turnId:null},error:null,id:"run",caseId:"case",suiteId:"suite",case:{query:"Which tool?",targetUrl:"https://example.com",language:"en",locale:"en-US",rubricVersion:"v1",searchMode:"open-web" as const},status:"completed" as const,model:"fixture",harnessVersion:"fixture-v1",environmentFingerprint:"fixture",environmentType:"hosted",surface:"openai-managed-agents" as const,allowedDomains:[],createdAt:at,answer:keywordRun.result};
const report=visibilityReport([rawRun]);
const fixtures:Record<string,unknown>={
  folio_targets:{...page,kind:"keyword",items:[{id:"case",suiteId:"suite",createdAt:at,query:"Which tool?",targetUrl:null,language:"en",locale:"en-US",searchMode:"open-web"}]},
  folio_observation:saved,folio_run:observation,folio_evaluate:observation,folio_reconcile:observation,
  folio_run_history:{...page,items:[keywordRun],changePolling:null},
  folio_observations:{items:[{target:{kind:"keyword",caseId:"case"},result:saved},{target:{kind:"website",websiteId:"missing"},error}]},
  folio_seo_reports:{report:pendingReport,detail:{state:"not_collected",keywords:null,landingPages:null,backlinkRows:null,reason:"Aggregates only",sourceUpdatedAt:null,retrievedAt:null,scope:{location:null,language:null,includeSubdomains:null},estimates:true}},
  folio_seo_lookup:{report:pendingReport,replayed:true,saved:false},folio_sandbox_seo:{report:pendingReport,replayed:true,saved:false},
  folio_page_evidence:{...page,state:"saved_history",recommendationRule:"Inspect saved content",items:[{runId:"failed",state:"fetch_failed",url:"https://example.com"},{runId:"run",captureId:"page",url:"https://example.com",capturedAt:at,sha256:"fixture-hash",hashEncoding:"utf8-text-v1",transport:null,state:"observed",excerpt:"<html><h1>Example</h1></html>",contentTruncated:false,httpStatus:null,finalUrl:null,canonical:null,indexability:null,headings:null,derivedHtml:{basis:"Saved HTML",checks:evaluateHtml("<html><h1>Example</h1></html>","https://example.com").checks.filter(c=>["headings","canonical","indexability"].includes(c.id)).map(c=>({id:c.id,evidence:c.evidence}))},unavailableReason:"Metadata was not stored"}]},
  folio_visibility:{website:{id:"site",name:"Example",url:"https://example.com"},platform:"openai",surface:"openai-managed-agents",searchMode:"open-web",dateRange:{startDate:null,endDate:null,timeZone:"UTC"},coverage:{attemptsLoaded:1,limit:100,truncated:false,nextCursor:null,unresolvedAttempts:0},methodology:"Saved answer",...report,daily:[{date:"2026-09-13",...report.current}],platforms:[{platform:"openai",models:["fixture"],...report.current}]},
  folio_visibility_compare:{...compareVisibility([rawRun],[{...rawRun,id:"later"}]),coverage:{baseline:{nextCursor:null,truncated:false},comparison:{nextCursor:null,truncated:false},scope:"Current pages"}},
};
const args:Record<string,Record<string,unknown>>={folio_targets:{kind:"keyword"},folio_observation:{kind:"keyword",caseId:"case"},folio_run:{kind:"keyword",runId:"run"},folio_evaluate:{kind:"keyword",caseId:"case",requestKey:"fixture-key",confirmSpend:true},folio_reconcile:{kind:"keyword",runId:"run"},folio_run_history:{kind:"keyword"},folio_observations:{targets:[{kind:"keyword",caseId:"case"}]},folio_seo_lookup:{domain:"example.com",requestKey:"fixture-key",confirmSpend:true},folio_page_evidence:{websiteId:"site"},folio_visibility:{websiteId:"site"},folio_visibility_compare:{websiteId:"site",baselineStart:"2026-09-01T00:00:00Z",baselineEnd:"2026-09-05T00:00:00Z",comparisonStart:"2026-09-06T00:00:00Z",comparisonEnd:"2026-09-14T00:00:00Z"}};

async function clientFor(execute:typeof invokeFolioTool, sandbox=false){
  const client=new Client({name:"all-output-fixtures",version:"1"});
  await client.connect(new StreamableHTTPClientTransport(new URL("https://folio.example/api/mcp"),{fetch:async(url,init)=>serveFolioMcp(new Request(url,init),sandbox?{...context,sandbox:{grantId:"grant",ownerId:"alice",domain:"example.com",runId:"run"}}:context,execute)}));
  return client;
}

test("every advertised per-tool success passes the SDK round trip without dropping nested evidence",async()=>{
  fixtures.folio_index=await invokeFolioTool("folio_index",{},context);
  fixtures.folio_capabilities=await invokeFolioTool("folio_capabilities",{},context);
  for(const sandbox of [false,true]){
    const client=await clientFor(async name=>fixtures[name],sandbox);
    try{
      const tools=(await client.listTools()).tools;
      const validators=new AjvJsonSchemaValidator();
      for(const tool of tools){
        const result=await client.callTool({name:tool.name,arguments:args[tool.name]??{}});
        assert.equal(result.isError,undefined,`${tool.name}: ${JSON.stringify(result)}`);
        assert.deepEqual(result.structuredContent,JSON.parse(JSON.stringify({result:fixtures[tool.name]})),tool.name);
        assert.equal(validators.getValidator(tool.outputSchema!)(result.structuredContent).valid,true,tool.name);
        assert.deepEqual(JSON.parse((result.content as {text:string}[])[0].text),result.structuredContent);
        for(const malformed of [{result:{}},{result:{fixture:true}},{result:fixtures[tool.name],error}]) assert.equal(validators.getValidator(tool.outputSchema!)(malformed).valid,false,tool.name);
      }
    }finally{await client.close();}
  }
  assert.deepEqual(Object.keys(fixtures).sort(),Object.keys(folioSuccessSchemas).sort());
});

test("malformed nested success becomes safe execution_uncertain and never leaks the callback payload",async()=>{
  const malformed:Record<string,unknown>={
    folio_run:{...observation,run:{...keywordRun,result:{...keywordRun.result,mentions:[{name:"private-malformed",url:42}]}}},
    folio_observations:{items:[{target:{kind:"keyword",caseId:"case"},result:saved,error}]},
    folio_seo_lookup:{report:{...pendingReport,result:{organic:{costUsd:"private-malformed"}}},replayed:true,saved:false},
    folio_visibility:{...(fixtures.folio_visibility as object),current:{...report.current,visibilityScore:"private-malformed"}},
    folio_page_evidence:{...(fixtures.folio_page_evidence as object),items:[{runId:"run",state:"observed",url:"private-malformed"}]},
  };
  const client=await clientFor(async name=>malformed[name]);
  try{
    const tools=(await client.listTools()).tools,validators=new AjvJsonSchemaValidator();
    for(const [name,payload] of Object.entries(malformed)){
      const validate=validators.getValidator(tools.find(t=>t.name===name)!.outputSchema!);
      assert.equal(validate({result:payload}).valid,false,name);
      const response=await client.callTool({name,arguments:args[name]??{}});
      assert.equal(response.isError,true,name);
      assert.equal((response.structuredContent as {error:{code:string}}).error.code,"execution_uncertain");
      assert.equal(validate(response.structuredContent).valid,true);
      assert.ok(!JSON.stringify(response).includes("private-malformed"));
    }
  }finally{await client.close();}
});

test("website result, missing history, pending SEO and save failure preserve distinct null and omitted fields",()=>{
  const website={...keywordRun,kind:"website",result:{summary:"Fixture",checks:[{id:"readability",label:"Readability",status:"unmeasured",expected:"Saved HTML",actual:"Missing",detail:"No capture",evidenceIds:[]}],passed:0,failed:0,unmeasured:1,measured:0,verificationScore:null,findings:[],citations:[],limitations:["Unmeasured"]},usage:{providerFutureField:{value:1}},provenance:{...keywordRun.provenance,searchMode:null,environmentFingerprint:null,environmentType:"none",completedSearchCount:null}};
  assert.deepEqual(folioSuccessSchemas.folio_run.parse({...observation,run:website}),{...observation,run:website});
  assert.equal(folioSuccessSchemas.folio_run.safeParse({...observation,run:{...website,result:keywordRun.result}}).success,false);
  const missing={...saved,disposition:"missing",run:null,compatibleRun:null,latestCompletedRun:null,latestAttempt:null,currentAttempt:null,historyState:"no_history",compatibility:{latestCompletedMatchesCurrent:null,mismatchReasons:[]},freshness:{maxAgeSeconds:86400,observedAt:null,ageSeconds:null,fresh:false}};
  assert.deepEqual(folioSuccessSchemas.folio_observation.parse(missing),missing);
  assert.deepEqual(folioSuccessSchemas.folio_seo_lookup.parse(fixtures.folio_seo_lookup),fixtures.folio_seo_lookup);
  assert.equal(folioOutputSchema("folio_run").safeParse({result:{...observation,run:{...website,privateCapture:"must not escape"}}}).success,false);
});

test("actual SEO projection with fixture transport validates partial results and storage failure alternatives",async()=>{
  const originalFetch=globalThis.fetch;
  let injectedCalls=0, unexpectedCalls=0;
  globalThis.fetch=async()=>{unexpectedCalls++;throw new Error("Network disabled for schema fixtures");};
  try {
  const overview=await fetchSeoOverview("example.com",{userId:"alice"},{env:{DATAFORSEO_LOGIN:"fixture",DATAFORSEO_PASSWORD:"fixture",DATAFORSEO_ALLOWED_USER_IDS:"alice"},fetcher:async()=>{injectedCalls++;return new Response(JSON.stringify({status_code:20000,tasks:[{id:"fixture-task",status_code:20000,cost:0.01,result:[]}]}),{status:200,headers:{"Content-Type":"application/json"}});}});
  assert.equal(injectedCalls,2);
  assert.equal(unexpectedCalls,0);
  assert.equal(overview.organic.status,"empty");
  assert.equal(overview.backlinks.status,"empty");
  const partial={...overview,status:"partial",totalCostUsd:null,costIsComplete:false,backlinks:{...overview.backlinks,status:"error",data:null,costUsd:null,error:{code:"TIMEOUT",message:"Fixture timeout",retryAutomatically:false}}};
  for(const result of [overview,partial]){
    const complete={report:{...pendingReport,state:"complete",retrievedAt:at,result},replayed:false,saved:true};
    const failedSave={report:{id:"seo",domain:"example.com",result},replayed:false,saved:false,storageWarning:"Keep the result; do not retry"};
    for(const payload of [complete,failedSave]) assert.deepEqual(folioSuccessSchemas.folio_seo_lookup.parse(payload),payload);
  }
  }finally{globalThis.fetch=originalFetch;}
});
