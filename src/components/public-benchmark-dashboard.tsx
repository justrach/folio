"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, RefreshCw, Search } from "lucide-react";
import { assertPublicDashboardData, type PublicDashboardData } from "@/lib/public-dashboard";
import { RecordedRanking } from "./recorded-ranking";
import "./ranked-search-table.css";
import "./public-benchmark-dashboard.css";

type Task = PublicDashboardData["queries"][number];
const TASKS_PER_PAGE = 25;
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function taskState(task: Task) {
  if (task.latestObservation) return { key: "published", label: "Published" };
  if (task.collection.status === "completed") return { key: "review", label: "Preparing result" };
  if (task.collection.status === "unresolved") return { key: "review", label: "Needs review" };
  if (task.collection.status === "running") return { key: "running", label: "Running" };
  if (task.collection.status === "queued") return { key: "queued", label: "Queued" };
  if (task.collection.status === "failed") return { key: "failed", label: "Failed" };
  if (task.collection.status === "cancelled") return { key: "cancelled", label: "Cancelled" };
  return { key: "pending", label: "Not started" };
}

function TaskStatus({ task }: { task: Task }) {
  const state = taskState(task);
  return <span className={`public-task-status public-task-status--${state.key}`}><i aria-hidden="true" />{state.label}</span>;
}

