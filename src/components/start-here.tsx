"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "@/components/icons";
import "./start-here.css";

type Site = { id: string; url: string; name?: string | null };
type Run = { id: string; status: string };
type Suite = { id: string; name: string; cases?: unknown[] };

type Snapshot = { sites: Site[]; runs: Run[]; suites: Suite[] };

const STEPS = [
  { id: "site", title: "Add a website", detail: "A saved site is the target for every check.", href: "/websites", action: "Add a website" },
  { id: "question", title: "Track a customer question", detail: "Record what agents answer, and who they recommend.", href: "/benchmarks", action: "Start from a template" },
  { id: "evaluation", title: "Run an evaluation", detail: "See what the agent understood from your page.", href: "/evaluations", action: "Run an evaluation" },
  { id: "fix", title: "Review findings", detail: "Inspect the saved checks and any findings that need attention.", href: "/evaluations?view=page", action: "Review checks" },
] as const;

/** The first screen answers three questions: what is tracked, what is done, what is next. */
export function StartHere({ ownerId }: { ownerId: string | null }) {
  const [data, setData] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!ownerId) { setData(null); return; }
    const controller = new AbortController();
    const read = (path: string) => fetch(path, { signal: controller.signal, cache: "no-store" })
      .then(response => response.ok ? response.json() : {})
      .catch(() => ({})) as Promise<{ sites?: Site[]; runs?: Run[]; suites?: Suite[] }>;
    Promise.all([read("/api/sites"), read("/api/evaluations"), read("/api/benchmarks")])
      .then(([sites, runs, benchmarks]) => {
        if (controller.signal.aborted) return;
        setData({
          sites: Array.isArray(sites.sites) ? sites.sites : [],
          runs: Array.isArray(runs.runs) ? runs.runs : [],
          suites: Array.isArray(benchmarks.suites) ? benchmarks.suites : [],
        });
      });
    return () => controller.abort();
  }, [ownerId]);

  if (!ownerId) return null;

  const questions = data?.suites.reduce((total, suite) => total + (suite.cases?.length ?? 0), 0) ?? 0;
  const done = new Set<string>();
  if ((data?.sites.length ?? 0) > 0) done.add("site");
  if ((data?.suites.length ?? 0) > 0) done.add("question");
  if (data?.runs.some(run=>run.status==="completed")) done.add("evaluation");
  const next = STEPS.find(step => !done.has(step.id)) ?? null;

  return (
    <section className="start-here" aria-label="Start here">
      <div className="start-here-stats">
        <div><span>Sites</span><strong>{data ? data.sites.length : "—"}</strong></div>
        <div><span>Questions tracked</span><strong>{data ? questions : "—"}</strong></div>
        <div><span>Evaluations</span><strong>{data ? data.runs.length : "—"}</strong></div>
        <div><span>Suites</span><strong>{data ? data.suites.length : "—"}</strong></div>
      </div>

      <ol className="start-here-steps">
        {STEPS.map((step, index) => {
          const complete = done.has(step.id);
          return (
            <li key={step.id} className={complete ? "complete" : ""}>
              <span className="start-here-mark" aria-hidden>{complete ? <Check size={12} /> : index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </div>
              {complete ? <span className="start-here-done">Done</span>
                : step.id === next?.id ? <Link href={step.href}>{step.action} <ArrowRight size={12} /></Link>
                : <span className="start-here-idle">Next after step {index}</span>}
            </li>
          );
        })}
      </ol>

      {next && (
        <div className="start-here-next">
          <span>Next</span>
          <strong>{next.title}</strong>
          <Link href={next.href}>{next.action} <ArrowRight size={13} /></Link>
        </div>
      )}
    </section>
  );
}
