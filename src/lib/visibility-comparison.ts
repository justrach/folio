import type { KeywordBenchmarkRun } from "./keyword-benchmark-types";
import { keywordRecommendationMetrics } from "./keyword-search-mode";

/** Match the complete question and execution identity, never just the displayed date. */
export function compareVisibility(baseline:KeywordBenchmarkRun[],comparison:KeywordBenchmarkRun[],publicationAt?:string) {
  const key=(r:KeywordBenchmarkRun)=>JSON.stringify([r.caseId,r.case.query,r.case.targetUrl,r.case.language,r.case.locale,r.case.rubricVersion,r.case.searchMode??"reviewed-domains",r.model,r.harnessVersion,r.environmentType,r.environmentFingerprint,r.surface,[...new Set(r.allowedDomains ?? [])].sort(),r.case.referenceFacts??[]]);
  const latest=(runs:KeywordBenchmarkRun[])=>{const map=new Map<string,KeywordBenchmarkRun>();for(const r of [...runs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)))if(r.status==="completed"&&r.answer&&!map.has(key(r)))map.set(key(r),r);return map;};
  const before=latest(baseline),after=latest(comparison),pairs=[];
  for(const [identity,a] of before){const b=after.get(identity);if(!b)continue;
    pairs.push({caseId:a.caseId,query:a.case.query,baseline:{runId:a.id,observedAt:a.createdAt,...keywordRecommendationMetrics(a)},comparison:{runId:b.id,observedAt:b.createdAt,...keywordRecommendationMetrics(b)},
      provenance:{model:a.model,harnessVersion:a.harnessVersion,environmentFingerprint:a.environmentFingerprint,searchMode:a.case.searchMode??"reviewed-domains",language:a.case.language,locale:a.case.locale},
      afterPublication:publicationAt?Date.parse(b.createdAt)>=Date.parse(publicationAt):null});}
  return {state:pairs.length?"matched":"unmeasured",pairs,sampleSize:pairs.length,
    unmatchedBaseline:[...before].filter(([k])=>!after.has(k)).map(([,r])=>({runId:r.id,caseId:r.caseId,reason:"No compatible completed comparison observation"})),
    unmatchedComparison:[...after].filter(([k])=>!before.has(k)).map(([,r])=>({runId:r.id,caseId:r.caseId,reason:"No compatible completed baseline observation"})),
    incompleteRuns:[...baseline,...comparison].filter(r=>r.status!=="completed"||!r.answer).map(r=>({runId:r.id,status:r.status})),
    publication:publicationAt?{at:publicationAt,provenance:"caller-supplied; not independently verified"}:null,
    caveat:"Matched saved observations describe changes in recorded answers, not SEO causality. Missing evidence is unmeasured. Each side uses its latest compatible completed answer."};
}
