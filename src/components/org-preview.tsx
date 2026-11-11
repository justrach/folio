"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, RotateCcw, Users } from "@/components/icons";
import { UiSelect } from "./ui/select";
import { DEMO_EMPLOYEES, demoUsageEntries, employeeUsage } from "@/lib/team-usage-demo";
import "./org-preview.css";

type TaskState = "draft" | "review" | "approved";
type TeamTask = { id: string; title: string; owner: string; state: TaskState; finding: string; proposal: string };
const INITIAL_TASKS: TeamTask[] = [
  { id: "description", title: "Make the page description clearer", owner: "avery", state: "draft", finding: "The sample audit found a long description. A visitor should understand the product in one short sentence.", proposal: "An open-source coding agent for navigating and changing large codebases with less context." },
  { id: "title", title: "Review the proposed page title", owner: "sam", state: "review", finding: "The sample page title is longer than the technical rubric recommends. Sam has prepared a shorter option.", proposal: "Graff — Open-source coding agent | Codegraff" },
  { id: "question", title: "Choose the next customer question", owner: "jordan", state: "draft", finding: "The team needs a specific buyer question before starting research. A question is a plan, not a completed search result.", proposal: "Which open-source coding agents help developers use less context in large codebases?" },
];
const STATE_LABELS: Record<TaskState, string> = { draft: "In progress", review: "Ready for review", approved: "Approved in preview" };
const USAGE = DEMO_EMPLOYEES.map(person => employeeUsage(person, demoUsageEntries("2026-11")));