export function PublicBenchmarkDashboard() {
  const params = useSearchParams();
  const queryId = params.get("query");
  const [data, setData] = useState<PublicDashboardData | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [initialTaskId, setInitialTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [audience, setAudience] = useState("All audiences");
  const [status, setStatus] = useState("All tasks");
  const [taskPage, setTaskPage] = useState<{ context: string; index: number } | null>(null);
  const taskList = useRef<HTMLOListElement>(null);
  const taskPicker = useRef<HTMLSelectElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => { setTaskPage(null); }, [queryId]);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      setRefreshing(true);
      try {
        const response = await fetch("/api/public/benchmarks", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (!response.ok) throw new Error("Public results unavailable");
        const next: unknown = await response.json();
        assertPublicDashboardData(next);
        if (disposed) return;
        setData(next); setError(false);
        setInitialTaskId(current => current ?? [...next.queries].filter(task => task.latestObservation)
          .sort((a, b) => Date.parse(b.latestObservation!.observedAt) - Date.parse(a.latestObservation!.observedAt))[0]?.id
          ?? next.queries.find(task => ["running", "queued"].includes(task.collection.status))?.id ?? next.queries[0]?.id ?? null);
        // This retrieves published snapshots only; it never starts or reconciles agent work.
        if (next.queries.some(task => !task.latestObservation && !["failed", "cancelled"].includes(task.collection.status))) {
          timer = setTimeout(() => { if (!disposed) void load(); }, 15_000);
        }
      } catch {
        if (!disposed) setError(true);
      } finally {
        if (!disposed) setRefreshing(false);
      }
    }
    queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; controller.abort(); if (timer) clearTimeout(timer); };
  }, [revision]);

  if (!data) return <section className="public-benchmark-loading" aria-label="Public benchmark results" aria-busy={!error}>
    {error ? <><h2>Results could not be loaded</h2><p>Try refreshing the public dashboard.</p><button className="button secondary" onClick={() => setRevision(value => value + 1)}>Try again</button></> : <><p role="status">Loading public benchmark results…</p><div className="public-benchmark-placeholder" aria-hidden="true" /></>}
  </section>;

  const summary = data.summary;
  const active = data.queries.filter(task => ["queued", "running"].includes(task.collection.status));
  const latest = [...data.queries].filter(task => task.latestObservation).sort((a, b) => Date.parse(b.latestObservation!.observedAt) - Date.parse(a.latestObservation!.observedAt));
  const audiences = [...new Set(data.queries.map(task => task.audience))];
  const filtered = data.queries.filter(task => {
    const text = `${task.query} ${task.category} ${task.audience} ${task.latestObservation?.recommendations.map(item => `${item.name} ${item.url ?? ""}`).join(" ") ?? ""}`.toLowerCase();
    const state = taskState(task);
    const inProgress = ["running", "queued"].includes(task.collection.status) || !task.latestObservation && task.collection.status === "completed";
    const needsAttention = ["failed", "cancelled", "unresolved"].includes(task.collection.status);
    return (audience === "All audiences" || audience === task.audience) && text.includes(search.toLowerCase().trim())
      && (status === "All tasks" || status === "Published" && state.key === "published" || status === "In progress" && inProgress || status === "Not started" && state.key === "pending" || status === "Needs attention" && needsAttention);
  });
  const filteredIds = new Set(filtered.map(task => task.id));
  const selected = filtered.find(task => task.id === (queryId ?? initialTaskId)) ?? latest.find(task => filteredIds.has(task.id)) ?? active.find(task => filteredIds.has(task.id)) ?? filtered[0];
  // A new selection (including back/forward) reveals its page. Snapshot refreshes
  // preserve browsing position, and filters cannot leave a now-empty page selected.
  const pageContext = JSON.stringify([queryId, initialTaskId, search, audience, status]);
  const selectedPage = Math.floor(Math.max(0, filtered.findIndex(task => task.id === selected?.id)) / TASKS_PER_PAGE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / TASKS_PER_PAGE));
  const pageIndex = Math.min(taskPage?.context === pageContext ? taskPage.index : selectedPage, pageCount - 1);
  const pageStart = pageIndex * TASKS_PER_PAGE;
  const pageTasks = filtered.slice(pageStart, pageStart + TASKS_PER_PAGE);
  const selectionOnPage = pageTasks.some(task => task.id === selected?.id);
  function showPage(index: number) {
    setTaskPage({ context: pageContext, index });
    taskList.current?.scrollTo({ top: 0 });
  }
  function revealSelectedTask() {
    showPage(selectedPage);
    requestAnimationFrame(() => {
      if (taskPicker.current?.getClientRects().length) taskPicker.current.focus();
      else taskList.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus();
    });
  }
  function selectTask(id: string, focus = false) {
    const next = new URLSearchParams(); next.set("query", id);
    window.history.pushState(null, "", `/overview?${next}`);
    if (focus) requestAnimationFrame(() => resultHeading.current?.focus({ preventScroll: true }));
  }

  return <div className="public-benchmark-dashboard" role="region" aria-label="Public benchmark results">
    <div className="public-benchmark-toolbar"><p>Explore the questions and their sources</p><div><button type="button" onClick={() => setRevision(value => value + 1)} aria-label="Refresh public results" disabled={refreshing}><RefreshCw size={14} />{refreshing ? "Refreshing" : "Refresh"}</button></div></div>
    {error && <p className="public-benchmark-refresh-error" role="alert">The latest update could not be loaded. The last saved results are still shown.</p>}
    <dl className="public-benchmark-summary" aria-label="Benchmark totals">
      <div><dt>Published answers</dt><dd>{summary.publishedQueryCount}<small> / {summary.queryCount}</small></dd><p>One latest answer per task</p></div>
      <div><dt>Running now</dt><dd>{summary.collection.running}</dd><p>{summary.collection.queued ? `${summary.collection.queued} more queued` : summary.collection.running ? "Agent tasks in progress" : "No running task reported"}</p></div>
      <div><dt>Websites recommended</dt><dd>{summary.publishedQueryCount ? summary.uniqueRecommendedWebsiteCount : "—"}</dd><p>Across published answers</p></div>
      <div><dt>Sources cited</dt><dd>{summary.publishedQueryCount ? summary.uniqueCitedSourceCount : "—"}</dd><p>Distinct source pages</p></div>
    </dl>
    <div className="public-benchmark-progress"><div role="progressbar" aria-label="Tasks with published answers" aria-valuemin={0} aria-valuemax={summary.queryCount || 1} aria-valuenow={summary.publishedQueryCount}><span style={{ width: `${summary.queryCount ? summary.publishedQueryCount / summary.queryCount * 100 : 0}%` }} /></div><span>{summary.queryCount - summary.publishedQueryCount} {summary.queryCount - summary.publishedQueryCount === 1 ? "task without a published answer" : "tasks without published answers"}</span></div>

    <div className="public-benchmark-filters">
      <label className="public-benchmark-search"><Search size={15} /><span className="sr-only">Search tasks</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a question or website" /></label>
      <label><span className="sr-only">Audience</span><select value={audience} onChange={event => setAudience(event.target.value)}><option>All audiences</option>{audiences.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span className="sr-only">Task status</span><select value={status} onChange={event => setStatus(event.target.value)}>{["All tasks", "Published", "In progress", "Not started", "Needs attention"].map(value => <option key={value}>{value}</option>)}</select></label>
    </div>

    <div className="public-benchmark-workbench">
      <section className="public-benchmark-task-browser" aria-label="Benchmark tasks">
        <div className="public-benchmark-list-heading"><h2>Tasks</h2><span>{filtered.length} of {data.queries.length}</span></div>
        {filtered.length > 0 && <nav className="public-benchmark-pagination" aria-label="Task pages">
          <p role="status">{pageStart + 1}–{pageStart + pageTasks.length} of {filtered.length} tasks · Page {pageIndex + 1} of {pageCount}</p>
          <div><button type="button" onClick={() => showPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Previous task page">Previous</button><button type="button" onClick={() => showPage(pageIndex + 1)} disabled={pageIndex === pageCount - 1} aria-label="Next task page">Next</button>
          {!selectionOnPage && selected && <button type="button" onClick={revealSelectedTask}>Show selected task</button>}</div>
        </nav>}
        <div className="public-benchmark-mobile-picker"><label>Task<select ref={taskPicker} value={selectionOnPage ? selected?.id : ""} onChange={event => selectTask(event.target.value, true)}><option value="" disabled>Choose a task on this page</option>{pageTasks.map(task => <option key={task.id} value={task.id}>{task.query} · {taskState(task).label}</option>)}</select></label></div>
        <ol ref={taskList} start={pageStart + 1} className="public-benchmark-task-list">{pageTasks.map(task => <li key={task.id}><button type="button" onClick={() => selectTask(task.id)} aria-pressed={selected?.id === task.id} aria-label={`Open task: ${task.query}`}>
          <span className="public-task-topline"><span>{task.audience}</span><TaskStatus task={task} /></span><strong>{task.category}</strong><span className="public-task-question">{task.query}</span>
          <span className="public-task-bottomline">{task.latestObservation ? `${task.latestObservation.recommendations.length} recommendations · ${task.latestObservation.citations.length} sources` : task.collection.startedAt ? `Started ${date(task.collection.startedAt)}` : "No result yet"}<ChevronRight size={14} /></span>
        </button></li>)}</ol>
        {!filtered.length && <div className="public-benchmark-no-matches"><p>No tasks match these filters.</p><button type="button" onClick={() => { setSearch(""); setAudience("All audiences"); setStatus("All tasks"); }}>Clear filters</button></div>}
      </section>

      {selected ? <section className="public-benchmark-result" aria-label="Selected task" key={selected.id}>
        <header><div className="public-task-detail-label"><span>{selected.audience} / {selected.category}</span><TaskStatus task={selected} /></div><h2 ref={resultHeading} tabIndex={-1}>{selected.query}</h2><p className="public-task-locale">{selected.language === "en" ? "English" : selected.language} · {selected.locale}<a href={`/overview?query=${encodeURIComponent(selected.id)}`} aria-label="Link to this task">Link to task <ArrowUpRight size={12} /></a></p></header>
        {selected.latestObservation ? <div className="ranked-search public-benchmark-published-result"><div className="public-benchmark-answer-heading"><h3>Ranked recommendations</h3><span>Order returned for this question</span></div><RecordedRanking query={selected} observation={selected.latestObservation} /></div> : <TaskInProgress task={selected} />}
      </section> : <section className="public-benchmark-result"><h2>{data.queries.length ? "No matching tasks" : "No benchmark tasks yet"}</h2><p>{data.queries.length ? "Change your search or filters to see a task and its result." : "Published tasks will appear here with their questions and results."}</p></section>}
    </div>
    <footer className="public-benchmark-footer"><p>Public benchmark results. Open a task to see its exact question, returned order and sources.</p><Link href="/leaderboard">Browse website page checks <ArrowUpRight size={13} /></Link></footer>
  </div>;
}

function TaskInProgress({ task }: { task: Task }) {
  const state = taskState(task);
  const active = ["queued", "running"].includes(task.collection.status);
  const finished = task.collection.status === "completed";
  const copy: Record<string, { title: string; body: string }> = {
    running: { title: "The agent is working on this question", body: "Its recommendations and sources will appear here after the result is checked and published." },
    queued: { title: "This task is queued", body: "The task has been submitted. No answer has been returned yet." },
    pending: { title: "This task has not started yet", body: "The question is part of the benchmark. Its result will appear here when it is available." },
    review: task.collection.status === "completed" ? { title: "The answer is being prepared for publication", body: "The agent finished this task. The public report is not available yet." } : { title: "This task needs review", body: "The run has no confirmed result. It is not counted as a completed answer." },
    failed: { title: "This task did not finish", body: "No completed answer was recorded. The other published results remain available." },
    cancelled: { title: "This task was cancelled", body: "No completed answer was published for this attempt." },
  };
  const message = copy[state.key] ?? copy.pending;
  return <div className="public-benchmark-pending-result"><div className="public-task-stages" aria-label="Task progress">
    <div data-current={active}><i>{finished ? <Check size={13} /> : "1"}</i><span>Run task</span></div><span className="public-stage-line" /><div data-current={finished}><i>2</i><span>Check result</span></div><span className="public-stage-line" /><div><i>3</i><span>Publish answer</span></div>
  </div><h3>{message.title}</h3><p>{message.body}</p>{task.collection.startedAt && <small>Started <time dateTime={task.collection.startedAt}>{date(task.collection.startedAt)}</time></small>}</div>;
}
