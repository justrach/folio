import test from "node:test";
import assert from "node:assert/strict";
import {compareVisibility} from "../src/lib/visibility-comparison";
import type {KeywordBenchmarkRun} from "../src/lib/keyword-benchmark-types";
const run=(id:string,overrides:Partial<KeywordBenchmarkRun>={})=>({id,caseId:"case",case:{query:"Which?",targetUrl:"https://example.com/",language:"en",locale:"en-US",rubricVersion:"v1",searchMode:"open-web"},status:"completed",model:"fixture",harnessVersion:"v1",environmentType:"sandbox",environmentFingerprint:"fixture",createdAt:"2026-09-13T00:00:00Z",answer:{text:"Fixture",mentions:[{name:"Example",url:"https://example.com/"}],citations:[]},...overrides}) as KeywordBenchmarkRun;
test("matched comparisons retain exact evidence and exclude changed model, harness, locale, search scope and query",()=>{
 const a=run("a"),b=run("b",{createdAt:"2026-09-14T00:00:00Z"});
 const matched=compareVisibility([a],[b],"2026-09-13T12:00:00Z");assert.equal(matched.sampleSize,1);assert.equal(matched.pairs[0].afterPublication,true);assert.equal(matched.pairs[0].baseline.runId,"a");
 for(const changed of [{case:{...b.case,referenceFacts:[{id:"private",statement:"Changed independent reference"}]}},{model:"other"},{harnessVersion:"v2"},{environmentFingerprint:"other"},{case:{...b.case,locale:"fr-FR"}},{case:{...b.case,query:"Changed"}},{case:{...b.case,searchMode:"reviewed-domains" as const}}]){const result=compareVisibility([a],[{...b,...changed}]);assert.equal(result.state,"unmeasured");assert.equal(result.unmatchedComparison.length,1);}
 assert.equal(compareVisibility([a],[]).state,"unmeasured");assert.equal(compareVisibility([a],[run("failed",{status:"failed",answer:null})]).incompleteRuns.length,1);
});
