"use client";

import { Building2, Check, ShieldCheck, Users } from "lucide-react";
import "./org-preview.css";

/** Illustrative organization workspace. Sample data only; nothing is billed. */
const MEMBERS = [
  { name: "Priya Raghunathan", email: "priya@acme.test", role: "Owner", seats: 1, runs: 128, last: "2h ago" },
  { name: "Tom Alvarez", email: "tom@acme.test", role: "Admin", seats: 1, runs: 64, last: "Yesterday" },
  { name: "Sara Chen", email: "sara@acme.test", role: "Member", seats: 1, runs: 31, last: "3d ago" },
  { name: "Agent: research-bot", email: "svc+research@acme.test", role: "Service", seats: 0, runs: 402, last: "4m ago" },
];

const ACTIVITY = [
  { at: "10:42", who: "research-bot", what: "ran 12 questions for “agent products”", scope: "Suite" },
  { at: "09:18", who: "Priya", what: "invited sara@acme.test as Member", scope: "Access" },
  { at: "08:55", who: "Tom", what: "rotated the production API key", scope: "Keys" },
  { at: "Yesterday", who: "Sara", what: "published 2 sites to the shared index", scope: "Publishing" },
];

export function OrgPreview() {
  return (
    <div className="org-preview">
      <div className="org-note" role="note">
        <Building2 size={15} />
        <span><strong>Sample organization.</strong> Illustrative data for the team flow. Nothing here is billed, invited, or shared.</span>
      </div>

      <section className="org-summary" aria-label="Organization summary">
        <div><span>Plan</span><strong>Enterprise</strong><small>Proposed · 10 seats</small></div>
        <div><span>Seats</span><strong>4 / 10</strong><small>1 service account</small></div>
        <div><span>Questions</span><strong>240</strong><small>Across 6 shared suites</small></div>
        <div><span>This month</span><strong>$412</strong><small>Proposed · not invoiced</small></div>
      </section>

      <section className="org-card" aria-label="Members">
        <header><h2><Users size={14} /> Members</h2><span>Roles decide who can spend and publish</span></header>
        <ul className="org-members">
          {MEMBERS.map(member => (
            <li key={member.email}>
              <span className={`org-avatar ${member.role === "Service" ? "service" : ""}`} aria-hidden>
                {member.role === "Service" ? "AI" : member.name.split(" ").map(part => part[0]).join("")}
              </span>
              <div><strong>{member.name}</strong><small>{member.email}</small></div>
              <span className={`org-role role-${member.role.toLowerCase()}`}>{member.role}</span>
              <span className="org-meta">{member.runs} runs</span>
              <span className="org-meta">{member.last}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="org-card" aria-label="Audit activity">
        <header><h2><ShieldCheck size={14} /> Audit activity</h2><span>Every spend and access change, newest first</span></header>
        <ul className="org-activity">
          {ACTIVITY.map(item => (
            <li key={item.at + item.what}>
              <span className="org-time">{item.at}</span>
              <span className="org-who">{item.who}</span>
              <span className="org-what">{item.what}</span>
              <span className="org-scope">{item.scope}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="org-card" aria-label="What the team shares">
        <header><h2><Check size={14} /> Shared by the organization</h2><span>Private to the org, never public</span></header>
        <ul className="org-shared">
          <li><strong>6 question suites</strong><span>240 questions · edited by Priya and Tom</span></li>
          <li><strong>18 saved websites</strong><span>12 private · 6 published to the shared index</span></li>
          <li><strong>2 API keys</strong><span>research-bot (read, evaluate) · ci (read)</span></li>
        </ul>
      </section>
    </div>
  );
}
