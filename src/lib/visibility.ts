import type { KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { keywordRecommendationMetrics, keywordPublicUrl } from "./keyword-search-mode";
export type VisibilityRun = Pick<KeywordBenchmarkRun,"id"|"caseId"|"suiteId"|"case"|"status"|"model"|"harnessVersion"|"createdAt"|"answer">;
const host = (url: string) => keywordPublicUrl(url,false)?.hostname.replace(/\.$/,"").replace(/^www\./,"") ?? null;
export function visibilityReport(runs: VisibilityRun[]) {
  const ordered = [...runs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  const latest = new Map<string,VisibilityRun>();
  for(const run of ordered) if(run.status==="completed"&&run.answer&&!latest.has(run.caseId)) latest.set(run.caseId,run);
  const prompts = [...latest.values()].map(run=>({caseId:run.caseId,suiteId:run.suiteId,query:run.case.query,runId:run.id,observedAt:run.createdAt,model:run.model,harnessVersion:run.harnessVersion,language:run.case.language,locale:run.case.locale,...keywordRecommendationMetrics(run)}));
  const known = prompts.filter(p=>p.targetNamed!=="unknown"), appeared=known.filter(p=>p.targetNamed==="yes");
  const positions=appeared.map(p=>p.targetPositions[0]);
  const domains=new Map<string,{domain:string;answers:number;positions:number[]}>();
  for(const p of prompts){const seen=new Set<string>();for(const r of p.recommendations) if(r.domain&&!seen.has(r.domain)){seen.add(r.domain);const item=domains.get(r.domain)??{domain:r.domain,answers:0,positions:[]};item.answers++;item.positions.push(r.position);domains.set(r.domain,item);}}
  const totalMentions=[...domains.values()].reduce((sum,d)=>sum+d.answers,0);
  const competitors=[...domains.values()].sort((a,b)=>b.answers-a.answers||a.domain.localeCompare(b.domain)).map(d=>({domain:d.domain,answers:d.answers,shareOfVoice:totalMentions?100*d.answers/totalMentions:null,averagePosition:d.positions.reduce((a,b)=>a+b,0)/d.positions.length,isTarget:prompts.some(p=>p.targetDomain===d.domain)}));
  const citations=new Map<string,{url:string;title:string;sourceType:"owned"|"external";answers:number;runIds:string[]}>();
  for(const run of latest.values()){const seen=new Set<string>();for(const c of run.answer!.citations){if(!host(c.url)||seen.has(c.url))continue;seen.add(c.url);const item=citations.get(c.url)??{url:c.url,title:c.title??c.url,sourceType:host(c.url)===host(run.case.targetUrl??"")?"owned":"external",answers:0,runIds:[]};item.answers++;item.runIds.push(run.id);citations.set(c.url,item);}}
  const recommendations=prompts.flatMap(p=>p.targetNamed==="no"?[{id:`coverage-${p.caseId}`,title:"Address this question on your website",action:`Review the cited competitor pages for “${p.query}”. Add or improve a page explaining your relevant capabilities with concrete examples and links to documentation.`,basis:"Your website was not listed in this saved answer.",caseId:p.caseId,runId:p.runId,sourceUrls:p.recommendations.flatMap(r=>r.citationUrls).slice(0,5)}]:p.targetNamed==="yes"&&p.targetCited===false?[{id:`citation-${p.caseId}`,title:"Make the supporting documentation easier to find",action:`For “${p.query}”, link directly to a public page supporting your product’s relevant capabilities. Check that its claims are specific and verifiable.`,basis:"Your website was listed but no source on its domain was cited.",caseId:p.caseId,runId:p.runId,sourceUrls:[] as string[]}]:[]);
  return {current:{completedQuestions:prompts.length,identifiedQuestions:known.length,unknownQuestions:prompts.length-known.length,mentionedQuestions:appeared.length,visibilityScore:known.length?100*appeared.length/known.length:null,shareOfVoice:known.length&&totalMentions?(competitors.find(c=>c.isTarget)?.shareOfVoice??0):null,averagePosition:positions.length?positions.reduce((a,b)=>a+b,0)/positions.length:null},prompts,competitors,citations:[...citations.values()].sort((a,b)=>b.answers-a.answers||a.url.localeCompare(b.url)),recommendations};
}
