"use client";
import { useEffect, useRef, useState } from "react";
import type { PublicSearchRankings } from "@/lib/public-search-rankings";
import { assertPublicSearchRankings } from "@/lib/public-search-rankings-validation";
type Publication = {published:boolean;revision:number;payload:PublicSearchRankings|null};
type Preview = {payload:PublicSearchRankings;reviewHash:string;revision:number};
export function KeywordPublication({runId}:{runId:string}) {
  const [open,setOpen]=useState(false),[state,setState]=useState<Publication|null>(null),[preview,setPreview]=useState<Preview|null>(null);
  const [audience,setAudience]=useState("Software & work"),[category,setCategory]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>controller.current?.abort(),[runId]);
  async function request(body?:Record<string,unknown>) {
    controller.current?.abort(); const abort=new AbortController();controller.current=abort;setBusy(true);setError("");
    try {
      const response=await fetch(`/api/benchmarks/runs/${encodeURIComponent(runId)}/publication`,{method:body?"POST":"GET",cache:"no-store",signal:abort.signal,
        ...(body?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
      const result=await response.json();if(!response.ok)throw Error(typeof result.error==="string"?result.error:"Publication is unavailable.");
      if(result.payload)assertPublicSearchRankings(result.payload);
      if(abort.signal.aborted)return;
      if(body?.action==="preview")setPreview(result);else{setState(result);setPreview(null);}
    }catch(e){if(!abort.signal.aborted){setPreview(null);setError(e instanceof Error?e.message:"Publication is unavailable.");}}
    finally{if(!abort.signal.aborted)setBusy(false);}
  }
  return <section className="benchmark-disclosure" aria-label="Public index sharing">
    <button type="button" className="button secondary" aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void request();}}>Share this result with the public index</button>
    {open&&<div>
      <p>Publish only after reviewing the exact fields below. Your question and returned websites will be visible to everyone. Raw answer text, reference facts, account details and provider records stay private.</p>
      {error&&<p role="alert">{error}</p>}
      {busy&&<p role="status">Loading publication…</p>}
      {state?.published ? <><p role="status">This result is published.</p><a href={`/overview?query=${encodeURIComponent(state.payload!.queries[0].id)}&model=${encodeURIComponent(state.payload!.observations[0].model)}`}>View in the public index</a><p>Withdrawal removes this shared copy from Folio. It cannot erase copies someone has already downloaded.</p><button type="button" className="button secondary" disabled={busy} onClick={()=>void request({action:"withdraw",revision:state.revision})}>Withdraw from public index</button></> : <>
        <p>Choose a category for a new question. An exact catalog match keeps its existing category.</p>
        <label>Audience <select value={audience} disabled={busy} onChange={e=>{setAudience(e.target.value);setPreview(null);}}>{["Developer tools","Software & work","Shops & brands","Services & travel","Learning"].map(value=><option key={value}>{value}</option>)}</select></label>{" "}
        <label>Category <input value={category} maxLength={100} disabled={busy} onChange={e=>{setCategory(e.target.value);setPreview(null);}} placeholder="For example, team scheduling"/></label>
        <button type="button" className="button secondary" disabled={busy||!state||!category.trim()} onClick={()=>void request({action:"preview",audience,category})}>Preview public fields</button>
        {preview&&<><h3>Exactly what will be published</h3><p>{preview.payload.queries[0].query}</p><p>{preview.payload.queries[0].audience} · {preview.payload.queries[0].category}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:".875rem"}}>{JSON.stringify(preview.payload,null,2)}</pre><button type="button" className="button" disabled={busy} onClick={()=>void request({action:"publish",audience,category,reviewHash:preview.reviewHash})}>Publish these fields</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setPreview(null)}>Cancel preview</button></>}
      </>}
    </div>}
  </section>;
}
