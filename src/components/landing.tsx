import Link from "next/link";
import Image from "next/image";
import { LandingWorkflow, LandingSound } from "./landing-interactions";
import { ArrowUpRight } from "lucide-react";
import { LandingPageReport } from "./landing-page-report";
import { RankedSearchTable } from "./ranked-search-table";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import "./landing.css";
import { UiButton } from "./ui/primitives";

function Mark() {
  return <span className="folio-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}

export function Landing() {
  const reportCount = evaluationBatch.results.filter(result => result.captureKind === "public-homepage" && result.status === "complete").length;
  return <div className="landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-nav">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <nav aria-label="Website navigation">
        <a href="#sample-report">Results</a>
        <a href="#how-it-works">How it works</a>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <LandingSound />
      <Link className="landing-signin" href="/login">Sign in <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </header>

    <main id="main-content">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>See which competitors <span>AI recommends.</span></h1>
          <p className="landing-hero-description">Your customers ask. AI answers. Find out where you stand.</p>
          <div className="landing-actions">
            <UiButton asChild className="button primary"><Link href="/start">Evaluate your website <ArrowUpRight size={16} aria-hidden="true" /></Link></UiButton>
            <Link href="/leaderboard">See real results</Link>
          </div>
          <p className="landing-access">You choose when to start a run.</p>
        </div>
        <figure className="landing-art">
          <Image src="/images/folio-dune-hero.webp" alt="A dark sculptural dune beneath a small orange sun on warm paper" width={1024} height={1280} priority sizes="(max-width: 700px) 100vw, 42vw" />
          <figcaption><span>A little perspective.</span><span>Folio / 01</span></figcaption>
        </figure>
      </section>
      <LandingWorkflow />

      <section className="landing-report-section" id="sample-report" aria-labelledby="report-heading">
        <div className="landing-section-heading">
          <div>
            <h2 id="report-heading">Evidence, not guesswork.</h2>
            <p>Real questions. Returned recommendations. Sources attached.</p>
          </div>
          <Link href="/leaderboard">Browse rankings <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        <p className="landing-method-note">One answer per exact question. Position is the order the agent returned, not a score.</p>
        <h3 className="sr-only">Returned recommendations</h3>
        <RankedSearchTable compact />
        <details className="landing-technical-report">
          <summary>HTML page checks for {reportCount} measured websites</summary>
          <p>Open a saved page report to inspect technical findings alongside the search observations.</p>
          <LandingPageReport />
        </details>
      </section>

      <section className="landing-explainer" aria-labelledby="details-heading">
        <h2 id="details-heading">The finer details.</h2>
        <div className="landing-faq">
          <details>
            <summary>What does a ranking mean?</summary>
            <p>It records a website’s position in one returned recommendation list for the displayed question, model, and date. Open the cited sources to inspect the answer. A later run can return a different list.</p>
          </details>
          <details>
            <summary>What does a page score tell me?</summary>
            <p>It records ten checks against captured HTML: titles, descriptions, headings, links, indexing instructions, readable text, and structured data. It does not measure search rank, product quality, or whether someone can finish a purchase.</p>
          </details>
          <details>
            <summary>How do the agent evaluations work?</summary>
            <p>A managed agent answers bounded questions from captured evidence. Folio checks its output and compares product and pricing answers with reference values you provide. Missing references stay visible, and each returned quote can be inspected in its source.</p>
          </details>
          <details>
            <summary>What happens after I find a problem?</summary>
            <p>Review technical repair suggestions and download the changes you choose. Once your team publishes a change, start a fresh evaluation and compare the saved results.</p>
          </details>
        </div>
      </section>

      <section className="landing-next">
        <div><h2>See your website in a new light.</h2><p>Start with one question.</p></div>
        <UiButton asChild className="button primary"><Link href="/start">Evaluate your website <ArrowUpRight size={16} aria-hidden="true" /></Link></UiButton>
      </section>
    </main>

    <footer className="landing-footer">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <p>Website checks, with the evidence attached.</p>
      <nav aria-label="Footer navigation"><Link href="/privacy">Privacy</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign in</Link></nav>
    </footer>
  </div>;
}
