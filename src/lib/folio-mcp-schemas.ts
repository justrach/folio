import { z } from "zod";

// Strict application projections: unknown evidence remains null, and omitted legacy
// fields remain optional. Provider usage is JSON metadata, not a Folio metric.
const s = z.string(), n = z.number(), b = z.boolean(), nil = z.null();
const sn = s.nullable(), nn = n.nullable(), strings = z.array(s);
const obj = z.strictObject;
const scope = z.enum(["read", "evaluate", "seo", "changes"]);
const mode = z.enum(["open-web", "reviewed-domains"]);
const status = z.enum(["queued", "running", "requires_action", "completed", "failed", "cancelled"]);
export const folioErrorSchema = obj({code:s,message:s,retryDisposition:z.enum(["inspect_saved_state_reuse_same_request_key","wait_then_reuse_same_request_key","correct_request_before_retry"]),requiredScope:scope.nullable()});
const page = {nextCursor:sn,truncated:b,ordering:s};
const site = obj({id:s,url:s,name:s});
const citation = obj({field:z.enum(["productName","pricing","finding"]),evidenceId:s,quote:s});
const finding = obj({dimension:s,status:z.enum(["supported","unmeasured"]),evidenceIds:strings,explanation:s,recommendation:s});
const verified = obj({summary:s,checks:z.array(obj({id:s,label:s,status:z.enum(["pass","fail","unmeasured"]),expected:s,actual:s,detail:s,evidenceIds:strings})),passed:n,failed:n,unmeasured:n,measured:n,verificationScore:nn,findings:z.array(finding),citations:z.array(citation),limitations:strings});
const answer = obj({text:s,mentions:z.array(obj({name:s,url:sn,reason:s.optional(),citationUrls:strings.optional()})),citations:z.array(obj({url:s,title:s.optional(),quote:s.optional()})),evidence:z.array(obj({id:s,outcome:z.enum(["passed","failed","unmeasured"]),detail:s})).optional(),limitations:strings.optional()});
const usage = obj({inputTokens:nn,outputTokens:nn,totalTokens:nn,costUsd:nn});
const runCommon = {id:s,status,model:sn,surface:z.literal("openai-managed-agents"),createdAt:s,updatedAt:s,observedAt:sn,error:sn,pollUrl:s,recovery:obj({runId:s,sessionId:s}).nullable(),provenance:obj({searchMode:mode.nullable(),harnessVersion:s,environmentFingerprint:sn,environmentType:sn.optional(),allowedDomains:strings,completedSearchCount:nn})};
const run = z.discriminatedUnion("kind",[
  obj({...runCommon,kind:z.literal("website"),result:verified.nullable(),usage:z.record(s,z.json()).nullable()}),
  obj({...runCommon,kind:z.literal("keyword"),result:answer.nullable(),usage}),
]);
const observation = obj({disposition:z.enum(["saved","fresh_saved","existing_active","started","missing"]),freshness:obj({maxAgeSeconds:n,observedAt:sn,ageSeconds:nn,fresh:b}),run:run.nullable()});
const savedObservation = observation.extend({selectionMeaning:s,latestCompletedRun:run.nullable(),compatibleRun:run.nullable(),latestAttempt:run.nullable(),currentAttempt:run.nullable(),historyState:z.enum(["incompatible_history","fresh","stale","incomplete_attempt","terminal_attempt","no_history"]),compatibility:obj({latestCompletedMatchesCurrent:b.nullable(),mismatchReasons:strings})});
const target = z.discriminatedUnion("kind",[obj({kind:z.literal("website"),websiteId:s}),obj({kind:z.literal("keyword"),caseId:s})]);
const providerError = obj({code:z.enum(["API_ERROR","HTTP_ERROR","NETWORK_ERROR","TIMEOUT","INVALID_RESPONSE"]),message:s,providerStatusCode:n.optional(),httpStatus:n.optional(),retryAutomatically:z.literal(false)});
const providerObservation = (data:z.ZodType) => obj({status:z.enum(["success","empty","error"]),data:data.nullable(),error:providerError.nullable(),costUsd:nn,taskId:sn,providerVersion:sn,endpoint:s,fetchedAt:s});
const organic = obj({domain:s,searchEngine:z.literal("Google"),locationCode:n,locationName:z.literal("United States"),languageCode:s,organicKeywords:nn,estimatedMonthlyTraffic:nn,estimatedTrafficValueUsd:nn,positions:z.array(obj({label:s,count:nn})),movement:obj({new:nn,up:nn,down:nn,lost:nn}),dataUpdatedAt:nil,note:s});
const backlinks = obj({domain:s,backlinks:nn,referringDomains:nn,referringMainDomains:nn,referringPages:nn,brokenBacklinks:nn,brokenPages:nn,crawledPages:nn,authorityRank:nn,authorityRankScale:z.literal(100),backlinksSpamScore:nn,firstSeenAt:sn,includeSubdomains:z.literal(true),statusType:z.literal("live"),note:s});
const seoResult = obj({id:s,domain:s,provider:z.literal("DataForSEO"),fetchedAt:s,organic:providerObservation(organic),backlinks:providerObservation(backlinks),status:z.enum(["error","partial","complete"]),totalCostUsd:nn,knownCostUsd:n,costIsComplete:b,notes:strings});
const report = obj({id:s,domain:s,createdAt:s,retrievedAt:sn,publication:z.literal("private"),state:z.enum(["pending","complete"]),result:seoResult.nullable(),detail:z.unknown().nullable().optional(),detailRetrievedAt:sn.optional()});
const seoScope = obj({location:sn,language:sn,includeSubdomains:b.nullable()});
const seoDetailRows = {
  keywords:z.array(obj({keyword:s,position:nn,landingPage:sn,searchVolume:nn,estimatedTraffic:nn})).nullable(),
  landingPages:z.array(obj({url:s,keywords:n,estimatedTraffic:nn})).nullable(),
  backlinkRows:z.array(obj({sourceUrl:s,sourceDomain:sn,targetUrl:sn,dofollow:b.nullable(),authorityRank:nn,spamScore:nn,firstSeenAt:sn})).nullable(),
};
const seoLookup = z.union([obj({report,replayed:b,saved:b}),obj({report:obj({id:s,domain:s,result:seoResult}),replayed:z.literal(false),saved:z.literal(false),storageWarning:s})]);
const recommendation = obj({position:n,name:s,url:sn,domain:sn,matchesTarget:b.nullable(),citationUrls:strings});
const metrics = {targetDomain:sn,targetNamed:z.enum(["yes","no","unknown"]),targetCited:b.nullable(),targetPositions:z.array(n),recommendations:z.array(recommendation),citationCount:n};
const current = {completedQuestions:n,identifiedQuestions:n,unknownQuestions:n,mentionedQuestions:n,visibilityScore:nn,shareOfVoice:nn,averagePosition:nn};
const competitor = obj({domain:s,answers:n,shareOfVoice:nn,averagePosition:n,isTarget:b});
const visibility = obj({website:site,platform:z.literal("openai"),surface:z.literal("openai-managed-agents"),searchMode:z.literal("open-web"),dateRange:obj({startDate:sn,endDate:sn,timeZone:z.literal("UTC")}),coverage:obj({attemptsLoaded:n,limit:n,truncated:b,nextCursor:sn,unresolvedAttempts:n}),methodology:s,current:obj(current),prompts:z.array(obj({caseId:s,suiteId:s,query:s,runId:s,observedAt:s,model:s,harnessVersion:s,language:s,locale:s,...metrics})),competitors:z.array(competitor),citationHostComparison:obj({denominator:n,unknownMentions:n,method:s,hosts:z.array(competitor)}),productComparison:obj({denominator:n,unknownMentions:n,method:s,products:z.array(obj({id:s,name:s,answers:n,positions:z.array(n),observations:z.array(obj({name:s,url:sn,matchingMethod:s})),shareOfVoice:nn}))}),citations:z.array(obj({url:s,title:s,sourceType:z.enum(["owned","external"]),answers:n,runIds:strings})),recommendations:z.array(obj({id:s,title:s,pageEvidence:obj({tool:z.literal("folio_page_evidence"),state:z.literal("not_assessed")}).optional(),action:s,basis:s,caseId:s,runId:s,sourceUrls:strings})),daily:z.array(obj({date:s,...current})),platforms:z.array(obj({platform:z.literal("openai"),models:strings,...current}))});
const windowMetrics = obj({runId:s,observedAt:s,...metrics});
const unmatched = z.array(obj({runId:s,caseId:s,reason:s}));
const coverage = obj({nextCursor:sn,truncated:b});
const comparison = obj({state:z.enum(["matched","unmeasured"]),pairs:z.array(obj({caseId:s,query:s,baseline:windowMetrics,comparison:windowMetrics,provenance:obj({model:s,harnessVersion:s,environmentFingerprint:s,searchMode:mode,language:s,locale:s}),afterPublication:b.nullable()})),sampleSize:n,unmatchedBaseline:unmatched,unmatchedComparison:unmatched,incompleteRuns:z.array(obj({runId:s,status})),publication:obj({at:s,provenance:s}).nullable(),caveat:s,coverage:obj({baseline:coverage,comparison:coverage,scope:s})});
const publicObservation = obj({id:s,queryId:s,observedAt:s,status:z.literal("completed"),model:s,surface:z.literal("openai-managed-agents"),searchMode:z.literal("open-web"),harnessVersion:s,environmentType:s,recommendations:z.array(obj({position:n,name:s,url:sn,reason:s.optional(),citationUrls:strings})),citations:z.array(obj({url:s,title:sn.optional()})),limitations:strings});
const index = obj({format:z.literal("folio-public-dashboard-v1"),updatedAt:s,summary:obj({queryCount:n,publishedQueryCount:n,publishedObservationCount:n,completedUnpublishedQueryCount:n,collection:obj({notStarted:n,queued:n,running:n,completed:n,failed:n,cancelled:n,unresolved:n}),uniqueRecommendedWebsiteCount:n,uniqueCitedSourceCount:n}),queries:z.array(obj({id:s,audience:s,category:s,query:s,language:s,locale:s,collection:obj({status:z.enum(["not-started","queued","running","completed","failed","cancelled","unresolved"]),startedAt:sn,finishedAt:sn}),resultStatus:z.enum(["published","awaiting-publication","not-published"]),latestObservation:publicObservation.nullable(),observationCount:n})),observations:z.array(publicObservation),htmlCoverage:obj({catalogWebsiteCount:n,measuredHomepageCount:n,unavailableHomepageCount:n,notMeasuredHomepageCount:n,generatedAt:s,suiteVersion:s,scope:s}).nullable().optional()});

