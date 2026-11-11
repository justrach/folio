"use client";
import {trackProductEvent} from "@/lib/product-analytics-client";

import Link from "next/link";
import { ArrowRight, Check, ShieldCheck, X } from "@/components/icons";
import { CompanyFavicon } from "./company-favicon";
import { WorkspaceEmptyArt } from "./workspace-empty-art";
import { DEVELOPER_TOOLS } from "@/lib/developer-tools-source";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { websiteCustomerGroupDrafts, websiteQuestionDrafts } from "@/lib/website-question-drafts";
import { MAX_CUSTOMER_GROUPS } from "@/lib/onboarding-customers";
import { competitorWebsite } from "@/lib/competitor-domain";
import { QUESTION_SUITE_MAX_QUESTION_LENGTH } from "@/lib/question-suite-input";
import { evaluationMethodology } from "@/lib/evaluation";
import type { CompetitorSuggestion } from "@/lib/onboarding-competitors";
import { BaselineProgress, useBaselineQueue } from "./onboarding-progress";
import "./onboarding.css";

export type OnboardingProof = { category: string; totalAnswers: number; firstObservedAt: string | null; lastObservedAt: string | null; rows: { name: string; answers: number; totalAnswers: number; averagePosition: number }[] };
export type StarterPack = { id: string; name: string; questions: string[]; companies: { name: string; aliases: string[] }[] };
type Fix = { id: string; label: string; points: number; maxPoints: number; gap: number; detail: string };
type Check = { id: string; url: string; host: string; createdAt: string; seoScore: number; scoredChecks: number; fixes: Fix[]; passed?: { id: string; label: string }[];
  suggestion: { audience: string; task: string };
  competitors: { category: string | null; questions: number; totalAnswers: number; rows: CompetitorSuggestion[] } };
type Summary = { state: { siteId: string | null; audience: string; customerGroups?: string[]; task: string; suiteId: string | null; competitorsSavedAt: string | null; baselineRequestedAt: string | null; completedAt: string | null } | null;
  site: { id: string; url: string; name: string } | null; check: Check | null; suite: { id: string; cases: { id: string; query: string }[] } | null;
  competitors: { name: string; aliases: string[]; domain?: string }[] };
type Access = { canRun: boolean; message: string };
type Candidate = { name: string; domain?: string; aliases: string[]; answers?: number; totalAnswers?: number; averagePosition?: number; source?: "public-index" | "starter-pack" | "manual"; checked: boolean };

const STEPS = ["Website", "Report", "Account", "Customers", "Questions", "Competitors", "Baseline"];
const TOTAL = STEPS.length;
const STORE = "folio-onboarding-v1";
const LANGUAGE = "English", LOCALE = "United States";

