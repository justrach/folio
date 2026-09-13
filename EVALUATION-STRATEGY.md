# Evaluation strategy

For the operational walkthrough and flow diagram, see [the evaluation loop](docs/EVALUATION-LOOP.md). This document defines the measurement rules and benchmark requirements.

Folio asks three different questions: **is the fetched page technically readable, can a managed agent extract supported facts from its captured evidence, and what does the SEO provider report about the domain?** Each has its own evidence and interpretation. None is a shortcut for a site's real-world recommendation rate in consumer AI products.

The live agent workflow uses the managed OpenAI Agents API. The application API starts and retrieves those evaluations; an arbitrary customer API endpoint or OpenAPI document is not required to use it. The local demo provides frozen evidence and an illustrative agent response so the verifier and interface can be exercised without a model key or a provider charge.

## Evaluation tracks

| Track                              | Current input and method                                                          | What the result establishes                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `readiness-v1`                     | One approved public HTML page, deterministic checks, optional text files          | The exact rubric's technical observations at capture time                                        |
| `website-evidence-v1`              | Frozen website evidence, managed agent output, independent deterministic verifier | The measured extraction and evidence checks that passed for that run                             |
| SEO observations                   | Explicit DataForSEO domain overview and backlinks requests                        | The provider's index estimates and link metrics for the stated scope                             |
| Consumer AI visibility             | Future collection, not implemented                                                | Would require recorded questions and actual provider answers/citations                           |
| Public agent-performance benchmark | Future publication, not implemented                                               | Would require comparable suites, independent expected facts, repetitions, and publication review |

The public technical index currently uses only explicitly published `readiness-v1` scans. The agent evidence score remains private and is never blended into that index.

## Technical readiness: implemented rubric

The source of truth is `evaluationMethodology` in `src/lib/evaluation.ts`. The score is the sum of earned points, from 0 to 100:

| Check              | Maximum points | Passing condition summary                                                                                       |
| ------------------ | -------------: | --------------------------------------------------------------------------------------------------------------- |
| Page title         |             15 | One nonempty title, 15–65 characters                                                                            |
| Meta description   |             10 | One nonempty description, 50–170 characters                                                                     |
| Primary heading    |             10 | One nonempty H1                                                                                                 |
| Canonical URL      |             10 | One valid HTTP(S) canonical matching the final page URL under the rubric's normalization                        |
| Indexing directive |             10 | No supported `noindex`/`none` token observed                                                                    |
| HTTPS delivery     |             10 | Final page uses HTTPS                                                                                           |
| Readable content   |             10 | At least 200 extracted words                                                                                    |
| Image alternatives |             10 | All image elements have an `alt` attribute, including empty decorative alternatives; also passes with no images |
| Internal links     |              5 | At least one link to another path on the same origin                                                            |
| Structured data    |             10 | Every JSON-LD block parses and at least one contains a supported schema.org typed entity                        |

Several checks award partial points; the exact branches are published in the methodology and tested against fixtures. `robots.txt` and `llms.txt` observations are optional and worth zero points. Their presence does not establish crawl permission, model consumption, or an increase in ranking.

This is a bounded single-page HTML scan. It does not execute JavaScript, follow page links, fully validate schema, prove alt-text quality, confirm search-index inclusion, or audit accessibility conformance. Capture failure produces an error rather than a fabricated low score. Heuristics such as title length and word count are rubric choices, not ranking guarantees.

## Agent evidence review: implemented suite

`EVAL_SUITE` in `src/lib/evals.ts` defines `website-evidence-v1`. The managed agent reads supplied evidence in the `none` environment and returns structured facts, citations, findings, and missing-evidence notices. Folio parses and verifies that output separately; the model does not assign its own final score.

| Task                  | Independent check                                                                   | When correctness is unmeasured                                                    |
| --------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Product understanding | Compare the returned product name with supplied expected facts                      | No independent product ground truth is available                                  |
| Pricing facts         | Compare amount, currency, and interval with supplied expected pricing               | No independent pricing ground truth is available                                  |
| Source citations      | Resolve evidence IDs and check literal quoted substrings against unchanged captures | No citations were returned; invalid references or changed captures fail integrity |
| Readable source       | Recompute deterministic readability from the hashed page HTML                    | No HTML page capture was supplied                              |