const changeAnswer = obj({runId:s,observedAt:s,targetNamed:z.enum(["yes","no","unknown"]),targetCited:b.nullable(),position:nn});
const change = obj({id:s,website:site,title:s,summary:s,status:z.enum(["proposed","published","withdrawn"]),recordedBy:obj({keyId:sn,keyName:sn}),files:strings,referenceUrl:sn,createdAt:s,updatedAt:s,
  publication:obj({at:s,reportedBy:z.enum(["agent","owner"]),provenance:s}).nullable(),
  questions:z.array(obj({caseId:s,query:s,state:z.enum(["awaiting_publication","withdrawn","baseline_unmeasured","baseline_after_publication","awaiting_retest","retest_incomplete","incompatible_retest","retested"]),baseline:changeAnswer.nullable(),retest:changeAnswer.nullable(),
    movement:z.enum(["newly_named","no_longer_named","newly_cited","no_longer_cited","moved_up","moved_down","unchanged","unknown"]).nullable(),reasons:strings})),
  outcome:obj({targeted:n,retested:n,improved:n,declined:n,unchanged:n,unknown:n,awaitingRetest:n,unmeasured:n}),nextStep:s,caveat:s});

const indexSource = z.enum(["live-published-data","bundled-snapshot"]);
const indexStatus = z.enum(["published","awaiting-publication","not-published"]);
const indexRow = obj({queryId:s,query:s,audience:s,category:s,resultStatus:indexStatus,observedAt:sn,model:sn,recommendations:z.array(obj({position:n,name:s,domain:sn})),recommendationCount:n,page:s,matchedTerms:n});
const indexPage = {nextCursor:sn,truncated:b,total:n};
const crawlSite = obj({available:b,reason:sn,domain:s,state:z.enum(["in_index","not_in_index","unknown"]),pagesCrawled:nn,lastFetchedAt:sn,
  profile:obj({name:sn,profiledDomain:s,category:sn,description:sn,inventoryPages:nn,sampledPages:nn,sections:nn,rankedKeywords:nn,profiledAt:sn}).nullable(),
  topSections:z.array(obj({path:s,pages:n,share:nn})),note:s});