function Mark() { return <span className="ob-mark" aria-hidden="true"><i /><i /><i /><i /></span>; }
const Arrow = () => <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />;
const Shield = () => <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />;
export const Tick = () => <Check size={13} strokeWidth={3.2} aria-hidden="true" />;
const Trust = ({ children }: { children: ReactNode }) => <p className="ob-trust"><Shield /><span>{children}</span></p>;
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)) : "";
const dateRange = (from: string | null, to: string | null) => {
  const a = date(from), b = date(to);
  if (!a || a === b) return a;
  const [d1, m1, y1] = a.split(" "), [d2, m2, y2] = b.split(" ");
  return m1 === m2 && y1 === y2 ? `${d1} and ${d2} ${m2} ${y2}` : `${a} and ${b}`;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const websiteOf = (company: { domain?: string; aliases: string[] }) => competitorWebsite(company) ?? "Website not provided";

async function requestApi<T>(url: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const isCheck=url==="/api/onboarding/check"&&init?.method==="POST",began=typeof performance!=="undefined"?performance.now():0;
  if(isCheck)trackProductEvent("website_check_requested");
  try {
  const response = await fetch(url, { signal: init?.signal, method: init?.method ?? "GET", cache: "no-store", headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined });
  const body = await response.json().catch(() => ({}));
  init?.signal?.throwIfAborted();
  if (!response.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong. Please try again.");
  if(isCheck)trackProductEvent("website_check_result",{result:"success",duration_ms:performance.now()-began});
  return body as T;
  }catch(error){if(isCheck)trackProductEvent("website_check_result",{result:"failed",error_code:"request_failed",duration_ms:performance.now()-began});throw error;}
}

type Nav = { can: (step: number) => boolean; go: (step: number) => void; dir: "forward" | "back" };

function TopBar({ step, onExit, nav }: { step: number; onExit?: () => void; nav?: Nav }) {
  return <header className="ob-top">
    <Link href="/" className="ob-wordmark" aria-label="Folio home"><Mark /><span>folio<span className="dot">.</span></span></Link>
    <nav className="ob-steps" aria-label="Setup steps"><ol>{STEPS.map((label, index) => {
      const n = index + 1, state = n < step ? "done" : n === step ? "now" : "next";
      const inner = <><span className="ob-step-dot" aria-hidden="true">{state === "done" ? <Tick /> : n}</span><span>{label}</span></>;
      return <li key={label} className={state} aria-current={state === "now" ? "step" : undefined}>
        {nav?.can(n) ? <button type="button" onClick={() => nav.go(n)} aria-label={`Back to ${label}`}>{inner}</button> : <span className="ob-step">{inner}</span>}</li>;
    })}</ol></nav>
    <div className="ob-progress"><span>{step <= TOTAL ? `Step ${step} of ${TOTAL}` : "Optional"}<span className="ob-progress-label">{step <= TOTAL ? ` · ${STEPS[step - 1]}` : ""}</span></span>
      <div className="ob-bars" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={Math.min(step, TOTAL)}>{Array.from({ length: TOTAL }, (_, index) => <span key={index} className={index < step ? "on" : ""} />)}</div></div>
    {onExit && <button type="button" className="ob-exit" onClick={onExit}>Save and exit</button>}
  </header>;
}

function Screen({ step, onExit, nav, eyebrow, title, children, side }: { step: number; onExit?: () => void; nav?: Nav; eyebrow: ReactNode; title: string; children: ReactNode; side: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const previous = nav ? Array.from({length: Math.max(0, step - 1)}, (_, index) => step - index - 1).find(value => nav.can(value)) : undefined;
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  return <div className="ob">
    <TopBar step={step} onExit={onExit} nav={nav} />
    <main className="ob-main" id="main-content" data-step={step} key={step} data-dir={nav?.dir ?? "forward"}>
      <div className="ob-copy">{previous !== undefined && <button className="ob-back-button" type="button" onClick={() => nav?.go(previous)}>← Back</button>}<p className="ob-eyebrow">{eyebrow}</p><h1 ref={heading} tabIndex={-1}>{title}</h1>{children}</div>
      <aside className="ob-side">{side}</aside>
    </main>
  </div>;
}

type OnboardingProps = { proof: OnboardingProof | null; starterPacks: StarterPack[] };

export function Onboarding(props: OnboardingProps) {
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return <div className="ob"><TopBar step={1} /><p className="ob-loading" role="status">Loading your setup…</p></div>;
  // Remount all private form state when the authenticated owner changes.
  return <OnboardingFlow key={session?.user.id ?? "anonymous"} {...props} signedIn={Boolean(session)} />;
}

function OnboardingFlow({ proof, starterPacks, signedIn }: OnboardingProps & { signedIn: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const requestedStep = useRef(Number(params.get("step")));
  const [step, setStepState] = useState(0);
  useEffect(()=>{if(step>0)trackProductEvent("onboarding_step_viewed",{step});},[step]);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const current = useRef(0);
  useEffect(() => { current.current = step; }, [step]);
  const [url, setUrl] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [customerGroups, setCustomerGroups] = useState<string[]>([""]);
  const groupInputs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingGroupFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    const fields = groupInputs.current.filter((field): field is HTMLTextAreaElement => Boolean(field?.isConnected));
    const fit = (field: HTMLTextAreaElement) => { field.style.height = "auto"; field.style.height = `${field.scrollHeight}px`; };
    fields.forEach(fit);
    const widths = new Map(fields.map(field => [field, field.clientWidth]));
    const observer = new ResizeObserver(() => {
      for (const field of fields) if (widths.get(field) !== field.clientWidth) {
        widths.set(field, field.clientWidth); fit(field);
      }
    });
    fields.forEach(field => observer.observe(field));
    return () => observer.disconnect();
  }, [step, customerGroups]);
  const requests = useRef<AbortController | null>(null);
  const api = useCallback(<T,>(url: string, init?: Parameters<typeof requestApi>[1]) => {
    const signal = init?.signal ?? requests.current?.signal;
    signal?.throwIfAborted();
    return requestApi<T>(url, { ...init, signal });
  }, []);
  const [task, setTask] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [suite, setSuite] = useState<Summary["suite"]>(null);
  const [baselineRequested, setBaselineRequested] = useState(false);
  const [access, setAccess] = useState<Access | null>(null);
  const [providers, setProviders] = useState({ google: false, github: false });
  const [scConnected, setScConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [haveAccount, setHaveAccount] = useState(false);

  const setStep = useCallback((next: number) => {
    if (requests.current?.signal.aborted) return;
    setDir(next < current.current ? "back" : "forward"); setStepState(next); setError(""); setShowMore(false);
    const query = new URLSearchParams(window.location.search); query.set("step", String(next));
    window.history.replaceState(null, "", `/start?${query}`);
    window.scrollTo({ top: 0 });
  }, []);

  // Keep the anonymous check across OAuth redirects in this tab only.
  useEffect(() => {
    if (!step || signedIn) return;
    try { sessionStorage.setItem(STORE, JSON.stringify({ ownerId: null, url, check, customerGroups, task })); } catch { /* storage may be unavailable */ }
  }, [step, signedIn, url, check, customerGroups, task]);

  useEffect(() => {
    if (pendingGroupFocus.current === null) return;
    groupInputs.current[pendingGroupFocus.current]?.focus();
    pendingGroupFocus.current = null;
  }, [customerGroups]);

  const candidatesFrom = useCallback((source: Check | null, pinned: Summary["competitors"] = []) => {
    if (pinned.length) return pinned.map(item => ({ name: item.name, aliases: item.aliases, domain: item.domain, checked: true }));
    return (source?.competitors.rows ?? []).filter(row => !row.isTarget).slice(0, 5).map((row, index) => ({ name: row.name, domain: row.domain, aliases: row.aliases, answers: row.answers, totalAnswers: row.totalAnswers, averagePosition: row.averagePosition, source: "public-index" as const, checked: index < 3 }));
  }, []);

  const applyDrafts = useCallback((groups: string[], need: string) => {
    const next = websiteCustomerGroupDrafts(groups, need);
    setDrafts(next); setChosen(next.map((_, index) => index < 5));
  }, []);

  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal;
    requests.current = controller;
    fetch("/api/search-console", { cache: "no-store", signal }).then(r => r.ok ? r.json() : null).then(data => { if (!signal.aborted) { setProviders(value => ({ ...value, google: data?.configured === true })); setScConnected(data?.connected === true); } }).catch(() => {});
    fetch("/api/github", { cache: "no-store", signal }).then(r => r.ok ? r.json() : null).then(data => { if (!signal.aborted) setProviders(value => ({ ...value, github: data?.configured === true })); }).catch(() => {});
    let saved: { ownerId?: null; url?: string; check?: Check | null } = {};
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORE) ?? "{}");
      if (stored?.ownerId === null) saved = stored;
      if (signedIn || stored?.ownerId !== null) sessionStorage.removeItem(STORE);
    } catch { /* ignore unavailable or invalid storage */ }
    const requested = requestedStep.current;
    (async () => {
      if (!signedIn) {
        if (saved.check && requested >= 2 && requested <= 3) { setUrl(saved.url ?? ""); setCheck(saved.check); setStepState(requested); return; }
        setStepState(1); return;
      }
      try {
        let summary = await api<Summary>("/api/onboarding", { signal });
        if (signal.aborted) return;
        if (saved.check && !summary.site) {
          try { await api("/api/onboarding/claim", { method: "POST", body: {}, signal }); summary = await api<Summary>("/api/onboarding", { signal }); }
          catch { /* No pending check on this browser: start from the website step. */ }
        }
        if (signal.aborted) return;
        const state = summary.state;
        setCheck(summary.check); setSiteId(summary.site?.id ?? null); setUrl(summary.site?.url.replace(/^https:\/\//, "").replace(/\/$/, "") ?? "");
        const groups = state?.customerGroups?.length ? state.customerGroups : [state?.audience || summary.check?.suggestion.audience || ""];
        const need = state?.task || summary.check?.suggestion.task || "";
        setCustomerGroups(groups); setTask(need); applyDrafts(groups, need);
        setSuite(summary.suite); setBaselineRequested(Boolean(state?.baselineRequestedAt));
        setCandidates(candidatesFrom(summary.check, summary.competitors));
        const natural = !summary.site ? 1 : !state?.customerGroups?.length && !state?.audience ? 4 : !summary.suite ? 5 : !state?.competitorsSavedAt ? 6 : !state.baselineRequestedAt ? 7 : 8;
        setStepState(requested >= 1 && requested <= 8 && requested !== 3 && (requested <= natural || requested === 8) ? (requested === 2 && !summary.check ? 1 : requested) : natural);
      } catch (failure) { if (!signal.aborted) { setError(failure instanceof Error ? failure.message : "Setup could not be loaded."); setStepState(1); } }
    })();
    return () => controller.abort();
  }, [signedIn, applyDrafts, candidatesFrom]);

  useEffect(() => {
    if (step !== 7 || access) return;
    const controller = new AbortController();
    api<{ access: Access }>("/api/benchmarks", { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setAccess(data.access); }).catch(failure => { if (!controller.signal.aborted) setAccess({ canRun: false, message: failure instanceof Error ? failure.message : "Runs are unavailable right now." }); });
    return () => controller.abort();
  }, [step, access]);

  const queue = useBaselineQueue(step === 8 ? suite?.id ?? null : null, suite?.cases ?? [], baselineRequested);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await work(); } catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  const exit = signedIn ? () => router.push("/websites") : undefined;
  // Completed steps can be revisited; the account step and anything before it are closed once signed in.
  const nav: Nav = { can: target => target < step && (signedIn ? target >= 4 : target <= 2), go: target => setStep(target), dir };

  if (!step) return <div className="ob"><TopBar step={1} /><p className="ob-loading" role="status">Loading your setup…</p></div>;

  if (step === 1) return <Screen nav={nav} step={1} eyebrow="Free page check" title="Start with your website." side={url.trim() ? <LivePreview input={url} checking={busy} /> : <ProofCard proof={proof} />}>
    <p className="ob-lede">Get a free page check. Then choose the customer questions you want to research.</p>
    <form onSubmit={event => { event.preventDefault(); void run(async () => {
      const result = await api<{ check: Check; siteId: string | null }>("/api/onboarding/check", { method: "POST", body: { url: url.includes("://") ? url : `https://${url}` } });
      trackProductEvent("onboarding_step_completed", {step:1,result:"success"});
      setCheck(result.check); setSiteId(result.siteId);
      const { audience: who, task: need } = result.check.suggestion;
      setCustomerGroups([who]); setTask(need); applyDrafts([who], need); setCandidates(candidatesFrom(result.check));
      setStep(2);
    }); }}>
      <label className="ob-field">Website address<div className="ob-input"><span aria-hidden="true">https://</span><input name="url" inputMode="url" autoComplete="url" autoFocus required value={url} onChange={event => setUrl(event.target.value.replace(/^https?:\/\//, ""))} placeholder="yourwebsite.com" /></div></label>
      <div className="ob-actions"><button className="ob-btn primary" type="submit" disabled={busy || !url.trim()}>{busy ? "Checking your page…" : <>Check my page <Arrow /></>}</button>
        <Link className="ob-quiet" href={signedIn ? "/search-console" : "/login?return=/search-console"}>Import from Search Console</Link></div>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <Trust>Free. Folio reads one public page and changes nothing on your site.</Trust>
    </form>
  </Screen>;

  if (step === 2 && check) {
    const top = check.fixes.slice(0, 3), rest = check.fixes.slice(3), worth = top.reduce((sum, fix) => sum + fix.gap, 0);
    return <Screen nav={nav} step={2} eyebrow={check.host} title={`Your page scores ${Math.round(check.seoScore)} out of 100.`} side={<div className="ob-card">
      <ScoreReveal score={check.seoScore} />
      <p className="ob-hint">Captured {date(check.createdAt)}</p>
      {top.length > 0 && <ol className="ob-rows" style={{ marginTop: 18 }} aria-label="Top fixes">{top.map(fix => <FixRow key={fix.id} fix={fix} />)}</ol>}
      {!top.length && check.passed?.length ? <ul className="ob-passed" aria-label="Passed checks">{check.passed.map(item => <li key={item.id}><span className="ob-step-dot" aria-hidden="true"><Tick /></span>{item.label}</li>)}</ul> : null}
      {rest.length > 0 && <details className="ob-more" open={showMore} onToggle={event => setShowMore((event.target as HTMLDetailsElement).open)}>
        <summary>{showMore ? "Hide" : "Show"} {plural(rest.length, "more check")}</summary><ol className="ob-rows">{rest.map(fix => <FixRow key={fix.id} fix={fix} />)}</ol></details>}
    </div>}>
      <p className="ob-lede">{check.fixes.length ? `${check.fixes.length} of ${check.scoredChecks} checks need work. ${top.length === 1 ? "One fix is" : `${top.length === 3 ? "Three" : "Two"} fixes are`} worth up to ${worth} points.` : `All ${check.scoredChecks} checks pass. Next, see who AI recommends for your customers.`}</p>
      <div className="ob-actions"><button className="ob-btn primary" type="button" onClick={() => setStep(signedIn ? 4 : 3)}>Save this report <Arrow /></button></div>
      <Trust>Based on the page HTML only. It does not measure search rank.</Trust>
    </Screen>;
  }

  if (step === 3 && check) {
    const social = async (provider: "google" | "github") => run(async () => {
      trackProductEvent("sign_in_requested",{method:provider});
      const result = await authClient.signIn.social({ provider, callbackURL: "/start?step=4", errorCallbackURL: "/start?step=3" });
      if (result.error) throw new Error(result.error.message ?? "Sign-in could not be completed.");
    });
    const primarySocial = providers.google ? "google" : providers.github ? "github" : null;
    return <Screen nav={nav} step={3} eyebrow="Save your report" title="Keep this report and track it over time." side={<div className="ob-card">
      <div className="ob-card-head"><span>Saved to your account</span><b>Private</b></div>
      <h2>{check.host}</h2>
      <div className="ob-score small" style={{ marginTop: 14 }}><b>{Math.round(check.seoScore)}</b><span>/ 100</span></div>
      <div className="ob-meter"><i style={{ width: `${check.seoScore}%` }} /></div>
      <p className="ob-note">Only you can see this report. Publishing to the public index stays off until you turn it on.</p>
    </div>}>
      {primarySocial && <div className="ob-social">
        <button type="button" className="ob-btn primary wide" disabled={busy} onClick={() => void social(primarySocial)}>Continue with {primarySocial === "google" ? "Google" : "GitHub"} <Arrow /></button>
        {providers.google && providers.github && <button type="button" className="ob-btn secondary wide" disabled={busy} onClick={() => void social("github")}>Continue with GitHub</button>}
      </div>}
      {primarySocial && <p className="ob-or">or use email</p>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        trackProductEvent("sign_in_requested",{method:"email"});
        const result = haveAccount ? await authClient.signIn.email({ email, password }) : await authClient.signUp.email({ email, password, name: email.split("@")[0].slice(0, 60) || "Folio user" });
        if (result.error) throw new Error(result.error.message ?? "The account could not be created.");
        trackProductEvent("sign_in_return_observed",{method:"email",result:"success"});
        const claimed = await api<{ siteId: string; check: Check }>("/api/onboarding/claim", { method: "POST", body: {} });
        trackProductEvent("onboarding_step_completed",{step:3,result:"success"});
        setSiteId(claimed.siteId);
        window.location.assign("/start?step=4");
      }); }}>
        <label className="ob-field">Email address<div className="ob-input"><input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" /></div></label>
        <label className="ob-field">Password<div className="ob-input"><input type="password" minLength={10} maxLength={128} autoComplete={haveAccount ? "current-password" : "new-password"} required value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 10 characters" /></div></label>
        <div className="ob-actions"><button type="submit" className={`ob-btn ${primarySocial ? "secondary" : "primary"}`} disabled={busy}>{busy ? "Saving…" : haveAccount ? "Sign in with email" : "Create account with email"}</button>
          <button type="button" className="ob-quiet" onClick={() => setHaveAccount(value => !value)}>{haveAccount ? "New to Folio? Create an account" : "I already have an account"}</button></div>
      </form>
      {(error || params.get("error")) && <p className="ob-error" role="alert">{error || "Sign-in could not be completed. Try email instead."}</p>}
      <Trust>Secure sign-in by Better Auth. No card needed.</Trust>
    </Screen>;
  }

  if (step === 4) {
    const groups = customerGroups.filter(value => value.trim());
    const audience = groups[0] ?? "", preview = websiteCustomerGroupDrafts(groups, task)[0];
    return <Screen nav={nav} step={4} onExit={exit} eyebrow="Your customers" title="Who should find you, and what do they need?" side={<div className="ob-card">
      <div className="ob-card-head"><span>Your first question</span><b>Updates as you type</b></div>
      {audience.trim() || task.trim()
        ? <p className="ob-quote"><QuestionPreview audience={audience} task={task} /></p>
        : <p className="ob-quote empty">Start typing and your first question appears here.</p>}
      <p className="ob-note">{groups.length > 1 ? `Preview for your first nonblank group. Folio drafts 10 questions across all ${groups.length} customer groups.` : "Folio drafts 10 questions like this. You pick which ones to track next."}</p>
      {starterPacks.length > 0 && <details className="ob-more" style={{ marginTop: 18 }}><summary>Use a starter pack instead</summary>
        <div className="ob-packs">{starterPacks.map(pack => <button key={pack.id} type="button" disabled={busy} onClick={() => {
          setDrafts(pack.questions); setChosen(pack.questions.map(() => true));
          setCandidates(pack.companies.filter(company => !check || !company.aliases.some(alias => alias.toLowerCase() === check.host)).slice(0, 5).map((company, index) => ({ ...company, source: "starter-pack", checked: index < 3 })));
          setStep(5);
        }}>{pack.name}<small>{plural(pack.questions.length, "question")}</small></button>)}</div></details>}
    </div>}>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        await api("/api/onboarding", { method: "PUT", body: { customerGroups: groups, task }, signal: requests.current?.signal });
        if (requests.current?.signal.aborted) return;
        trackProductEvent("onboarding_step_completed", {step:4,result:"success"});
        setCustomerGroups(groups); applyDrafts(groups, task); setStep(5);
      }); }}>
        <fieldset className="ob-customer-groups" disabled={busy}>
          <legend>Customer group(s)</legend>
          <div className="ob-group-list">{customerGroups.map((value, index) => <div className="ob-input ob-group-input" key={index}>
            <textarea rows={1} className="ob-audience" ref={element => { groupInputs.current[index] = element; }} aria-label={`Customer group ${index + 1}`} required={index === 0 && !groups.length} value={value} onChange={event => setCustomerGroups(values => values.map((item, at) => at === index ? event.target.value : item))} placeholder={index === 0 ? "small design teams" : "Another customer group"} />
            {customerGroups.length > 1 && <button className="ob-group-remove" type="button" aria-label={`Remove customer group ${index + 1}`} onClick={() => {
              pendingGroupFocus.current = Math.min(index, customerGroups.length - 2);
              setCustomerGroups(values => values.filter((_, at) => at !== index));
            }}><X size={14} strokeWidth={3} aria-hidden="true" /></button>}
          </div>)}</div>
          <div className="ob-group-action">{customerGroups.length < MAX_CUSTOMER_GROUPS
            ? <button type="button" className="ob-group-add" onClick={() => {
              pendingGroupFocus.current = customerGroups.length;
              setCustomerGroups(values => values.length < MAX_CUSTOMER_GROUPS ? [...values, ""] : values);
            }}>+ Add more</button>
            : <p role="status">Max customer groups added.</p>}</div>
          {check?.suggestion.audience && customerGroups.length === 1 && audience === check.suggestion.audience && <span className="ob-hint">Suggested from your page. Edit if it is wrong.</span>}
        </fieldset>
        <label className="ob-field">What they want to do<div className="ob-input"><input required maxLength={120} value={task} onChange={event => setTask(event.target.value)} placeholder="collect feedback on prototypes" /></div>
          {check?.suggestion.task && task === check.suggestion.task && <span className="ob-hint">Suggested from your page. Edit if it is wrong.</span>}</label>
        <div className="ob-actions"><button className="ob-btn primary" type="submit" disabled={busy || !preview}>Draft my questions <Arrow /></button></div>
        {error && <p className="ob-error" role="alert">{error}</p>}
        <Trust>Drafts come from your words. No AI call and no cost.</Trust>
      </form>
    </Screen>;
  }

  if (step === 5) {
    const selected = drafts.filter((_, index) => chosen[index]);
    return <Screen nav={nav} step={5} onExit={exit} eyebrow="Questions to track" title="Pick the questions your buyers ask." side={<div className="ob-card">
      <div className="ob-card-head"><span>{selected.length} of {drafts.length} selected</span><b>{LANGUAGE}, {LOCALE}</b></div>
      <QuestionList questions={drafts} chosen={chosen} onToggle={index => setChosen(value => value.map((item, i) => i === index ? !item : item))} />
    </div>}>
      <p className="ob-lede">{drafts.length > 5 ? "We picked the 5 closest to a buying decision. Fewer, sharper questions give clearer results." : "Keep the questions that sound like your buyers."}</p>
      <details className="ob-more" open={drafts.some(question => question.length > QUESTION_SUITE_MAX_QUESTION_LENGTH)}>
        <summary>Edit question wording</summary>
        <p className="ob-note">Each saved question can contain up to {QUESTION_SUITE_MAX_QUESTION_LENGTH} characters, and the suite must fit within 4 KB. Editing a question does not shorten your saved customer description.</p>
        {drafts.map((question, index) => <label className="ob-field" key={index}>Question {index + 1}<div className="ob-input"><textarea rows={3} value={question} disabled={busy} onChange={event => setDrafts(values => values.map((value, i) => i === index ? event.target.value : value))} /></div><span className="ob-hint">{question.length} / {QUESTION_SUITE_MAX_QUESTION_LENGTH} characters</span></label>)}
      </details>
      <div className="ob-actions"><button className="ob-btn primary" type="button" disabled={busy || !selected.length || !siteId} onClick={() => void run(async () => {
        const { suite: saved } = await api<{ suite: { id: string; cases: { id: string; query: string }[] } }>("/api/benchmarks", { method: "POST", body: { name: `${check?.host ?? "Website"} buyer questions`, websiteId: siteId, questions: selected, language: LANGUAGE, locale: LOCALE } });
        await api("/api/onboarding", { method: "PUT", body: { suiteId: saved.id } });
        trackProductEvent("onboarding_step_completed", {step:5,result:"success"});
        setSuite({ id: saved.id, cases: saved.cases.map(item => ({ id: item.id, query: item.query })) }); setStep(6);
      })}>Save {plural(selected.length, "question")} <Arrow /></button></div>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <Trust>Saving starts no search. You choose when to run.</Trust>
    </Screen>;
  }

  if (step === 6) {
    const picked = candidates.filter(item => item.checked);
    const target = check?.competitors.rows.find(row => row.isTarget);
    const fromIndex = candidates.some(item => item.source === "public-index");
    const allNamed = fromIndex && check ? [...candidates.filter(item => item.source === "public-index"), ...(target ? [target] : [])].every(item => {
      const row = check.competitors.rows.find(value => value.name === item.name); return row && row.namedInQuestion >= row.answers;
    }) : false;
    const draftName = newName.trim(), draftAliases = newAliases.split(",").map(value => value.trim()).filter(Boolean);
    const ghost = (adding || !candidates.length) && draftName && !candidates.some(item => item.name.toLowerCase() === draftName.toLowerCase())
      ? <tr className="ob-ghost" aria-hidden="true"><td style={{ width: 34 }}><span className="ob-box" /></td><td><strong>{draftName}</strong><small className="ob-website">{websiteOf({ aliases: draftAliases })}</small></td><td /></tr> : null;
    return <Screen nav={nav} step={6} onExit={exit} eyebrow="Competitors" title={fromIndex ? "Here is who AI already recommends." : "Who do you want to watch?"} side={<div className="ob-card">
      {fromIndex && check && <div className="ob-card-head"><span>{plural(check.competitors.totalAnswers, "saved answer")}</span><b>Avg. position</b></div>}
      {candidates.length > 0 ? <table className="ob-tbl"><tbody>
        {candidates.map((item, index) => <tr key={item.name}><td style={{ width: 34 }}><label className="ob-check"><input type="checkbox" aria-label={`Track ${item.name}`} checked={item.checked} onChange={() => setCandidates(list => list.map((value, i) => i === index ? { ...value, checked: !value.checked } : value))} /><span className="ob-box"><Tick /></span></label></td>
          <td><strong>{item.name}</strong><small className="ob-website">{websiteOf(item)}</small>{item.answers !== undefined && <small>{item.answers} of {item.totalAnswers} answers</small>}</td>
          <td className="num">{item.averagePosition !== undefined && <span className="ob-pill">{item.averagePosition.toFixed(1)}</span>}</td></tr>)}
        {ghost}
        {target && <tr><td /><td><strong>{target.name}</strong><span className="ob-you">You</span><small className="ob-website">{websiteOf(target)}</small><small>{target.answers} of {target.totalAnswers} answers</small></td><td className="num"><span className="ob-pill neutral">{target.averagePosition.toFixed(1)}</span></td></tr>}
      </tbody></table> : <>
        <div className="ob-card-head"><span>Not in the Folio index yet</span><b>{check?.host ?? "Your website"}</b></div>
        <p className="ob-note" style={{ marginTop: 0 }}>No saved public answers mention {check?.host ?? "your website"} yet. Name the companies you compete with, and Folio will look for them in your answers.</p>
        {ghost && <table className="ob-tbl" style={{ marginTop: 10 }}><tbody>{ghost}</tbody></table>}
      </>}
      {fromIndex && <p className="ob-note">{allNamed ? `These public questions named all ${candidates.filter(item => item.source === "public-index").length + (target ? 1 : 0)} products, so being listed is expected. Your own questions do not name anyone.` : "These are public examples, not results for your website. A lower average position means an earlier place in the returned lists."}</p>}
      {adding || !candidates.length ? <form className="ob-add" onSubmit={event => { event.preventDefault(); const name = newName.trim(); if (!name || candidates.some(item => item.name.toLowerCase() === name.toLowerCase())) return;
        setCandidates(list => [...list, { name, aliases: newAliases.split(",").map(value => value.trim()).filter(Boolean), source: "manual", checked: true }]); setNewName(""); setNewAliases(""); setAdding(false); }}>
        <label className="ob-field" style={{ marginTop: 0 }}>Company name<div className="ob-input"><input autoFocus={adding} required maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} placeholder="Acme" /></div></label>
        <label className="ob-field">Other names (optional)<div className="ob-input"><input maxLength={200} value={newAliases} onChange={event => setNewAliases(event.target.value)} placeholder="Acme Cloud, acme.com" /></div><span className="ob-hint">Separate with commas. Folio counts any of these as the same company.</span></label>
        <div className="ob-actions" style={{ marginTop: 6 }}><button type="submit" className="ob-btn secondary">Add</button>{candidates.length > 0 && <button type="button" className="ob-quiet" onClick={() => setAdding(false)}>Cancel</button>}</div>
      </form> : null}
      {!candidates.length && starterPacks.length > 0 && <div className="ob-start-from"><p className="ob-hint">Or start from a category</p>
        <div className="ob-chips">{starterPacks.map(pack => <button key={pack.id} type="button" onClick={() => setCandidates(pack.companies.filter(company => !check || !company.aliases.some(alias => alias.toLowerCase() === check.host)).slice(0, 5).map((company, index) => ({ ...company, source: "starter-pack", checked: index < 3 })))}>
          {pack.name.replace(/\s*·.*$/, "").replace(/ discovery$/i, "")}<small>{pack.companies.slice(0, 3).map(company => company.name).join(", ")}</small></button>)}</div></div>}
    </div>}>
      <p className="ob-lede">{fromIndex && check?.competitors.category ? `From the public Folio index for ${check.competitors.category.toLowerCase()}. Track them to see where they appear and you do not.` : "Track up to 10 companies. Folio looks for them, and any other names you add, in every saved answer."}</p>
      <div className="ob-actions"><button className="ob-btn primary" type="button" disabled={busy || !siteId || !candidates.length} onClick={() => void run(async () => {
        await api("/api/competitors", { method: "PUT", body: { siteId, competitors: picked.map(item => ({ name: item.name, aliases: item.aliases, source: item.source, domain: competitorWebsite(item) })) } });
        trackProductEvent("onboarding_step_completed", {step:6,result:"success"});
        setStep(7);
      })}>{picked.length ? `Track ${plural(picked.length, "competitor")}` : candidates.length ? "Continue without competitors" : "Track competitors"} <Arrow /></button>
        {!adding && candidates.length > 0 && candidates.length < 10 && <button type="button" className="ob-quiet" onClick={() => setAdding(true)}>Add another</button>}
        {!candidates.length && <button type="button" className="ob-quiet" disabled={busy || !siteId} onClick={() => void run(async () => {
          await api("/api/competitors", { method: "PUT", body: { siteId, competitors: [] } }); setStep(7);
        })}>Skip for now</button>}</div>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <Trust>You can change this list any time.</Trust>
    </Screen>;
  }

  if (step === 7) {
    const count = suite?.cases.length ?? 0, canRun = access?.canRun === true;
    return <Screen nav={nav} step={7} onExit={exit} eyebrow="First baseline" title={`Ask AI your ${plural(count, "question")} now.`} side={<div className="ob-card">
      <div className="ob-card-head"><span>What runs</span><b>GPT-6.0 Astra</b></div>
      <div className="ob-sum"><div><b>{count}</b><span>{count === 1 ? "question" : "questions"}</span></div><div><b>{candidates.filter(item => item.checked).length}</b><span>competitors</span></div><div><b>{check ? 1 : 0}</b><span>page check</span></div></div>
      <p className="ob-note" style={{ marginTop: 18 }}>{access ? access.message : "Checking your run access…"}</p>
      {access && !canRun && <p className="ob-note">Your questions and competitors are saved. Start the baseline from Evaluations once runs are enabled for this account.</p>}
    </div>}>
      <p className="ob-lede">Astra researches each question with live web search and saves the returned order, names and sources.</p>
      <div className="ob-actions">
        {canRun ? <button className="ob-btn primary" type="button" disabled={busy || !count} onClick={() => void run(async () => {
          await api("/api/onboarding", { method: "PUT", body: { baselineRequested: true } });
          trackProductEvent("onboarding_step_completed", {step:7,result:"success"});
          setBaselineRequested(true); setStep(8);
        })}>Start baseline <Arrow /></button>
          : <button className="ob-btn primary" type="button" disabled={!access} onClick={() => setStep(8)}>Continue <Arrow /></button>}
        {canRun && <button type="button" className="ob-quiet" onClick={() => setStep(8)}>Run later</button>}
      </div>
      {error && <p className="ob-error" role="alert">{error}</p>}
      <Trust>{canRun ? "Uses evaluation credits. You can cancel while it runs." : "Nothing runs and nothing is charged until runs are enabled."}</Trust>
    </Screen>;
  }

  // Step 8: optional Search Console while the baseline runs.
  const finish = async (skipped: boolean) => { await api("/api/onboarding", { method: "PUT", body: skipped ? { searchConsoleSkipped: true, completed: true } : { completed: true } });trackProductEvent("onboarding_step_completed",{step:8,result:"success"}); };
  return <Screen nav={nav} step={8} eyebrow={baselineRequested ? "While your baseline runs" : "One more thing"} title="Add your real Google clicks." side={<div className="ob-card">
    <div className="ob-card-head"><span>Baseline</span><b>{!baselineRequested ? "Not started" : queue.saved === (suite?.cases.length ?? 0) && queue.saved > 0 ? "Complete" : queue.active ? "Running" : "Queued"}</b></div>
    {suite?.cases.length ? <BaselineProgress rows={queue.rows} error={queue.error} /> : <p className="ob-note">No questions saved yet.</p>}
    {baselineRequested && <p className="ob-note">One question runs at a time while Folio is open. Cancel any run from Evaluations.</p>}
  </div>}>
    <p className="ob-lede">Connect Search Console to see which queries already bring people to {check?.host ?? "your website"}, next to what AI says.</p>
    <div className="ob-actions">
      {providers.google && !scConnected ? <button className="ob-btn primary" type="button" disabled={busy} onClick={() => void run(async () => {
        await finish(false);
        const result = await authClient.linkSocial({ provider: "google", scopes: ["https://www.googleapis.com/auth/webmasters.readonly"], callbackURL: "/api/search-console/finish", additionalParams: { prompt: "consent", access_type: "offline" } });
        if (result.error) throw new Error(result.error.message ?? "Google could not be connected.");
      })}>Connect Search Console <Arrow /></button>
        : <button className="ob-btn primary" type="button" disabled={busy} onClick={() => void run(async () => { await finish(!scConnected); router.push("/websites"); })}>Go to my workspace <Arrow /></button>}
      {providers.google && !scConnected && <button type="button" className="ob-quiet" disabled={busy} onClick={() => void run(async () => { await finish(true); router.push("/websites"); })}>Skip for now</button>}
    </div>
    {error && <p className="ob-error" role="alert">{error}</p>}
    <Trust>{scConnected ? "Search Console is already connected." : providers.google ? "Read-only. Folio never changes your Google settings. Disconnect any time." : "Search Console sign-in is not configured on this server yet."}</Trust>
  </Screen>;
}

