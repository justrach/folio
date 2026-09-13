# Folio evaluation-suite assessment

Assessment date: 13 September 2026. Audience: people responsible for SaaS websites, online stores, local service businesses, and developer products. Developer companies are one category, not Folio's exclusive audience. This is a source review with two local deterministic probes, not a new paid evaluation or a production validation. The separately active keyword-benchmark implementation was reviewed only at its emerging contract boundary; it was not changed or fully validated here. Source line references describe the working tree at review time.

## Decision

Folio has a credible foundation for **inspectable website evidence and repeatable technical checks**. Its current agent suite does not yet measure whether a person discovers a business, chooses a suitable product or service, or completes an intended action. The next step should be a catalogue of focused evaluation suites for different customer questions: compare SaaS plans, choose a product, check a local service, or understand developer documentation. Keep discovery, understanding, and actual task completion as distinct outcomes.

For the landing page, the defensible present-tense promise is: **see what an agent can extract from your website, inspect the evidence, and compare a fresh evaluation after a change**. Broader audience examples can explain the intended direction, but they do not establish that the corresponding suites exist. Discovery monitoring, repeated sandbox experiments, booking or checkout tests, and API/CLI/MCP execution must carry their own implementation and validation states.

## What is established today

| Capability | Implementation evidence | Validation boundary |
| --- | --- | --- |
| A frozen single-page agent input | `src/lib/agent-runs.ts:45–70` fetches an approved page with an 80,000-byte limit, hashes its decoded text, and withholds reference answers from model input. | One documented managed live run used `example.com`; this does not establish representative performance across any business category. |
| Independent deterministic checks | `src/lib/eval-verifier.ts:61–164` checks hashes, schema, two factual fields, exact quotations, evidence links, and a 200-visible-word threshold. | Fixture tests exercise tampering, missing answers, wrong values, malformed returns, and recomputed readability. |
| Owner-confirmed references | `src/lib/expected-facts.ts:17–59` requires explicit confirmation, distinguishes omitted pricing from confirmed absence, and prevents frozen replay from replacing the answer key. | Owner confirmation is provenance, not independent fact verification. |
| Offline inspection and reproduction | `scripts/verify-evaluation.ts:23–95` validates the bundle and suite, recomputes outcomes, and rejects changed decisive results. | Internal consistency is reproduced; provider authenticity, source truth, and capture time are not authenticated. |
| Private before/after comparison | `src/lib/eval-comparison.ts:21–70` separates demo/live runs, flags changed captures, and withholds a delta when target/model/suite/references/coverage differ. | An observed difference does not isolate the cause of a website change. |
| A developer-tool homepage batch | `docs/DEVELOPER-TOOLS-EVALUATION.md:11–49` describes a separate deterministic workerd batch and offline replay. | The documented live batch attempted 24 public homepages: 16 measured and 8 unavailable. All 25 outcomes including the unavailable local preview reproduced offline. It executed no developer APIs or page scripts. |
| A keyword-benchmark contract under construction | `src/lib/keyword-benchmark-types.ts:1–97` separates case input, model observations, independent references, execution fingerprints, and comparison conditions. | This file's presence is not evidence of completed D1/runtime/UI integration or a successful live keyword experiment. The active implementation owns that validation. |

The sole documented managed agent run completed with four checks passing, one failing, and three unmeasured. Its 80% was five measured checks, not website quality, customer conversion, or product adoption. Saved-SEO continuation and cancellation were not exercised by that run. See [`docs/LIVE-VALIDATION.md:3–34`](LIVE-VALIDATION.md).

The implementation already makes several sound measurement choices: it does not accept a model-generated score; missing reference answers remain unmeasured; mutable stored readability labels are ignored; private and illustrative results remain distinguishable; failed and ambiguous provider operations are retained. Preserve these while expanding the suite. Existing test evidence is in [`tests/evals.test.ts:10–114`](../tests/evals.test.ts) and [`tests/agents.test.ts`](../tests/agents.test.ts); this assessment did not rerun those entire suites.

## Two verified interpretation limits

I ran two deterministic, in-memory probes through the current `verifyEvaluationResult` using the fictional Sable fixture. Neither called a network or model provider or changed a saved run.

