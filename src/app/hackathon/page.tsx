import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { RankedSearchTable } from "@/components/ranked-search-table";
import "@/components/landing.css";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Folio — Astra hackathon demo",
  description: "See which websites GPT-6.0 Astra recommends, inspect the sources, and explore Folio’s website improvement workflow and MCP integration.",
  alternates: { canonical: "/hackathon" },
};

export default function HackathonPage() {
  return <div className={`landing ${styles.page}`}>
    <a className="landing-skip" href="#main-content">Skip to content</a>
    <header className={styles.header}>
      <Link href="/" className="wordmark" aria-label="Folio home">folio.</Link>
      <span>Astra Hackathon · September 2026</span>
      <a href="https://github.com/justrach/folio">Source code <ArrowUpRight size={15} aria-hidden="true" /></a>
    </header>
    <main id="main-content" className={styles.main}>
      <section className={styles.hero}>
        <p className={styles.byline}>Built by Rach Pradhan</p>
        <h1>Does AI recommend<br />your website?</h1>
        <p className={styles.intro}>Folio uses GPT-6.0 Astra to research customer questions and show which websites get recommended—with the sources attached. Find a gap, improve your page, and compare a fresh answer.</p>
        <div className={styles.actions}>
          <a href="#demo" className="button primary">Explore the demo <ArrowUpRight size={17} aria-hidden="true" /></a>
          <Link href="/docs/api">Connect through MCP <ArrowUpRight size={17} aria-hidden="true" /></Link>
        </div>
        <p className={styles.note}>Saved public results are open to everyone. No sign-in needed to explore.</p>
      </section>

      <section className={styles.workflow} aria-label="How Folio works">
        <div><h2>Ask a customer question.</h2><p>Choose the product question you want to investigate. Astra researches it using live web search.</p></div>
        <div><h2>Inspect the evidence.</h2><p>See the returned recommendation order, reasons, and cited pages. Check whether your website appears.</p></div>
        <div><h2>Improve and retest.</h2><p>Review technical page checks and repair downloads. After making changes, compare a fresh run with your baseline.</p></div>
      </section>

      <section id="demo" className={styles.demo}>
        <div className={styles.sectionHeading}><div><h2>See who gets recommended.</h2><p>Choose a category and question to explore the recorded recommendations.</p></div><Link href="/overview">Full dashboard <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
        <RankedSearchTable />
        <p className={styles.note}>Position means the order in one answer to the selected question. These observations do not measure consumer ChatGPT Search rankings.</p>
      </section>

      <section className={styles.technology}>
        <div><h2>Built with GPT-6.0 Astra.</h2><p>OpenAI’s managed Agents API runs the research with live web search. A hosted Linux sandbox validates the structured JSON output. Folio checks recorded search and validation activity before accepting a completed result.</p><p>The prototype uses one research agent per question. Swarming across more questions and categories is our next experiment.</p></div>
        <div><h2>A UI for people. MCP for agents.</h2><p>Explore results in Folio, or connect a coding assistant through our authenticated MCP endpoint. Read saved evidence, inspect visibility and SEO reports, and explicitly request new evaluations.</p><p>Your coding assistant can use that evidence to propose changes in your repository. Folio keeps the results available for the next comparison.</p><Link href="/docs/api">Explore the API and MCP setup <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </section>

      <section className={styles.next}><div><h2>Try your own customer questions.</h2><p>Sign in to prepare an evaluation. New runs require approved access and an explicit start.</p></div><Link href="/evaluations" className="button primary">Open evaluations <ArrowUpRight size={17} aria-hidden="true" /></Link></section>
    </main>
    <footer className={styles.footer}><Link href="/">folio.</Link><span>Website recommendations, with evidence attached.</span><Link href="/privacy">Privacy</Link></footer>
  </div>;
}
