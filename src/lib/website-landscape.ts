import type { PublicSearchObservation } from './public-search-rankings';
import { DEVELOPER_TOOLS } from './developer-tools-source';
const host=(url:string)=>new URL(url).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
const identities=new Map(DEVELOPER_TOOLS.flatMap(site=>[site.websiteUrl,site.docsUrl].map(url=>[host(url),{domain:host(site.websiteUrl),name:site.name,url:site.websiteUrl}] as const)));
// Additional reviewed aliases beyond the catalog's explicit URLs.
for(const [alias,canonical] of Object.entries({'workers.cloudflare.com':'cloudflare.com','support.taskrabbit.com':'taskrabbit.com'})){const site=identities.get(canonical);if(site)identities.set(alias,site);}
/** One latest answer per model for an exact question. Missing answers are not absences. */
export function websiteLandscape(observations: PublicSearchObservation[], queryId: string, model = '') {
 const latest = new Map<string, PublicSearchObservation>();
 for (const o of observations) if(o.queryId===queryId && (!model || o.model===model)) {
  const old=latest.get(o.model); if(!old || Date.parse(o.observedAt)>Date.parse(old.observedAt)) latest.set(o.model,o);
 }
 const sites=new Map<string,{domain:string;name:string;url:string;positions:number[]}>();
 for(const o of latest.values()) {
  const seen=new Set<string>();
  for(const r of [...o.recommendations].sort((a,b)=>a.position-b.position)) {
   if(!r.url)continue;
   let domain:string;try{const u=new URL(r.url);if(!['https:','http:'].includes(u.protocol))continue;domain=u.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');}catch{continue;}
   // Only explicit catalog aliases; no suffix-based merging of shared hosting domains.
   const identity=identities.get(domain);domain=identity?.domain??domain;
   if(seen.has(domain))continue;seen.add(domain);
   const site=sites.get(domain)??{domain,name:identity?.name??domain,url:identity?.url??`https://${domain}`,positions:[]};site.positions.push(r.position);sites.set(domain,site);
  }
 }
 return {answers:latest.size,rows:[...sites.values()].map(s=>({...s,appearances:s.positions.length,share:s.positions.length/latest.size*100,position:s.positions.reduce((a,b)=>a+b,0)/s.positions.length})).sort((a,b)=>b.share-a.share||a.position-b.position||a.domain.localeCompare(b.domain))};
}

export function websiteOverview(observations: PublicSearchObservation[], queryIds: string[], models: string[]) {
 const querySet=new Set(queryIds), modelSet=new Set(models);
 const latest=new Map<string,PublicSearchObservation>();
 for(const observation of observations) {
  if(!querySet.has(observation.queryId)||!modelSet.has(observation.model))continue;
  const key=`${observation.queryId}/${observation.model}`, previous=latest.get(key);
  if(!previous||Date.parse(observation.observedAt)>Date.parse(previous.observedAt))latest.set(key,observation);
 }
 const answers=[...latest.values()];
 const coverage=models.map(model=>({model,answers:answers.filter(a=>a.model===model).length,planned:queryIds.length}));
 const measured=coverage.filter(c=>c.answers>0);
 type Site={domain:string;name:string;url:string;byModel:Map<string,number[]>;queryByModel:Map<string,string>;queries:Set<string>;firstQuery:string};
 const sites=new Map<string,Site>();
 for(const answer of answers) {
  for(const row of websiteLandscape([answer],answer.queryId,answer.model).rows) {
   const site=sites.get(row.domain)??{domain:row.domain,name:row.name,url:row.url,byModel:new Map(),queryByModel:new Map(),queries:new Set(),firstQuery:answer.queryId};
   site.byModel.set(answer.model,[...(site.byModel.get(answer.model)??[]),row.position]);site.queryByModel.set(answer.model,answer.queryId);site.queries.add(answer.queryId);sites.set(row.domain,site);
  }
 }
 const rows=[...sites.values()].map(site=>{
  const perModel=coverage.map(c=>{const positions=site.byModel.get(c.model)??[];return {model:c.model,queryId:site.queryByModel.get(c.model)??null,answers:c.answers,appearances:positions.length,share:c.answers?positions.length/c.answers*100:null,position:positions.length?positions.reduce((a,b)=>a+b,0)/positions.length:null}});
  const positions=perModel.filter(m=>m.position!==null);
  return {domain:site.domain,name:site.name,url:site.url,firstQuery:site.firstQuery,questionCount:site.queries.size,appearances:perModel.reduce((n,m)=>n+m.appearances,0),modelCount:positions.length,perModel,
   share:measured.length?perModel.reduce((n,m)=>n+(m.share??0),0)/measured.length:0,
   position:positions.reduce((n,m)=>n+m.position!,0)/positions.length};
 }).sort((a,b)=>b.share-a.share||a.position-b.position||a.domain.localeCompare(b.domain));
 const dates=answers.map(a=>a.observedAt.slice(0,10)).sort();
 return {rows,coverage,answers:answers.length,firstDate:dates[0]??null,lastDate:dates.at(-1)??null,questionCount:queryIds.length,measuredModels:measured.length,complete:coverage.every(c=>c.answers===queryIds.length)&&queryIds.length>0};
}
