import test from "node:test";
import assert from "node:assert/strict";
import { visibilityReport, type VisibilityRun } from "../src/lib/visibility";
import { visibilityFilters } from "../src/lib/visibility-service";
const run=(id:string,caseId:string,mentions:{name:string;url:string|null}[]):VisibilityRun=>({id,caseId,suiteId:"suite",case:{query:"Which tool?",targetUrl:"https://codegraff.com/",language:"en",locale:"en-US",rubricVersion:"v1",searchMode:"open-web"},status:"completed",model:"fixture",harnessVersion:"v1",createdAt:`2026-09-${id}T00:00:00.000Z`,answer:{text:"fixture",mentions,citations:[{url:"https://competitor.com/docs"}]}});
test("visibility preserves completed results, deduplicates domains and excludes unknown identity",()=>{
 const first=run("10","a",[{name:"Target",url:"https://codegraff.com/"},{name:"Target again",url:"https://www.codegraff.com/docs"},{name:"Other",url:"https://competitor.com/"}]);
 const later={...first,id:"11",createdAt:"2026-09-11T00:00:00.000Z",status:"failed" as const,answer:null};
 const unknown=run("12","b",[{name:"Unknown",url:null}]);
 const report=visibilityReport([first,later,unknown]);
 assert.equal(report.current.visibilityScore,100);assert.equal(report.current.unknownQuestions,1);assert.equal(report.current.shareOfVoice,50);assert.equal(report.current.averagePosition,1);assert.equal(report.recommendations[0].runId,"10");assert.equal(report.citations[0].answers,2);
 assert.equal(visibilityReport([]).current.visibilityScore,null);
});
test("recommendations explain an observed absence and cite its evidence",()=>{
 const report=visibilityReport([run("10","a",[{name:"Other",url:"https://competitor.com/"}])]);
 assert.equal(report.current.visibilityScore,0);assert.equal(report.current.averagePosition,null);assert.match(report.recommendations[0].basis,/not listed/);
 assert.equal(JSON.stringify(report).includes('"text"'),false);
});
test("visibility filters reject ambiguous, unsupported and invalid dates",()=>{
 for(const suffix of ["&websiteId=another","&platform=chatgpt","&startDate=2026-02-30","&startDate=2026-09-10&endDate=2026-09-01","&limit=0","&unknown=x"])
 assert.throws(()=>visibilityFilters(new URLSearchParams(`websiteId=site${suffix}`)));
 assert.equal(visibilityFilters(new URLSearchParams("websiteId=site")).limit,50);
});

test("unknown target identity cannot become zero share of voice",()=>{
 const report=visibilityReport([run("10","a",[{name:"Other",url:"https://competitor.com/"},{name:"Unknown",url:null}])]);
 assert.equal(report.current.visibilityScore,null);assert.equal(report.current.shareOfVoice,null);
});

test("reviewed product identities split shared hosts, deduplicate aliases and preserve unknown names",()=>{
 const report=visibilityReport([run("10","a",[{name:"Cline",url:"https://github.com/cline/cline"},{name:"Cline",url:"https://cline.bot/"},{name:"Goose",url:"https://github.com/block/goose"},{name:"Unknown",url:"https://github.com/other/repo"}])]);
 assert.equal(report.productComparison.products.length,2);assert.equal(report.productComparison.denominator,2);assert.equal(report.productComparison.unknownMentions,1);assert.deepEqual(report.productComparison.products.map(p=>p.shareOfVoice),[50,50]);assert.equal(report.citationHostComparison.hosts.find(h=>h.domain==="github.com")?.answers,1);
 const mapped=visibilityReport([run("10","a",[{name:"Graff",url:"https://github.com/fixture/codegraff"}])],[{id:"graff",name:"Codegraff",aliases:["graff","codegraff"],urls:["https://github.com/fixture/codegraff"]}]);
 assert.equal(mapped.productComparison.products[0].id,"graff");
});