/** Local interaction concept only: no membership, sharing, publishing or spending. */
export function OrgPreview() {
  const [view, setView] = useState<"manager" | "teammate">("manager");
  const [person, setPerson] = useState("avery");
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [selected, setSelected] = useState("description");
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const visible = view === "manager" ? tasks : tasks.filter(task => task.owner === person);
  const task = visible.find(item => item.id === selected) ?? visible[0];
  const current = DEMO_EMPLOYEES.find(item => item.id === person)!;
  const ready = tasks.filter(item => item.state === "review").length;
  function update(id: string, patch: Partial<TeamTask>) {
    setTasks(previous => previous.map(item => item.id === id ? { ...item, ...patch } : item));
  }
  function reset() {
    setTasks(INITIAL_TASKS); setView("manager"); setPerson("avery"); setSelected("description"); setActivity([]); setMessage("Preview reset. Nothing was saved to a team account.");
  }
  return <div className="org-preview">
    <div className="org-note" role="note"><Users size={18} aria-hidden="true" /><span><strong>Interactive team preview.</strong> Sample people, tasks and credits. Changes stay on this page; no invitations, publishing or paid runs.</span></div>
    <div className="org-toolbar">
      <div className="org-view-switch" role="group" aria-label="Preview perspective">
        <button type="button" aria-pressed={view === "manager"} onClick={() => { setView("manager"); setMessage(""); }}>Manager view</button>
        <button type="button" aria-pressed={view === "teammate"} onClick={() => { setView("teammate"); setMessage(""); }}>Teammate view</button>
      </div>
      {view === "teammate" && <label className="org-person-picker">View as<UiSelect aria-label="Preview teammate" value={person} onChange={event => { setPerson(event.target.value); setMessage(""); }}>{DEMO_EMPLOYEES.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</UiSelect></label>}
      <button type="button" className="org-reset" onClick={reset}><RotateCcw size={14} aria-hidden="true" />Reset preview</button>
    </div>
    <section className="org-overview" aria-label="Sample team overview">
      <div><span>Shared website · example</span><strong>codegraff.com</strong><p>One place for findings, questions and review.</p></div>
      <div><span>Team</span><strong>{DEMO_EMPLOYEES.length} people</strong><p>Each task has a named owner.</p></div>
      <div><span>Review queue</span><strong>{ready} {ready === 1 ? "item" : "items"}</strong><p>Approval here never publishes a change.</p></div>
    </section>
    <section className="org-work" aria-label="Shared sample work">
      <header><div><h2>{view === "manager" ? "What’s moving across the team?" : `Your work, ${current.name.split(" ")[0]}.`}</h2><p>{view === "manager" ? "Assign an owner, review their proposal, then agree what happens next." : "Open your task, prepare a change, and send it to the manager for review."}</p></div><span className="org-count">{visible.length} {visible.length === 1 ? "task" : "tasks"}</span></header>
      <div className="org-task-list">{visible.map(item => <button type="button" key={item.id} aria-pressed={task?.id === item.id} aria-controls="org-task-detail" onClick={() => { setSelected(item.id); setMessage(""); }}><span><strong>{item.title}</strong><small>{DEMO_EMPLOYEES.find(member => member.id === item.owner)?.name}</small></span><span className="org-status" data-status={item.state}>{STATE_LABELS[item.state]}</span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>
      {!visible.length && <p className="org-empty">No sample tasks assigned to {current.name}. Switch to the manager view to assign one.</p>}
    </section>
    {task && <section className="org-task-detail" id="org-task-detail" aria-label="Selected sample task">
      <header><h2>{task.title}</h2>{view === "manager" ? <label>Assigned to<UiSelect aria-label="Task owner" value={task.owner} onChange={event => { update(task.id, { owner: event.target.value }); setMessage("Sample assignment updated. No notification was sent."); }}>{DEMO_EMPLOYEES.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</UiSelect></label> : <span className="org-status" data-status={task.state}>{STATE_LABELS[task.state]}</span>}</header>
      <div className="org-proposal"><div><h3>What we found · sample</h3><p>{task.finding}</p></div><div><h3>Proposed next step</h3>{view === "teammate" && task.state === "draft" ? <label className="org-proposal-editor">Edit your sample proposal<textarea maxLength={2000} aria-label="Sample proposed change" value={task.proposal} onChange={event => update(task.id, { proposal: event.target.value })} /></label> : <p>{task.proposal}</p>}</div></div>
      <footer>{task.state === "approved" ? <p className="org-approved"><Check size={17} aria-hidden="true" />Approved in this preview. The website has not changed.</p> : view === "manager" && task.state === "review" ? <button type="button" className="button primary" onClick={() => { update(task.id, { state: "approved" }); setActivity(previous => [`Manager approved “${task.title}” in the preview.`, ...previous]); setMessage("Approval recorded locally. Nothing was published or charged."); }}>Approve sample proposal<Check size={16} aria-hidden="true" /></button> : view === "teammate" && task.state === "draft" ? <button type="button" className="button primary" disabled={!task.proposal.trim()} onClick={() => { update(task.id, { state: "review" }); setActivity(previous => [`${current.name} sent “${task.title}” for review.`, ...previous]); setMessage("Ready for review. Switch to Manager view to approve this sample proposal."); }}>Send for review<ArrowRight size={16} aria-hidden="true" /></button> : <p>{view === "manager" ? "Your teammate is preparing this proposal. Switch to Teammate view to try their part." : "Sent for review. The manager reviews this proposal before anyone applies it."}</p>}</footer>
    </section>}
    <p className="org-feedback" role="status" aria-label="Team preview feedback">{message}</p>
    <section className="org-people" aria-label="Sample teammates and usage"><header><div><h2>Who’s working on what?</h2><p>November sample credits. Confirmed usage and reservations are different.</p></div><Link className="button secondary" href="/overview?view=demo&demo=team">Explore credit usage<ArrowRight size={15} aria-hidden="true" /></Link></header><ul>{USAGE.map(member => <li key={member.id}><span className="org-avatar" aria-hidden="true">{member.name.split(" ").map(part => part[0]).join("")}</span><div className="org-member-name"><strong>{member.name}</strong><small>{member.role} · {tasks.filter(item => item.owner === member.id && item.state !== "approved").length} open tasks</small></div><div className="org-member-usage"><strong>{member.used.toLocaleString("en-US")} / {member.budget.toLocaleString("en-US")}</strong><span>sample credits confirmed{member.unknown ? " · final usage pending" : member.reserved ? ` · ${member.reserved} reserved` : ""}</span><div className="org-usage-track" aria-hidden="true"><i style={{ width: `${member.used / member.budget * 100}%` }} /></div></div></li>)}</ul></section>
    {!!activity.length && <section className="org-local-activity" aria-label="Preview activity"><h2>What just happened</h2><ul>{activity.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
    <details className="org-live-boundary"><summary>How would this work with a real team?</summary><ol><li>The manager adds a website and chooses customer questions.</li><li>Teammates own specific findings and prepare proposed changes.</li><li>A manager reviews the evidence and approves the next step.</li><li>The team applies changes separately, then explicitly starts a fresh check.</li></ol><p>This preview doesn’t implement team memberships, invitations, shared records, approval enforcement, or a credit wallet. Those need server-side roles and an owner-scoped usage ledger before they can be live.</p></details>
  </div>;
}
