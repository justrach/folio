import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LandingPageReport } from "./landing-page-report";
import { RankedSearchTable } from "./ranked-search-table";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import "./landing.css";

function Mark() {
  return <span className="folio-mark" aria-hidden="true"><i /><i /><i /><i /></span>;
}

const questions = [
  ["Software & work", "Which plan includes what I need?"],
  ["Shops & brands", "What are the shipping and return terms?"],
  ["Services & travel", "Where is this available, and how do I book?"],
  ["Learning", "What will I learn, and what are the prerequisites?"],
  ["Developer tools", "How do I get an integration working?"],
];

export function Landing() {
  const reportCount = evaluationBatch.results.filter(result => result.captureKind === "public-homepage" && result.status === "complete").length;
  return <div className="landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-nav">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <nav aria-label="Website navigation">
        <a href="#sample-report">Rankings</a>
        <a href="#evaluation-suites">Use cases</a>
        <Link href="/leaderboard">The index</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <Link className="landing-signin" href="/login">Sign in <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </header>

    <main id="main-content">
      <section className="landing-hero">
        <h1>Put your website<br />to the test.</h1>
        <div className="landing-intro">
          <p>See which websites Astra recommends for a question. Inspect its sources, check your page, and compare a fresh result after you make a change.</p>
          <div className="landing-actions">
            <Link href="/overview" className="button primary">Open your workspace <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <a href="#sample-report">See the rankings</a>
          </div>
          <p className="landing-access">Sign in to run evaluations. Saved public observations are open to browse.</p>
        </div>
      </section>

      <section className="landing-report-section" id="sample-report" aria-labelledby="report-heading">
        <div className="landing-section-heading">
          <div>
            <h2 id="report-heading">See who gets recommended.</h2>
            <p>Choose a question to compare the websites returned by Astra with web search.</p>
          </div>
          <Link href="/leaderboard">Browse rankings <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
        <RankedSearchTable compact />
        <details className="landing-technical-report">
          <summary>HTML page checks for {reportCount} websites</summary>
          <p>Open a saved page report to inspect technical findings alongside the search observations.</p>
          <LandingPageReport />
        </details>
      </section>

      <section className="landing-audiences" id="evaluation-suites" aria-labelledby="audience-heading">
        <div>
          <h2 id="audience-heading">Questions worth checking.</h2>
          <p>Software is one starting point. Shops, service businesses, and learning platforms have their own questions to answer.</p>
          <p className="landing-scope">Each search ranking belongs to its exact question. The separate page reports use the same HTML rubric across all five audiences.</p>
        </div>
        <dl>{questions.map(([audience, question]) => <div key={audience}><dt>{audience}</dt><dd>{question}</dd></div>)}</dl>
      </section>

      <section className="landing-explainer" aria-labelledby="details-heading">
        <h2 id="details-heading">A few useful details.</h2>
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
        <div><h2>Start with your own page.</h2><p>Prepare an evaluation in your workspace.</p></div>
        <Link href="/evaluations" className="button primary">Open evaluations <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </section>
    </main>

    <footer className="landing-footer">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <p>Website checks, with the evidence attached.</p>
      <nav aria-label="Footer navigation"><Link href="/privacy">Privacy</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign in</Link></nav>
    </footer>
  </div>;
}