The verifier currently emits eight checks: frozen source hashes and unique IDs; structured return schema; product-name accuracy; pricing accuracy; exact citations; a field-specific citation for every non-null extracted fact; a finding citation for every evidence ID of a finding marked supported; and captured readability. Product names use Unicode NFKC, whitespace, and case normalization. Prices compare the exact numeric amount and currency, with normalized interval text. Citation quotes must occur literally in the saved HTML text; semantic paraphrases do not pass as exact quotations.

Expected facts belong to the verifier side of the experiment. They must not be generated from the tested model's own answer or fed to it as the answer key. The type distinguishes fixture ground truth from owner-confirmed facts. An explicitly confirmed absence of price is different from an omitted expected price: inventing a price against confirmed absence fails, while abstaining leaves pricing accuracy unmeasured in this version. The live launch form now collects optional product/pricing references with explicit owner confirmation. These are owner-confirmed references, not independently established truth. Missing references remain unmeasured. Requests cannot claim fixture provenance, and reruns cannot override their frozen reference answers.

**Citation occurrence is not entailment.** A matching quote proves that the quoted text occurs in a capture. It does not prove the source is true, that the agent's interpretation follows from it, or that a price applies to the intended plan. Independent fact checks and clear limitations must remain visible beside a passing citation check.

The verification score is the rounded percentage `100 × passed measured checks / all measured checks`; when there are no measured checks it is `null`. The view must show passed, failed, unmeasured, and total measured counts. A high percentage with sparse evidence is not an overall website grade. Do not sort companies by this private verifier percentage.

## Evidence contract and replay

An evaluation records its run ID, target, mode, suite version, timestamps, captures, managed session/model where applicable, observed activity, parsed output, verification result, errors, and reported usage. Each capture includes an evidence ID, source URL, capture time, content, content hash, kind, and transport label. Expected facts, when present, are retained separately for verification.

Capture hashes identify the saved UTF-8 text, not raw network bytes. They help detect later edits to the captured content. They are not a source signature, trusted timestamp, proof of website ownership, or proof that the site still serves that text. Never describe a hash by itself as an independently certified result.

The owner can export the private evidence bundle and inspect the input and output behind the checks. Replay means rerunning the deterministic verifier against the saved capture, output, expected facts, and suite version. That replay should produce the same verification result. Rerunning the model against the same input is a new trial and can produce a different answer.

