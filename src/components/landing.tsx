import { LivePublicIndex } from "./live-public-index";
import Link from "next/link";
import { LandingMotion, LandingSound } from "./landing-interactions";
import { LandingIndexSize } from "./landing-index-size";
import { AskSketch, DunePoster, FinePrintSketch, ImproveSketch, InkArrow, InkMark, InkPlus, InkUnderline, InspectSketch, StoryArrow, SunriseSketch } from "./landing-sketches";
import { LandingPageReport } from "./landing-page-report";
import { RankedSearchTable } from "./ranked-search-table";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import "./landing.css";
import "./landing-sketch.css";
import { UiButton } from "./ui/primitives";

const STEPS = [
  { label: "01 / Ask", title: "Ask a question.", body: "Start with what your customers want to know.", Sketch: AskSketch },
  { label: "02 / Inspect", title: "Follow the evidence.", body: "See who appears. Read the sources behind the answer.", Sketch: InspectSketch },
  { label: "03 / Improve", title: "Find your next move.", body: "Review your pages, make a change, then check again.", Sketch: ImproveSketch },
];
const FAQ = [
  { question: "What does a ranking mean?", answer: "It records a website’s position in one returned recommendation list for the displayed question, model, and date. Open the cited sources to inspect the answer. A later run can return a different list." },
  { question: "What does a page score tell me?", answer: "It records ten checks against captured HTML: titles, descriptions, headings, links, indexing instructions, readable text, and structured data. It does not measure search rank, product quality, or whether someone can finish a purchase." },
  { question: "How do the agent evaluations work?", answer: "A managed agent answers bounded questions from captured evidence. Folio checks its output and compares product and pricing answers with reference values you provide. Missing references stay visible, and each returned quote can be inspected in its source." },
  { question: "What happens after I find a problem?", answer: "Review technical repair suggestions and download the changes you choose. Once your team publishes a change, start a fresh evaluation and compare the saved results." },
];

export function Landing() {
  const reportCount = evaluationBatch.results.filter(result => result.captureKind === "public-homepage" && result.status === "complete").length;
  return <div className="landing landing-drawn">
    {/* Without scripts nothing marks a drawing as in view, so show every stroke complete. */}
    <noscript><style>{".landing-drawn .sk-draw,.landing-drawn .sk-pop{stroke-dashoffset:0!important;opacity:1!important}.landing-drawn .sk-rise{transform:none!important}"}</style></noscript>
    <LandingMotion />
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-nav" data-reveal>
      <Link href="/" className="wordmark" aria-label="Folio home"><InkMark /><span>folio.</span></Link>
      <nav aria-label="Website navigation">
        <a href="#sample-report">Results</a>
        <a href="#how-it-works">How it works</a>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <LandingSound />
      <Link className="landing-signin" href="/login">Sign in <InkArrow size={15} /></Link>
    </header>

    <main id="main-content">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>See which competitors <span className="landing-underlined" data-reveal>AI recommends.<InkUnderline /></span></h1>
          <p className="landing-hero-description">Your customers ask. AI answers. Find out where you stand.</p>
          <div className="landing-actions">
            <UiButton asChild className="button primary squishy-control"><Link href="/start">Evaluate your website <InkArrow /></Link></UiButton>
            <UiButton asChild variant="secondary" className="button secondary squishy-control"><Link href="/leaderboard">See real results <InkArrow /></Link></UiButton>
          </div>
          <p className="landing-access">You choose when to start a run.</p>
          <LandingIndexSize />
        </div>
        <figure className="landing-art" data-reveal>
          <DunePoster />
          <figcaption><span>A little perspective.</span><span>Folio / 01</span></figcaption>
        </figure>
      </section>

      <section className="landing-workflow landing-story" id="how-it-works" aria-labelledby="workflow-heading">
        <div className="landing-story-intro"><h2 id="workflow-heading">Less noise.<br />More direction.</h2><p>One question at a time.</p></div>
        <ol className="landing-story-steps">
          {STEPS.map(({ label, title, body, Sketch }, index) => <li key={label} data-reveal>
            <div className="landing-story-frame"><Sketch />{index < STEPS.length - 1 && <StoryArrow />}</div>
            <span className="landing-step-label">{label}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>)}
        </ol>
        <p className="landing-workflow-note">Each run is a snapshot. A changed answer does not prove an edit caused it.</p>
      </section>

      <section className="landing-report-section" id="sample-report" aria-labelledby="report-heading">
        <div className="landing-section-heading">
          <div>
            <h2 id="report-heading"><span className="landing-underlined" data-reveal>Evidence<InkUnderline /></span>, not guesswork.</h2>
            <p>Real questions. Returned recommendations. Sources attached.</p>
          </div>
          <Link href="/leaderboard">Browse rankings <InkArrow size={15} /></Link>
        </div>
        <p className="landing-method-note">One answer per exact question. Position is the order the agent returned, not a score.</p>
        <h3 className="sr-only">Returned recommendations</h3>
        <LivePublicIndex><RankedSearchTable compact /></LivePublicIndex>
        <details className="landing-technical-report">
          <summary>HTML page checks for {reportCount} measured websites</summary>
          <p>Open a saved page report to inspect technical findings alongside the search observations.</p>
          <LandingPageReport />
        </details>
      </section>

      <section className="landing-explainer" aria-labelledby="details-heading">
        <div className="landing-explainer-intro" data-reveal><h2 id="details-heading">The finer details.</h2><FinePrintSketch /></div>
        <div className="landing-faq">
          {FAQ.map(item => <details key={item.question}>
            <summary><span>{item.question}</span><InkPlus /></summary>
            <p>{item.answer}</p>
          </details>)}
        </div>
      </section>

      <section className="landing-next" data-reveal>
        <div><h2>See your website in a new light.</h2><p>Start with one question.</p></div>
        <SunriseSketch />
        <UiButton asChild className="button primary squishy-control"><Link href="/start">Evaluate your website <InkArrow /></Link></UiButton>
      </section>
    </main>

    <footer className="landing-footer">
      <Link href="/" className="wordmark" aria-label="Folio home"><InkMark size={22} /><span>folio.</span></Link>
      <p>Website checks, with the evidence attached.</p>
      <nav aria-label="Footer navigation"><Link href="/privacy">Privacy</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign in</Link></nav>
    </footer>
  </div>;
}