function QuestionList({ questions, chosen, onToggle }: { questions: string[]; chosen: boolean[]; onToggle: (index: number) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLFieldSetElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const updateOverflow = useCallback(() => {
    const node = viewport.current;
    if (node) setMoreBelow(node.scrollHeight - node.scrollTop - node.clientHeight > 1);
  }, []);

  useLayoutEffect(() => {
    const node = viewport.current, content = list.current;
    if (!node || !content) return;
    const resize = () => {
      const rows = Array.from(content.querySelectorAll<HTMLElement>(".ob-check"));
      // Preserve the collapsed panel: seven rows plus the former control's space.
      // Measure again on wrapping/font changes, never on selection or scrolling.
      const height = rows.slice(0, 7).reduce((sum, row) => sum + row.getBoundingClientRect().height, 0)
        + (rows.length > 7 ? 30.25 : 0);
      node.style.height = `${Math.ceil(height)}px`;
      updateOverflow();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    return () => observer.disconnect();
  }, [questions, updateOverflow]);

  return <div className="ob-question-window" data-more-below={moreBelow}>
    <div className="ob-question-scroll" ref={viewport} role="region" aria-label="Available questions" tabIndex={0} onScroll={updateOverflow}
      onFocusCapture={event => { if (event.target instanceof HTMLInputElement) event.target.closest("label")?.scrollIntoView({ block: "nearest" }); }}>
      <fieldset ref={list} className="ob-qlist" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><legend className="ob-hint" style={{ position: "absolute", left: -9999 }}>Questions</legend>
        {questions.map((question, index) => <label className="ob-check" key={question}><input type="checkbox" checked={Boolean(chosen[index])} onChange={() => onToggle(index)} /><span className="ob-box"><Tick /></span><span>{question}</span></label>)}
      </fieldset>
    </div>
  </div>;
}

/** Counts 0 → score on the meter's curve. Reduced motion shows the final value at once. */
function useCountUp(target: number, ms = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; }
    let frame = 0; const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

function ScoreReveal({ score }: { score: number }) {
  const final = Math.round(score), shown = useCountUp(final);
  return <>
    <div className="ob-score" role="img" aria-label={`${final} out of 100`}><b aria-hidden="true">{shown}</b><span aria-hidden="true">/ 100</span></div>
    <div className="ob-meter reveal"><i style={{ width: `${score}%` }} /></div>
  </>;
}

const WHO = "\uE000", NEED = "\uE001";
/** First draft question while typing: the owner's words highlighted, a labelled blank for whatever is still empty. */
function QuestionPreview({ audience, task }: { audience: string; task: string }) {
  const who = audience.trim(), need = task.trim();
  const text = websiteQuestionDrafts(WHO, need || NEED)[0] ?? "";
  return <>{text.split(new RegExp(`(${WHO}|${NEED})`)).map((part, index) => {
    if (part === WHO) return who ? <mark key={index} className="ob-fill">{who}</mark> : <span key={index} className="ob-slot">your customers</span>;
    if (part === NEED) return <span key={index} className="ob-slot">what they want to do</span>;
    const at = need ? part.indexOf(need) : -1;
    return at < 0 ? part : <span key={index}>{part.slice(0, at)}<mark className="ob-fill">{need}</mark>{part.slice(at + need.length)}</span>;
  })}</>;
}

function FixRow({ fix }: { fix: Fix }) {
  const detail = fix.detail.replace(/\s*This does not change the HTML score\.?/, "").trim();
  return <li><div className="ob-grow"><strong>{fix.label}</strong>{detail && <small>{detail}</small>}</div><span className="ob-pts">{fix.points} / {fix.maxPoints}</span></li>;
}

/** The address as typed, shown as a valid host (and path) or null while it is still incomplete. */
function previewHost(input: string) {
  const value = input.trim().replace(/^https?:\/\//i, "");
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(`https://${value}`), host = url.hostname.replace(/^www\./, "");
    return /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(host) ? host + (url.pathname === "/" ? "" : url.pathname) : null;
  } catch { return null; }
}

/** Step 1 side card once typing starts: the report this address will get, before any request is made. */
function LivePreview({ input, checking }: { input: string; checking: boolean }) {
  const host = previewHost(input);
  return <div className="ob-card ob-live" data-checking={checking || undefined} aria-live="polite">
    <div className="ob-card-head"><span>{checking ? "Checking your page…" : "Your free check"}</span><b>Private</b></div>
    <h2 className="ob-live-host"><span aria-hidden="true">https://</span>{host ?? input.trim()}</h2>
    <p className={`ob-hint ob-live-state${host ? " ready" : ""}`}>{checking ? "Reading the page now. This takes a few seconds." : host ? "Ready to check. Folio reads this one public page." : "Keep typing a domain, like yourwebsite.com"}</p>
    <div className="ob-score small pending" aria-hidden="true"><b>—</b><span>/ 100</span></div>
    <div className="ob-meter pending"><i /></div>
    <ul className="ob-passed ob-pending" aria-label="Checks Folio will run">{evaluationMethodology.weights.map(check => <li key={check.id}><span className="ob-step-dot" aria-hidden="true" />{check.label}<small>{check.weight} pts</small></li>)}</ul>
  </div>;
}

function ProofCard({ proof }: { proof: OnboardingProof | null }) {
  if (!proof) return null;
  return <div className="ob-backdrop"><WorkspaceEmptyArt/><div className="ob-card">
    <div className="ob-card-head"><span>Example · saved public results</span></div>
    <h2>Who AI recommended</h2><p className="ob-hint" style={{ marginTop: 6 }}>{proof.category} · {plural(proof.totalAnswers, "saved answer")}</p>
    <div className="ob-proof-columns"><span>Website</span><span>Avg. position</span></div>
    <ol className="ob-rows">{proof.rows.map(row => <li key={row.name}><CompanyFavicon name={row.name} url={DEVELOPER_TOOLS.find(tool=>tool.name===row.name)?.websiteUrl ?? null}/><div className="ob-grow"><strong>{row.name}</strong><small>Listed in {row.answers} of {row.totalAnswers} answers</small></div><span className="ob-pill">{row.averagePosition.toFixed(1)}</span></li>)}</ol>
    <p className="ob-note">These are public examples, not results for your website. A lower average position means an earlier place in the returned lists.</p>
    <p className="ob-proof-date">Recorded {dateRange(proof.firstObservedAt, proof.lastObservedAt)}</p>
    <Link className="ob-proof-link" href="/leaderboard?landscapeAudience=Developer+tools">Explore public results <Arrow /></Link>
  </div></div>;
}