| Local probe | Observed result | Interpretation |
| --- | --- | --- |
| Remove both returned facts, every citation, and every finding; omit reference answers. Retain valid schema and readable fixture HTML. | **100%; 3 passed, 0 failed, 5 unmeasured.** | A perfect measured-check percentage can contain no useful extracted answer. The visible missingness counts matter more than the percentage. |
| Keep the correct fixture fact values, replace every citation with the real but irrelevant substring `Read the documentation`, and replace the finding explanation with an unsupported claim of market leadership and universal AI recommendation. | **100%; 8 passed, 0 failed, 0 unmeasured.** | Field labels and source occurrence do not establish that quotations support the facts or finding. The correct fixture answers still pass the independent value comparisons. |

These illustrate the suite's documented boundary rather than proving a live model behaves this way. Citation validation uses `content.includes(quote)`; field coverage requires a citation with the matching field; finding coverage matches an evidence ID to any finding citation for that capture (`src/lib/eval-verifier.ts:106–142`). There is no claim-to-span entailment check. The source already warns about this, but headline percentages can still overstate what the run establishes.

## Five prioritized improvements

### 1. Make customer-task outcomes and missingness the primary result

**Priority: first; validity and product comprehension.** Keep protocol/integrity checks as prerequisites and diagnostics. Present task accuracy, answerability, evidence coverage, and technical text availability in distinct groups. Default the report headline to counts such as “2 referenced facts checked; 1 correct, 1 incorrect” or “No referenced facts measured.” Retain the existing percentage only as a secondary, precisely named diagnostic if compatibility requires it.

For a new version, represent a task's expected state as known answer, confirmed absent, ambiguous, or no reference. Score correct abstention on a deliberately unanswerable task separately from missing ground truth. Current confirmed-absent pricing is unmeasured when the model abstains (`src/lib/eval-verifier.ts:95–104`); a dedicated answerability metric would give this useful behavior its own measurable outcome without treating every missing field as a success.

**Acceptance:** the all-null probe cannot produce an overall success headline; an invented answer fails an independently reviewed absent-answer task; valid abstention passes that task; unavailable evidence remains distinct. UI and exports expose task denominators. Preserve historical `website-evidence-v1` results instead of silently changing their meaning.

### 2. Build focused suites for different audiences

**Priority: first; coverage and customer value.** The current implementation checks product name plus one amount/currency/interval tuple (`src/lib/evals.ts:10–15,29–35,66–74`). It does not contain the category-specific assertions below. Offer a shared evidence workflow with different task packs rather than apply one unexplained task list to every business. The proposed ordering reflects proximity to current capture and grading capabilities; it is a product judgment, not measured demand or a claim about market popularity.

| Proposed suite and priority | Intended user and task | Measurable outcome | Required ground truth |
| --- | --- | --- | --- |
| **1. SaaS comparison and pricing** | SaaS product/marketing teams. “Which plan meets these stated requirements, and what will this team pay?” | Correct qualifying plan, included features and limits, currency, billing unit, commitment, and calculated total for a frozen scenario; correctly identify when no offered plan qualifies. | Reviewed plan matrix and feature rules, dated price references, seats/usage assumptions, tax/region assumptions, and an independent expected calculation. A company's own page supports what it states, not an impartial superiority claim. |
| **2. Ecommerce product fit and returns** | Merchants and ecommerce teams. “Does this exact variant fit my constraints, and what happens if I return it?” | Correct variant compatibility, dimensions/materials or other relevant attributes, return window, exclusions, and who bears stated return costs; abstain when compatibility or policy coverage is missing. | Reviewed product/variant specification plus the applicable return policy, locale, purchase conditions, and effective date. Test product suitability against explicit constraints; do not infer safety or real-world performance from marketing language. |
| **3. Local service scope, area, and contact** | Local service owners and agencies. “Does this business offer the service in my area, and how do I contact it?” | Correct offered/excluded service, covered locality, hours as published, and the stated contact or quote-request route; clearly identify unconfirmed eligibility. | Owner-reviewed service catalogue, coverage rules, location-specific contact details, published hours and exceptions. A website claim is not proof of current appointment availability, work quality, or professional credentials. |
| **4. Developer APIs and documentation** | Developer-product, DevRel, and documentation teams. “How do I authenticate and complete this read-only integration task?” | Correct SDK/API version, authentication method, endpoint, required parameters, pagination/error handling, and prerequisites; separately measure execution only when an approved runtime exists. | Versioned API/schema documentation and independent expected assertions; actual execution additionally requires a fixed sandbox fixture, expected response or state, and explicit action/credential boundaries. |