export const folioSuccessSchemas: Record<string,z.ZodType> = {
  folio_index_overview:obj({source:indexSource,updatedAt:s,questions:n,publishedQuestions:n,publishedAnswers:n,recommendedWebsites:n,citedSources:n,categories:z.array(obj({audience:s,category:s,questions:n,published:n})),howToAsk:s,caveat:s,crawl:obj({available:b,pages:nn,domains:nn,updatedAt:sn})}),
  folio_index_pages:obj({available:b,reason:sn,terms:strings,mode:z.enum(["semantic","all_terms","any_term"]),semantic:z.enum(["used","no_results","unavailable","not_configured"]),domain:sn,candidates:n,candidatesCapped:b,
    items:z.array(obj({pageId:s,url:s,title:sn,domain:sn,section:sn,excerpt:s,fetchedAt:sn,matchedTerms:n,score:nn})),matching:s,caveat:s,recorded:b}),
  folio_index_search:obj({source:indexSource,terms:strings,items:z.array(indexRow),...indexPage,matching:s,caveat:s,recorded:b}),
  folio_index_answer:obj({source:indexSource,question:obj({id:s,query:s,audience:s,category:s,language:s,locale:s}),resultStatus:indexStatus,collectionStatus:z.enum(["not-started","queued","running","completed","failed","cancelled","unresolved"]),
    answer:obj({observationId:s,observedAt:s,model:s,searchMode:s,harnessVersion:s,recommendations:z.array(obj({position:n,name:s,url:sn,domain:sn,reason:sn,citationUrls:strings})),citations:z.array(obj({url:s,title:sn})),limitations:strings}).nullable(),
    otherObservations:z.array(obj({observationId:s,observedAt:s,model:s})),observationCount:n,page:s,note:s,caveat:s,recorded:b}),
  folio_index_website:obj({source:indexSource,domain:s,state:z.enum(["named","cited_only","not_in_published_answers"]),publishedQuestions:n,namedIn:n,citedIn:n,averagePosition:nn,bestPosition:nn,
    categories:z.array(obj({category:s,answers:n})),alsoNamed:z.array(obj({domain:s,answers:n})),
    answers:obj({items:z.array(obj({queryId:s,query:s,category:s,position:nn,cited:b,observedAt:s,model:s,page:s})),...indexPage}),
    htmlReadiness:obj({name:s,page:s,status:s,score:nn,capturedAt:s,suiteVersion:s,scope:s}).nullable(),matching:s,caveat:s,crawl:crawlSite.nullable(),recorded:b}),
  folio_changes:obj({...page,items:z.array(change)}),folio_change_record:obj({change,replayed:b}),folio_change_update:obj({change}),
  folio_keyword_research:obj({id:s,domain:s,status:z.enum(["pending","complete","needs_attention"]),createdAt:s,publication:z.literal("private"),replayed:b,result:providerObservation(obj({seed:s,searchEngine:z.literal("Google"),locationCode:n,languageCode:s,note:s,keywords:z.array(obj({keyword:s,searchVolume:nn,cpcUsd:nn,advertisingCompetition:nn,updatedAt:sn,monthlySearches:z.array(obj({year:n,month:n,searchVolume:nn}))}))})).nullable()}),
  folio_index:index,
  folio_targets:z.discriminatedUnion("kind",[obj({...page,kind:z.literal("website"),items:z.array(site.extend({created_at:n}))}),obj({...page,kind:z.literal("keyword"),items:z.array(obj({id:s,suiteId:s,createdAt:s,query:s,targetUrl:sn,language:s,locale:s,searchMode:mode}))})]),
  folio_run:observation,folio_evaluate:observation,folio_reconcile:observation,folio_observation:savedObservation,
  folio_run_history:obj({...page,items:z.array(run.nullable()),changePolling:sn}),
  folio_observations:obj({items:z.array(z.union([obj({target,result:savedObservation}),obj({target,error:folioErrorSchema})]))}),
  folio_capabilities:obj({version:s,supportedFeatures:strings,prompts:strings,allowedScopes:z.array(scope),tools:z.array(obj({name:s,requiredScope:scope,allowed:b,paid:b,requirements:strings,conditionalScopes:z.array(obj({when:s,requiredScope:scope,allowed:b}))})),observationTargets:obj({website:obj({kind:z.literal("website"),websiteId:s}),keyword:obj({kind:z.literal("keyword"),caseId:s})})}),
  folio_seo_lookup:seoLookup,folio_sandbox_seo:seoLookup,
  folio_seo_reports:z.union([
    obj({...page,items:z.array(obj({id:s,domain:s,createdAt:s,retrievedAt:sn,detailState:z.enum(["collected","not_collected"]).optional()}))}),
    obj({report,detail:obj({state:z.literal("not_collected"),...seoDetailRows,reason:s,sourceUpdatedAt:nil,retrievedAt:sn,detailRetrievedAt:nil,scope:seoScope,estimates:z.literal(true)})}),
    obj({report,detail:obj({state:z.enum(["collected","error"]),...seoDetailRows,reason:s,sections:obj({keywords:z.enum(["collected","error"]),backlinks:z.enum(["collected","error"])}),sourceUpdatedAt:sn,retrievedAt:sn,detailRetrievedAt:sn,detailCostUsd:nn,costIsComplete:b,rowLimit:nn,scope:seoScope,estimates:z.literal(true)})}),
  ]),
  folio_visibility:visibility,folio_visibility_compare:comparison,
  folio_page_evidence:obj({...page,state:z.enum(["saved_history","not_collected"]),recommendationRule:s,items:z.array(z.union([
    obj({runId:s,state:z.enum(["fetch_failed","not_collected"]),url:s}),
    obj({runId:s,captureId:s,url:s,capturedAt:s,sha256:s,hashEncoding:z.literal("utf8-text-v1"),transport:z.enum(["http","fixture"]).nullable(),state:z.enum(["stale_snapshot","observed"]),excerpt:s,contentTruncated:b,httpStatus:nil,finalUrl:nil,canonical:nil,indexability:nil,headings:nil,derivedHtml:obj({basis:s,checks:z.array(obj({id:s,evidence:s.optional()}))}).nullable(),unavailableReason:s}),
  ]))}),
};
/** The same schema validates callbacks and is published through tools/list. */
export function folioOutputSchema(name:string) {
  const result=folioSuccessSchemas[name];
  if(!result) throw new Error(`Missing MCP output schema: ${name}`);
  return z.union([obj({result}),obj({error:folioErrorSchema})]);
}
