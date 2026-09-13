import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileCheck2,
  Fingerprint,
  GitPullRequest,
  Search,
  ShieldCheck,
} from "lucide-react";
import "./landing.css";

const companies = [
  { name: "Notion", value: 91.8, symbol: "N" },
  { name: "Linear", value: 88.4, symbol: "L" },
  { name: "Vercel", value: 86.2, symbol: "▲" },
  { name: "Framer", value: 80.9, symbol: "F" },
  { name: "Acme", value: 72.8, symbol: "a" },
];
function Mark() {
  return (
    <span className="folio-mark" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
export function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="wordmark" aria-label="Folio home">
          <Mark />
          <span>folio.</span>
        </Link>
        <nav aria-label="Website navigation">
          <a href="#the-product">The product</a>
          <a href="#why-folio">Why Folio</a>
          <Link href="/evaluations">Evaluations</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/leaderboard">
            The Folio Index <ArrowUpRight size={12} />
          </Link>
        </nav>
        <div>
          <Link href="/login" className="landing-signin">
            Sign in
          </Link>
          <Link href="/overview" className="button primary">
            Explore the demo <ArrowUpRight size={14} />
          </Link>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <span className="hero-edition">
              <span /> A NEW CHAPTER IN DISCOVERY
            </span>
            <h1>
              The next search
              <br />
              is an answer.
              <br />
              <em>Be part of it.</em>
            </h1>
            <p>
              Bring your search health and AI discovery into one considered
              view. Understand the evidence. Review the next change. Give your
              website a clearer voice.
            </p>
            <div className="hero-actions">
              <Link href="/overview" className="button primary">
                Find your perspective <ArrowUpRight size={16} />
              </Link>
              <Link href="/leaderboard">
                Explore the index <ArrowRight size={14} />
              </Link>
            </div>
            <div className="hero-footnote">
              <ShieldCheck size={14} />
              <span>Inspect the evidence. Own the changes.</span>
            </div>
          </div>
          <div className="hero-report">
            <div className="report-spine">
              FOLIO / RESEARCH & DISCOVERY / VOLUME 001
            </div>
            <div className="report-cover">
              <div className="cover-top">
                <span>THE FOLIO INDEX</span>
                <span>2026</span>
              </div>
              <h2>
                A new measure
                <br />
                of being found.
              </h2>
              <div
                className="cover-chart"
                role="img"
                aria-label="Sample readiness chart: Notion 91.8, Linear 88.4, Vercel 86.2, Framer 80.9, Acme 72.8 out of 100. Illustrative, not measured rankings."
              >
                {companies.map((c, i) => (
                  <div
                    key={c.name}
                    className={i === 4 ? "cover-your-brand" : ""}
                  >
                    <span className="cover-chart-value">{c.value}</span>
                    <i style={{ height: `${c.value * 2.1}px` }} />
                    <span className="cover-brand">
                      {c.symbol}
                      <small>{c.name}</small>
                    </span>
                  </div>
                ))}
              </div>
              <div className="cover-footer">
                <Mark />
                <div>
                  THE VISIBILITY REPORT
                  <small>Illustrative scores · not measured rankings</small>
                </div>
                <span>01—05</span>
              </div>
            </div>
            <div className="report-caption">
              <span>YOUR WEBSITE HAS A STORY.</span>
              <span>
                Make it easier to tell. <ArrowUpRight size={13} />
              </span>
            </div>
          </div>
        </section>
        <div className="landing-rule">
          <span>ONE WORKSPACE. A CLEARER PICTURE.</span>
          <div>
            <span>
              <Search size={15} /> Search health
            </span>
            <span>
              <Fingerprint size={15} /> AI discovery
            </span>
            <span>
              <FileCheck2 size={15} /> Reviewed repairs
            </span>
          </div>
        </div>
        <section id="the-product" className="landing-product">
          <div className="section-heading">
            <div>
              <span className="eyebrow">FROM FINDING TO FIX</span>
              <h2>
                A little clarity.
                <br />A meaningful next step.
              </h2>
            </div>
            <p>
              A report is a beginning. Folio connects the page you have, the
              evidence you can inspect, and a change your team can take forward.
            </p>
          </div>
          <div className="product-steps">
            <article>
              <span className="step-number">01 / OBSERVE</span>
              <div className="step-visual audit-visual">
                <div>
                  <span>PAGE HEALTH</span>
                  <strong>
                    86<small>/100</small>
                  </strong>
                </div>
                <span>
                  <Check size={13} /> One clear page title
                </span>
                <span>
                  <Check size={13} /> Readable content
                </span>
                <span className="audit-opportunity">
                  <i /> A clearer introduction
                </span>
                <small>Sample audit</small>
              </div>
              <h3>See what’s really there.</h3>
              <p>
                Fixed technical checks turn a captured page into an
                understandable report. Every score has its workings.
              </p>
            </article>
            <article>
              <span className="step-number">02 / UNDERSTAND</span>
              <div className="step-visual evidence-visual">
                <div>
                  <Fingerprint size={16} />
                  <span>FOLLOW THE EVIDENCE</span>
                </div>
                <p>“Work, reimagined.”</p>
                <span>
                  Your introduction describes a feeling before it explains the
                  product.
                </span>
                <small>Sample finding · /index.html</small>
              </div>
              <h3>Find the next useful change.</h3>
              <p>
                Read the source details behind a finding, and see exactly what a
                suggestion is intended to improve.
              </p>
            </article>
            <article>
              <span className="step-number">03 / IMPROVE</span>
              <div className="step-visual repair-visual">
                <div>
                  <GitPullRequest size={15} />
                  <span>A CHANGE YOU CAN OWN</span>
                </div>
                <p>Acme is a project management workspace for small teams.</p>
                <span>
                  <Check size={12} /> Reviewed and ready to download
                </span>
                <small>Sample repair · nothing auto-published</small>
              </div>
              <h3>Put your judgment first.</h3>
              <p>
                Review the proposed content and download the changes you
                approve. Publish through your own workflow.
              </p>
            </article>
          </div>
        </section>
        <section id="why-folio" className="landing-difference">
          <div className="difference-intro">
            <span className="eyebrow">WHY FOLIO</span>
            <h2>
              Made for the space
              <br />
              between the report
              <br />
              <em>and the repair.</em>
            </h2>
            <p>
              Folio’s distinction is its focus: a small, inspectable workflow
              that keeps the finding, the evidence, and the proposed change
              together.
            </p>
            <Link href="/overview">
              Take a look inside <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="difference-list">
            <article>
              <span>01</span>
              <div>
                <h3>A score with a paper trail.</h3>
                <p>
                  Return to the saved capture and fixed checks behind a
                  technical audit. Understand what each point measures before
                  deciding what to change.
                </p>
                <small>AVAILABLE TODAY</small>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>A repair your team can own.</h3>
                <p>
                  Take reviewed title, description, and canonical suggestions
                  back to your codebase. Keep the approval and publishing
                  decisions with the people who know the site.
                </p>
                <small>AVAILABLE TODAY</small>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>A benchmark built to be questioned.</h3>
                <p>
                  Inspect managed agent answers alongside saved captures, source
                  hashes, and exact citation checks. See which facts can be
                  verified and which still need independent reference answers.
                </p>
                <small className="roadmap-label">
                  PRIVATE EVALUATIONS · DEMO SUITE AVAILABLE
                </small>
              </div>
            </article>
          </div>
        </section>
        <section className="landing-positioning">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A CONSIDERED CHOICE</span>
              <h2>
                A focused tool,
                <br />
                in good company.
              </h2>
            </div>
            <p>
              Established SEO and AEO products already offer monitoring, audits,
              recommendations, and repair workflows. Here is where Folio chooses
              to focus.
            </p>
          </div>
          <div className="positioning-grid">
            <div>
              <span className="positioning-label">THE QUESTION</span>
              <h3>“What should we change on this page, and why?”</h3>
              <p>
                One saved page, inspectable checks, and a reviewable repair. A
                useful first step for a small team improving its website.
              </p>
            </div>
            <div>
              <span className="positioning-label">THE EVIDENCE</span>
              <h3>
                Readiness, visibility, and task success mean different things.
              </h3>
              <p>
                Technical audit scores stay separate from observed search data
                and private reader evaluations. Sample charts carry a visible
                label.
              </p>
            </div>
            <div>
              <span className="positioning-label">THE DIRECTION</span>
              <h3>“Did the change help a reader do the job?”</h3>
              <p>
                Start with the evaluation suite and inspect the answer,
                evidence, and verifier checks. Broader repeated trials and
                public agent benchmarks remain our next research step.
              </p>
            </div>
          </div>
          <details className="research-disclosure">
            <summary>
              Behind the positioning: our competitor research{" "}
              <ChevronRight size={14} />
            </summary>
            <div>
              <p>
                We reviewed the vendors’ own descriptions of their products.
                This is a positioning study, not a hands-on comparison or a
                claim of exclusive features.
              </p>
              <ul>
                <li>
                  <a
                    href="https://www.tryprofound.com/features/agents/content-optimization"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Profound
                  </a>
                  ,{" "}
                  <a href="https://peec.ai/" target="_blank" rel="noreferrer">
                    Peec AI
                  </a>
                  , and{" "}
                  <a
                    href="https://otterly.ai/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    OtterlyAI
                  </a>{" "}
                  cover AI visibility, analysis, and recommendations.
                </li>
                <li>
                  <a
                    href="https://www.semrush.com/kb/1496-getting-started-with-ai-visibility-toolkit"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Semrush
                  </a>{" "}
                  combines SEO and AI visibility.{" "}
                  <a
                    href="https://help.ahrefs.com/en/articles/9775727-how-patches-work-in-site-audit"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ahrefs
                  </a>{" "}
                  supports reviewed patches and exports.{" "}
                  <a
                    href="https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-compare-crawls/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Screaming Frog
                  </a>{" "}
                  compares saved crawls.
                </li>
                <li>
                  <a
                    href="https://www.agentready.me/methodology"
                    target="_blank"
                    rel="noreferrer"
                  >
                    AgentReady
                  </a>{" "}
                  documents readiness checks and repair verification. These
                  capabilities are part of an existing category.
                </li>
              </ul>
              <p className="research-date">
                Reviewed September 13, 2026. Product capabilities change; linked
                sources describe the scope of this research.
              </p>
            </div>
          </details>
        </section>
        <section className="landing-cta">
          <Mark />
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h2>
            Your website deserves
            <br />
            <em>to be understood.</em>
          </h2>
          <p>Start with a clearer picture. Leave with a next step.</p>
          <Link href="/overview" className="button cream">
            Explore the demo <ArrowUpRight size={16} />
          </Link>
          <small>
            Live page audits are available for approved domains.
            <br />
            AI visibility charts and benchmark scores currently use sample data.
          </small>
        </section>
      </main>
      <footer className="landing-footer">
        <Link href="/" className="wordmark">
          <Mark />
          <span>folio.</span>
        </Link>
        <span>A little clarity goes a long way.</span>
        <div>
          <a href="#why-folio">Why Folio</a>
          <Link href="/evaluations">Evaluations</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/leaderboard">
            The Folio Index <ArrowUpRight size={12} />
          </Link>
          <Link href="/login">
            Sign in <ArrowUpRight size={12} />
          </Link>
        </div>
        <small>© 2026 FOLIO</small>
      </footer>
    </div>
  );
}
