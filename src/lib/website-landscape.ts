import type { PublicSearchObservation } from './public-search-rankings';
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
   // Reviewed aliases for product documentation hosts; never collapse shared hosting domains.
   domain=({'docs.railway.com':'railway.com','developers.cloudflare.com':'workers.cloudflare.com'} as Record<string,string>)[domain]??domain;
   if(seen.has(domain))continue;seen.add(domain);
   const site=sites.get(domain)??{domain,name:r.name,url:r.url,positions:[]};site.positions.push(r.position);sites.set(domain,site);
  }
 }
 return {answers:latest.size,rows:[...sites.values()].map(s=>({...s,appearances:s.positions.length,share:s.positions.length/latest.size*100,position:s.positions.reduce((a,b)=>a+b,0)/s.positions.length})).sort((a,b)=>b.share-a.share||a.position-b.position||a.domain.localeCompare(b.domain))};
}
