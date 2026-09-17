"use client";
import { useEffect, useRef, useState } from "react";
import type { SavedSemanticReview } from "@/lib/typesafe-review-store";
import type { EvaluationRun } from "@/lib/evals";
import { evaluationRequest } from "./evaluation-workspace";
export function SemanticReview({run}:{run:EvaluationRun}) {
 const [review,setReview]=useState<SavedSemanticReview|null>(null);
 const [available,setAvailable]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const alive=useRef(false); const controller=useRef<AbortController|null>(null);
 const endpoint=`/api/evaluations/${encodeURIComponent(run.id)}/semantic-review`;
 useEffect(()=>{
  alive.current=true;const abort=new AbortController();
  evaluationRequest<{review:SavedSemanticReview|null;available:boolean}>(endpoint,{signal:abort.signal})
   .then(data=>{if(!abort.signal.aborted){setReview(data.review);setAvailable(data.available);setLoaded(true);}})
   .catch(()=>{if(!abort.signal.aborted){setError("Semantic review availability could not be loaded.");setLoaded(true);}});
  return ()=>{alive.current=false;abort.abort();controller.current?.abort();};
 },[endpoint]);
 async function act(start:boolean) {
  if(busy)return;setBusy(true);setError("");const abort=new AbortController();controller.current=abort;
  try {
   const data=await evaluationRequest<{review:SavedSemanticReview|null}>(endpoint,start?{method:"POST",headers:{"Content-Type":"application/json"},signal:abort.signal,body:JSON.stringify({revision:run.revision,confirmPaidReview:true})}:{signal:abort.signal});
   if(alive.current&&!abort.signal.aborted)setReview(data.review);
  }catch{if(alive.current&&!abort.signal.aborted)setError("The review could not be confirmed. Refresh the saved review before trying again; the request may have incurred usage.");}
  finally{if(alive.current&&!abort.signal.aborted)setBusy(false);}
 }
 return <section className="eval-semantic-review" aria-label="Semantic citation review">
  <h3>Does the source support the claim?</h3>
  <p>TypeSafe can review product-name and pricing claims against the saved page. This advisory review does not change the verification score or establish factual truth.</p>
  {error&&<p role="alert">{error}</p>}
  {!loaded?<p role="status">Checking saved review…</p>:review?<>
   <p role="status">{review.status==="completed"?`Review saved · ${review.model}`:review.status==="pending"?"Request reserved. Its outcome is not yet confirmed.":"The provider outcome could not be confirmed. This attempt will not be retried automatically."}</p>
   {review.result&&<ul>{review.result.results.map((r,index)=><li key={r.id}><strong>{r.field === "pricing" ? "Pricing" : r.field === "productName" ? "Product name" : `Citation ${index+1}`}: {r.relation==="supports"?"Source supports the claim":r.relation==="contradicts"?"Source contradicts the claim":"Insufficient support"}</strong> · model confidence {Math.round(r.confidence*100)}% · review against <span>the Source evidence tab</span><p>{r.claim}</p><blockquote>{r.quote}</blockquote></li>)}</ul>}
   <p>{review.input_tokens===null?"Token usage unknown":`${review.input_tokens.toLocaleString()} input tokens · ${review.output_tokens?.toLocaleString()} output tokens`} · Dollar cost unknown{review.latency_ms!==null?` · ${(review.latency_ms/1000).toFixed(2)} seconds`:""}</p>
  </>:available?<><p>Starting sends the saved page and cited claims to TypeSafe and may incur provider charges. Reference answers remain private. One review per evaluation, up to five per account per day.</p><button className="button secondary" type="button" disabled={busy} onClick={()=>void act(true)}>{busy?"Reviewing…":"Run paid semantic review"}</button></>:<p>Semantic review is not enabled for this account.</p>}
  {loaded&&<button className="button secondary" type="button" disabled={busy} onClick={()=>void act(false)}>Refresh saved review</button>}
 </section>;
}
