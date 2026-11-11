import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "@/components/icons";
import "./overview-setup-guide.css";

type Props = {
  website?: { id: string; url: string };
  state: "loading" | "error" | "ready";
  questions: number;
  answers: number;
  activeHref?: string;
  reviewHref?: string;
  answerHref?: string;
  onRetry: () => void;
};

/** Guidance uses owned, loaded records; links only prepare or reopen work. */
export function OverviewSetupGuide({ website, state, questions, answers, activeHref, reviewHref, answerHref, onRetry }: Props) {
  const phase = !website ? 0 : questions ? 2 : 1;
  const ready = state === "ready";
  const title = state === "loading" ? "Finding your next step…" : state === "error" ? "Let’s reconnect your saved results." : !website ? "Start with your website." : activeHref ? "Your search is in progress." : reviewHref ? "A search needs your attention." : answers ? "Your answers are ready to explore." : questions ? "Collect answers for your questions." : "Choose what your customers would ask.";
  const description = !website ? "Add your website, choose a few customer questions, then see which websites appear in the answers." : activeHref ? "Open the saved search to check its status. Your existing answers stay available below." : reviewHref ? "Review the saved attempt before deciding what to do next." : answers ? "Open an answer to see whether your website appeared and which sources were cited." : questions ? "Review your questions and run settings, then confirm when you’re ready to collect answers." : "Save the questions you want to investigate for this website. You can edit them before running a search.";
  const href = !website ? "/start" : activeHref ?? reviewHref ?? answerHref ?? `/benchmarks?website=${encodeURIComponent(website.id)}`;
  const action = !website ? "Set up my website" : activeHref ? "View search progress" : reviewHref ? "Review search attempt" : answerHref ? "Review latest answer" : questions ? "Review and run questions" : "Choose my questions";
  const steps = ["Add your website", "Choose questions", answers ? "Review answers" : "Collect answers"];
  return <section className="overview-setup" aria-label="Website setup and next step" aria-busy={state === "loading"}>
    <div className="overview-setup-copy">
      <span className="overview-data-label"><ShieldCheck size={14} aria-hidden="true"/>Your workspace · Private</span>
      <h2>{title}</h2>
      <p>{state === "error" ? "Some saved data couldn’t be loaded. Retry before making changes; missing data doesn’t mean you need to start over." : description}</p>
      <div className="overview-setup-actions">
        {ready && <Link className="button primary squishy-control" href={href}>{action}<ArrowRight size={15} aria-hidden="true"/></Link>}
        {state === "error" && <button className="button secondary squishy-control" onClick={onRetry}>Retry saved setup</button>}
        <Link href="/overview?view=demo">Explore the sample demo <ArrowRight size={13} aria-hidden="true"/></Link>
      </div>
      <small>{!website ? "The first step is a free page check. You choose what to save and run." : ready && !answers && !activeHref && !reviewHref ? "Opening setup starts no search. Running a search requires confirmation and may use paid provider credits." : "Your results below come from saved checks and answers for the selected website."}</small>
    </div>
    <ol className="overview-setup-steps" aria-label="Website setup steps">
      {steps.map((label, index) => {
        const done = ready && (index < phase || index === 2 && answers > 0);
        const current = ready && !done && index === phase;
        return <li key={index} data-step-state={done ? "done" : current ? "next" : "waiting"} aria-current={current ? "step" : undefined}>
          <span className="overview-step-number">{done ? <Check size={15} aria-hidden="true"/> : index + 1}</span>
          <div><strong>{label}</strong><span>{!ready ? state === "error" ? "Unavailable" : "Checking saved setup" : done ? "Done" : current ? activeHref ? "In progress" : reviewHref ? "Needs attention" : "Next step" : "Coming next"}</span></div>
        </li>;
      })}
    </ol>
  </section>;
}

export function OverviewDemoNotice() {
  return <section className="overview-demo-notice" aria-label="Sample data notice">
    <div><span className="overview-data-label">Demo · Sample data</span><h2>A sample dashboard to explore.</h2><p>Every chart and number in this demo is illustrative. Your own results appear only after you save a website and collect evidence.</p></div>
    <Link className="button primary squishy-control" href="/start">Set up my website<ArrowRight size={15} aria-hidden="true"/></Link>
  </section>;
}
