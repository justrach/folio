"use client";
import {useEffect,useRef,useState} from "react";
import {Check,ChevronDown,CircleDashed,Pause,Play,TriangleAlert} from "lucide-react";
import type {KeywordBenchmarkRun} from "@/lib/keyword-benchmark-types";

/** Presentation only: never polls, launches work, or invents intermediate tool activity. */
export function ResearchActivity({run,model="Luna"}:{run?:KeywordBenchmarkRun;model?:string}){
 const element=useRef<HTMLElement>(null);
 useEffect(()=>{if(!run)element.current?.scrollIntoView({block:"center",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});},[run]);
 const [now,setNow]=useState(Date.now());
 const [motionPaused,setMotionPaused]=useState(false);
 const [open,setOpen]=useState(run?.status==="requires_action");
 const working=!run||["queued","running"].includes(run.status)&&!run.cancelAttemptAt;
 useEffect(()=>{if(!run||!working)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer);},[run?.id,working]);
 const name=run?.model?.replace(/^gpt-(?:5\.6-|6-)/,"").replace(/^./,c=>c.toUpperCase())||model;
 const heading=!run?`Starting ${name}…`:run.cancelAttemptAt&&["queued","running","requires_action"].includes(run.status)?"Waiting for cancellation confirmation":run.status==="requires_action"?"Review the saved attempt":working?"Your observation is in progress":run.status==="cancelled"?"Observation cancelled":"No completed answer was recorded";
 const seconds=run?Math.max(0,Math.floor(((working?now:Date.parse(run.updatedAt))-Date.parse(run.createdAt))/1000)):null;
 const elapsed=seconds!==null&&Number.isFinite(seconds)?`${Math.floor(seconds/60)}m ${seconds%60}s`:null;
 const steps=[{label:"Request saved",done:Boolean(run)},{label:"Session recorded",done:Boolean(run?.sessionId)},{label:"Answer recorded",done:run?.status==="completed"&&Boolean(run.answer)}];
 return <section ref={element} className="research-activity" aria-label={run?"Observation progress":"Starting observation"} data-working={working} data-motion-paused={motionPaused}>
  <div className="research-activity-header">
   <span className="research-orbit" aria-hidden="true">{working?<><i/><i/><i/></>:<TriangleAlert size={22}/>}</span>
   <div className="research-activity-copy"><span className="research-eyebrow">{name} · {run?"Saved observation":"New observation"}</span><h3 role="status">{heading}</h3><p>{!run?"Sending your request. Keep this page open until the attempt is saved.":working?"Waiting for the agent’s recorded answer. You can inspect the milestones below.":"Inspect the saved details before deciding what to do next."}</p></div>
   <div className="research-activity-meta">{elapsed&&<span className="research-elapsed" aria-label={`Elapsed since request: ${elapsed}`}>{elapsed}</span>}{working&&<button type="button" className="research-motion-toggle" onClick={()=>setMotionPaused(value=>!value)} aria-pressed={motionPaused} aria-label={motionPaused?"Resume status animation":"Pause status animation"}>{motionPaused?<Play size={14}/>:<Pause size={14}/>}</button>}</div>
  </div>
  <div className="research-signal" aria-hidden="true"><span/></div>
  <div className="research-tools"><span>{!run?"Requested research":run.case.searchMode==="reviewed-domains"?"Reviewed sources":"Open-web research"}</span>{run?.harnessVersion.includes("-seo-")&&<span>Keyword research enabled</span>}{run?.harnessVersion.includes("-typesafe-")&&<span>Claim checks enabled</span>}<span>{run?.sessionId?"Session saved":"Session not recorded"}</span></div>
  <div className="t-acc" data-open={open}><button className="research-milestone-toggle t-acc-head" type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>Recorded milestones <span className="t-acc-chevron"><ChevronDown size={15}/></span></button>
  <div className="research-milestones t-acc-panel" inert={!open} aria-hidden={!open}><div className="t-acc-panel-inner">
   <ol>{steps.map(step=><li key={step.label} data-complete={step.done}>{step.done?<Check size={16}/>:<CircleDashed size={16}/>}<span>{step.label}</span><small>{step.done?"Recorded":"Not recorded"}</small></li>)}</ol>
   <p>{!run?"A delayed response does not mean the request failed. Do not submit it again.":run.sessionId?"While this page is visible, saved progress is retrieved every 10 seconds. Closing it stops these checks; it does not cancel the remote task.":"No provider session was recorded, so Folio cannot retrieve or cancel the remote task. Its outcome and cost remain unknown. This page does not retry the original request."}</p>
  </div></div></div>
 </section>;
}