Model output is untrusted input: require the expected JSON shape, valid field types, known capture references, and the correct publication policy. Do not convert malformed output, a provider timeout, or absent terminal state into a completed score. Keep a completed provider turn separate from successful verification. [Agents API completion semantics](https://developers.openai.com/api/docs/guides/agents-api/quickstart#2-follow-progress)

## Outcomes and missingness

| Outcome                                                                   | Treatment                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Observable correct answer supported by the test's evidence                | Pass the applicable check                                                                        |
| Observable answer disagrees with a valid independent expected fact        | Fail the applicable check                                                                        |
| Unknown capture ID, altered capture, or invalid citation                  | Fail the applicable integrity check; do not silently repair the evidence                         |
| No independent answer key                                                 | Mark factual correctness unmeasured                                                              |
| No supported price and the expected facts explicitly confirm that absence | An invented price fails; correct abstention leaves pricing accuracy unmeasured                   |
| Provider/network failure or cancellation                                  | Preserve operational outcome; do not assign a website quality score                              |
| Demo output                                                               | Preserve its sample label in the UI and export; do not present it as a live provider observation |
| Missing provider usage or cost                                            | Unknown, not zero                                                                                |

Operational failures must stay visible in the run history. A future benchmark must specify whether an unavailable task is outside its denominator, a task-level failure, or a failed capture before collection begins. Changing that rule after seeing results makes comparison unreliable.

## Fair public comparisons: requirements before launch

Current private evaluations are useful for debugging evidence handling, but are not yet an independent public benchmark. Before publishing agent-performance ranks:

1. Freeze and identify the suite, tasks, instructions, model, environment, allowed tools, locale, capture policy, grader version, expected facts, and scoring denominator. Keep holdout tasks separate from customer-facing optimization hints.
2. Define the cohort and submission eligibility. An API docs site, a local business site, and a consumer checkout should not be ranked on one unexplained task list. Require ownership verification before claiming a company has certified or endorsed a submission.
3. Use independent expected facts and record their provenance. Give companies a way to dispute factual ground truth without rewriting historical results.
4. Run a predeclared number of independent trials for every site, retain failed attempts, and publish counts, observation windows, coverage, and uncertainty. Choose the repeat count after a pilot measures variance; do not invent precision from one trial.
5. Compare like-for-like paired tasks when testing a website change. Report task pass-rate differences and intervals suited to the experimental unit. Task outcomes from the same site/session can be correlated; treating every citation as an independent trial understates uncertainty.
6. Publish a reviewed result projection and methodology, not private prompts, credentials, source captures, provider output, or expected-fact notes by default. A public evidence excerpt requires its own disclosure review.
7. Label ties, stale runs, model changes, and changes in suite version. Payment never changes scoring or hides an unsuccessful attempt. Use separate cohorts across incompatible suites.

For a first measured pilot, prefer task-by-task outcomes and transparent sample counts over a composite leaderboard score. The sample charts illustrate the intended product experience and must continue to say so.

## Test strategy

`bun run test` exercises deterministic server logic with controlled fixtures. `bun run test:gui` exercises browser navigation and interactions through Playwright. `bun run typecheck` and the production build check the application integration. A passing fixture suite does not prove live OpenAI account access or DataForSEO entitlement.

The regression cases should cover:

- Technical scoring boundaries, malformed HTML, redirects, blocked targets, unsupported response types, and capture size/time limits.
- Valid and forged citations, missing or changed evidence, independent expected facts, explicit abstention, missing ground truth, malformed model JSON, and no-measured-check behavior.
- Missing keys, disallowed accounts, cross-owner reads/exports/cancellation, bounded input, stale revisions, repeated reconciliation, and terminal-state transitions.
- The managed session request contract: reserve the run and creation-attempt marker before one create-with-input request, persist the returned session ID, preserve ambiguous creation without retry, and verify paginated recovery, cancellation, failed turns, and the rule that idle does not mean success.
- Navigation to evaluations and run detail, tab changes, evidence inspection/export, loading/error/disconnected states, back/forward behavior, keyboard access, and return to an active run.
- DataForSEO's distinct organic/backlinks envelopes, zero versus missing metrics, charged provider errors, unknown costs, fixed destinations, and no automatic retries.

Live smoke tests are separate and deliberate: use an approved operator account, a reviewed target, and an available provider key; inspect the actual session ID, saved output, and cost/usage status. Do not silently replace an unavailable provider with successful fixture data. Record the exact commands and observed results in release notes rather than claiming every case above has passed before running it.

## Extension path

The next useful task types are grounded product/pricing extraction across multiple approved pages, verifying a documentation example against a known read-only fixture, and evaluating a reviewed before/after content change. Real API execution needs a separate explicit target contract and bounded credentials because it measures a different behavior. Browser navigation tests need an actual browser runtime. Neither capability should be inferred from the current capture-reading suite.

Broader AI visibility requires actual captured provider answers and citations, while SEO remains an external index observation. Maintain those boundaries as the product adds collectors or agent tools. A recommendation generated by Folio's own agent is not evidence that another AI product recommended the company.

## Offline verification and comparison

`bun run eval:verify <bundle.json>` checks an exported private or explicitly local-demo bundle without network calls. It validates suite/version/shape/size, checks all source hashes, reruns the deterministic verifier, and compares decisive saved outcomes. Changed explanatory prose is reported separately from changed outcomes. A structurally consistent fabricated bundle can still pass: this checks internal consistency, not provider authenticity. See [verification guide](docs/VERIFY-EVIDENCE.md).

The private run comparison excludes unfinished results and never combines demo and live results. It shows source-hash/reference changes, per-check expected and observed values, and reasons to withhold a score delta when inputs or measured checks differ. New website captures require a new run; replay preserves the original inputs.

Optional SEO snapshots retain their original provider timestamps and costs. The agent must request the one selected snapshot via a read-only function and wait for owner approval. Technical source checks and historical SEO estimates remain separate measurement domains.
