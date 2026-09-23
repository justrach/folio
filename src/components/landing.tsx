import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LandingPageReport } from "./landing-page-report";
import { RankedSearchTable } from "./ranked-search-table";
import { PUBLIC_SEARCH_QUERIES, latestPublicSearchObservation } from "@/lib/public-search-rankings";
import evaluationBatch from "@/data/developer-tool-evaluations.json";
import "./landing.css";
import { UiButton, UiSurface } from "./ui/primitives";

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

function RecommendationPreview() {
  const query = PUBLIC_SEARCH_QUERIES.find(item => latestPublicSearchObservation(item.id)?.recommendations.length);
  const result = query && latestPublicSearchObservation(query.id);
  if (!query || !result) return null;
  const shortQuestion = query.query.length > 105 ? `${query.query.slice(0, 105).replace(/\s+\S*$/, "")}…` : query.query;
  const rows = result.recommendations.slice(0, 4);
  const href = `/overview?query=${encodeURIComponent(query.id)}`;
  return <UiSurface as="aside" className="landing-preview" aria-label="Real recommendation preview">
    <div className="landing-preview-heading"><span>Inside a Folio report</span><span>Real results</span></div>
    <h2>{query.category}</h2>
    <p className="landing-preview-question">{shortQuestion}</p>
    {shortQuestion !== query.query && <details className="landing-preview-question-detail"><summary>Read the full question</summary><p>{query.query}</p></details>}
    <div className="landing-preview-axis"><span>Returned recommendations</span><span>Position</span></div>
    <ol>{rows.map((row, index) => <li key={`${row.position}-${index}`}>
      <div><strong>{row.name}</strong><span>{row.citationUrls.length ? `${row.citationUrls.length} ${row.citationUrls.length === 1 ? "source" : "sources"} to inspect` : "No source attached"}</span></div>
      <span className="landing-preview-rank" aria-label={`Position ${row.position}`}>{row.position}</span>
    </li>)}</ol>
    <Link className="landing-preview-link" href={href}>Read the answer and sources <ArrowUpRight size={16} aria-hidden="true" /></Link>
    {result.recommendations.length > rows.length && <p className="landing-preview-more">First {rows.length} of {result.recommendations.length} recommendations shown.</p>}
  </UiSurface>;
}

export function Landing() {
  const reportCount = evaluationBatch.results.filter(result => result.captureKind === "public-homepage" && result.status === "complete").length;
  return <div className="landing">
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className="landing-nav">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <nav aria-label="Website navigation">
        <a href="#sample-report">Rankings</a>
        <a href="#how-it-works">How it works</a>
        <Link href="/leaderboard">The index</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <Link className="landing-signin" href="/login">Sign in <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </header>

    <main id="main-content">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-audience">For website owners and product teams</p>
          <h1>See which competitors <span>AI recommends.</span></h1>
          <p className="landing-hero-description">See which companies appear for your customers’ questions. Inspect the sources and your own pages, then decide what to improve.</p>
          <div className="landing-actions">
            <UiButton asChild className="button primary"><Link href="/evaluations">Evaluate your website <ArrowUpRight size={16} aria-hidden="true" /></Link></UiButton>
            <Link href="/leaderboard">Explore real results</Link>
          </div>
          <p className="landing-access">Sign in to prepare an evaluation. You choose when to run it.</p>
        </div>
        <RecommendationPreview />
      </section>
      <div className="landing-benefits" aria-label="What you get">
        <p><strong>Know who appears.</strong> See the returned recommendations.</p>
        <p><strong>Inspect the sources.</strong> Read the evidence behind an answer.</p>
        <p><strong>Review what to change.</strong> Check your pages before editing.</p>
      </div>

      <section className="landing-workflow" id="how-it-works" aria-labelledby="workflow-heading">
        <div className="landing-section-heading">
          <div><h2 id="workflow-heading">A clear next step for your website.</h2><p>Start with a customer question. Finish with evidence your team can act on.</p></div>
        </div>
        <ol>
          <li><h3>Ask a useful question</h3><p>Save the questions people ask when choosing a product like yours. Start an evaluation when you’re ready.</p></li>
          <li><h3>Inspect the evidence</h3><p>See the returned companies and sources. Inspect your own page to check whether the relevant information is already there.</p></li>
          <li><h3>Make a change. Check again.</h3><p>Use page checks and repair suggestions to decide what to edit. After your team publishes, run a fresh evaluation and review the evidence.</p></li>
        </ol>
        <p className="landing-workflow-note">Each result records one run. A different answer after an edit does not establish that the edit caused it.</p>
      </section>

      <section className="landing-audiences" id="evaluation-suites" aria-labelledby="audience-heading">
        <div>
          <h2 id="audience-heading">Questions worth checking.</h2>
          <p>Software is one starting point. Shops, service businesses, and learning platforms have their own questions to answer.</p>
          <p className="landing-scope">Each search ranking belongs to its exact question. The separate page reports use the same HTML rubric across all five audiences.</p>
        </div>
        <dl>{questions.map(([audience, question]) => <div key={audience}><dt>{audience}</dt><dd>{question}</dd></div>)}</dl>
      </section>

      <section className="landing-report-section" id="sample-report" aria-labelledby="report-heading">
        <div className="landing-section-heading">
          <div>
            <h2 id="report-heading">See who gets recommended.</h2>
            <p>Explore real search recommendations, with the returned order and sources intact.</p>
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
        <div><h2>What will AI say about your website?</h2><p>Choose the questions that matter to your customers.</p></div>
        <UiButton asChild className="button primary"><Link href="/evaluations">Evaluate your website <ArrowUpRight size={16} aria-hidden="true" /></Link></UiButton>
      </section>
    </main>

    <footer className="landing-footer">
      <Link href="/" className="wordmark" aria-label="Folio home"><Mark /><span>folio.</span></Link>
      <p>Website checks, with the evidence attached.</p>
      <nav aria-label="Footer navigation"><Link href="/privacy">Privacy</Link><Link href="/pricing">Pricing</Link><Link href="/login">Sign in</Link></nav>
    </footer>
  </div>;
}