Each suite should share three explicitly named measurement modes:

| Mode | What it can establish | Examples across the proposed suites | What requires a separate measurement |
| --- | --- | --- | --- |
| **Captured-page understanding** | Whether an agent answers defined questions correctly from the exact supplied pages, with reviewed references and supporting evidence. | SaaS plan arithmetic; product dimensions and return exclusions; published service area and phone number; stated API authentication and request shape. | It cannot show the agent found those pages independently, that inventory or appointments are current, or that a workflow succeeds. All proposed category fields need new contracts/graders; the present suite remains product name plus one price tuple. |
| **Retrieval and discovery** | Which sources or businesses an agent finds for a frozen query under a recorded agent, locale, tools, and environment, plus the accuracy of the resulting answer. | Finding relevant SaaS options; retrieving the right product policy; finding services for a stated area; locating the correct versioned docs. | A retrieved URL is not proof of claim support or successful purchase, booking, or integration. A controlled agent run is not a consumer-AI visibility observation unless that consumer surface was actually sampled. Reuse the keyword-benchmark work in progress for query/run observations. |
| **Actual execution** | Whether a specified action succeeds against observable postconditions in an explicitly authorized runtime. | Calculate a configured plan quote; validate a test cart or return flow; complete a test contact/booking path; run an API/CLI/MCP task against fixtures. | These are separate proposed capabilities. They need runtime isolation, permitted operations, test data, and independently checked outcomes. Capturing HTML cannot establish execution. Real purchases, messages, or bookings are not routine verification and require their own authorization. |

Start with the first suite's captured-page tasks and an explicit small set of plan/pricing pages, then apply the same contract to another audience. Multi-page capture needs per-page and aggregate limits, a redirect policy, and missing-page outcomes; do not silently crawl a site. Include ambiguous pricing, absent facts, contradictory policies, variant-specific exceptions, unsupported service areas, outdated docs, and JavaScript-only content. A raw HTTP capture cannot measure rendered navigation success. Frozen evidence supports the policy or offer at capture time, not a promise that it remains current.

**Acceptance:** every proposed suite has a versioned task specification, audience, input policy, reference provenance, allowed operations, answerability state, grader, and denominator. A good result on SaaS plans cannot establish ecommerce or service performance. Publish per-suite task outcomes and unmeasured fields; use separate cohorts for comparisons. The keyword implementation retains ownership of query/run storage and sandbox model observation. Do not mark any of these proposed suites shipped until its schema, reference workflow, grader, fixtures, UI/export labels, and bounded live validation have been completed.

### 3. Bind claims to evidence spans and calibrate semantic review

**Priority: next; validity.** Add stable claim IDs and explicit citation-to-claim links; preserve original source text and resolved spans. Finding A should not inherit citation validity from finding B merely because both mention the same capture. Facts need evidence for the relevant value and context: the intended plan, product variant, return-policy exception, service area, or API version.

For simple constrained facts, use deterministic assertions and reviewed reference spans. For semantic explanations, first create a human-labelled set of supported, contradicted, insufficient, and irrelevant claim/span pairs. If a model grader is later introduced, report its identity and version, agreement with that set, false-support rate, and unresolved cases. Keep it as a separate grader outcome; another model's confidence must not silently replace deterministic proof.

This recommendation adapts ALCE's separation of answer correctness and citation quality to Folio's narrower tasks; it is not evidence that Folio already implements ALCE or inherits its results. See the original [ALCE paper](https://arxiv.org/abs/2305.14627) and [authors' implementation](https://github.com/princeton-nlp/ALCE).

**Acceptance:** the irrelevant-quote probe fails claim support while source occurrence still passes; one genuine quote cannot validate unrelated findings; wrong-plan, wrong-variant, wrong-area, and wrong-version answers are rejected even when the quoted value occurs elsewhere. Report disagreement rather than hiding it in a single score.

### 4. Freeze the execution contract and run a calibrated trial pilot

**Priority: alongside the task pack; reliability and calibration.** Frozen replay currently preserves capture/reference content while using current instructions and the configured model (`docs/EVALUATION-LOOP.md:55–65`). Record a prompt/instruction digest, model identifier, suite/grader version, capture policy, enabled tools, locale, execution settings, and environment fingerprint. Preserve original settings or name the action a new configuration trial.

Extend the existing keyword contract rather than build a competing experiment system: it already records query, language, locale, harness and environment fingerprints and compares them (`src/lib/keyword-benchmark-types.ts:4–25,76–96`). Share compatibility rules only where the experimental meanings truly match. A homepage HTML batch and an open-ended discovery run have different units and should not share one score.

After the reviewed task pack exists, predeclare a bounded, explicitly authorized live pilot with independent repeated trials and paired before/after tasks. Retain failures and unavailable outcomes. Use the pilot to estimate variability before choosing production repetition counts; do not invent a precise universal repeat count. Report counts and intervals at the site/task experimental unit, not as though every quote in one answer were independent. HELM provides a useful primary research precedent for standardized scenarios, explicit coverage, and multiple metrics, rather than a justification for a Folio composite rank: [original HELM paper](https://arxiv.org/abs/2211.09110).

**Acceptance:** a prompt/tool/environment change invalidates like-for-like comparison; the same manifest reproduces deterministic verification; trial counts include failed attempts; no repeat starts on navigation or status polling. Live continuation, cancellation, absent-final-item recovery, and actual usage reporting have separately recorded validation outcomes. None is established by unit fixtures alone.

### 5. Connect findings to a saved change and a deliberate retest

**Priority: after the result/task contract; workflow and retention.** Persist the existing human process as a private record: baseline task result → selected evidence/problem → proposed docs or website edit → implementation confirmation → fresh retest → per-task differences. Show the observed capture changes, reference changes, and experiment settings next to the result. A repair download is not evidence that the customer deployed the repair.

This is already identified as future work in `docs/EVALUATION-LOOP.md:81–87`. Attach the relevant plan page, product policy, local service page, or documentation version and an optional customer-provided change reference. Keep a failed retest visible and useful. Support manual follow-up before adding recurring paid monitoring; scheduling requires an explicit scope, spend controls, and production validation.

**Acceptance:** every claimed improvement links two comparable observations and the recorded change; users can distinguish a frozen rerun from a new capture; changed references/settings explain withheld deltas; refresh/back navigation cannot create a paid run. The report says “observed improvement on these tasks,” not “this edit increased AI recommendations.”

## Implications for positioning and delivery

The useful progression across audiences is **discovery → understanding → intended action → reviewed improvement**. The intended action varies: select a SaaS plan, choose a suitable product, contact the right service, or complete an integration. The present product supports parts of evidence inspection and manual improvement; the homepage batch is a technical observation; the keyword benchmark is active implementation; category-specific task packs and actual execution are proposed work. Make those distinctions visible in product examples and the comprehensive competitor report.

Suitable current claims include “Inspect the captured sources behind an agent's answer,” “Check product and pricing facts against references you supply,” and “Compare private evaluations after a website change.” Examples of SaaS plan selection, product compatibility, service eligibility, and developer integration should be labelled proposed suites until implemented. “Know whether agents can use your API,” “verify checkout or booking success,” “track consumer-AI visibility,” and “prove higher conversion” need their own completed implementation and representative validation first.

The first useful release of improvements is coverage-aware reporting plus the SaaS comparison/pricing pack, followed by ecommerce, local service, and developer documentation packs as their reference data and graders are ready. This sequence is a proposed implementation priority and can change with customer evidence. Span-based evidence checks, versioned repeated trials, and the saved change/retest record make each suite more trustworthy and actionable. Public rankings should follow calibrated cohorts and a reviewed publication policy, not serve as the initial proof of value. Production infrastructure, hosted CI billing, and subscriptions remain separate dependencies in [`TODO.md:43–69`](../TODO.md).

No existing suite, runtime, pricing, or landing files were changed by this assessment. The two synthetic probes established local verifier behavior only. No OpenAI, DataForSEO, Google, or customer API work was started, and no new live-validation claim was added.
