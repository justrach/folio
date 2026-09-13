# Folio competitive strategy and evaluation suites

## Recommendation

Build Folio around **the questions people bring to a website**. A prospective customer comparing software plans, a shopper checking compatibility, a homeowner looking for a service, and a developer reading API documentation share a need: obtain a useful answer and know whether the evidence supports it. Developer products are one important application of that idea, alongside commerce, services, and other information-heavy websites.

The product direction is a common evaluation workflow with selectable task suites. The current pilot is narrower: it captures a page, checks bounded product-name and pricing answers against supplied references, preserves evidence, and supports technical repair downloads and manual reevaluation. Broader suites should be presented as proposals until their tasks, answer keys, graders, and live validation exist. A roadmap example is useful; a functioning-looking control for an unbuilt suite would misrepresent the product.

The strongest near-term investment is **more meaningful questions and clearer result interpretation**, followed by a saved connection between a finding, an implemented change, and a retest. Audits, recommendations, exports, citation records, and experiment comparisons already exist across competing products. Folio's opportunity is to make a specific website decision easier for an identifiable customer, rather than claim ownership of those general capabilities.

## Competitive landscape

Competitors overlap at different points in the customer journey. Some observe whether a brand is mentioned; some diagnose technical pages; others execute developer tasks or provide infrastructure for custom experiments. These are alternatives for portions of the budget, not equivalent measurements. The table describes published capabilities, not independently reproduced performance.

| Product | Buyer or job | Relevant published scope | Implication for Folio |
| --- | --- | --- | --- |
| Profound | Brand and content teams | AI-answer analysis plus content diagnosis, changes, and publishing workflows.[^2] | Avoid describing visibility competitors as passive dashboards. |
| Scrunch | Marketing and technical teams | Answer/traffic evidence and an agent-oriented content-delivery layer.[^3] | Different interventions need different evidence; a content-delivery layer and a repair download are distinct offers. |
| Peec AI | Marketing teams and agencies | Brand/source analysis from vendor-described consumer-interface sampling.[^4] | A controlled API-agent run must not be labelled consumer-interface visibility. |
| OtterlyAI | Marketers, smaller businesses, agencies | Prompt monitoring and content opportunities; documented KPI formulas.[^5] | Explain precisely what a proxy means and which observations enter its denominator. |
| Semrush | SEO and marketing teams | AI visibility research, prompt tracking, technical checks, and recommendations.[^6] | Broad search tooling is an established category. |
| Ahrefs | SEO teams | Brand Radar and a Site Audit patch workflow.[^7] | Review, export, and change history are expected capabilities rather than unique claims. |
| Screaming Frog | Technical SEO specialists and agencies | Site crawling, extraction, and saved-crawl comparison.[^8] | Preserve Folio's bounded page scope; do not imply whole-site crawl coverage. |
| AgentReady.me | Website teams investigating agent accessibility | Explicit applicability/coverage rules and finding-specific repair verification.[^9] | Transparent methodology and repair checks have direct category precedents. |
| Braintrust | AI engineering and product teams | Dataset/task/scorer experiments, trials, and baseline comparisons.[^10] | Learn from case-level review, without turning Folio into a generic evaluation platform. |
| Inspect AI | Evaluation researchers and engineers | Configurable tasks, solvers, scorers, logs, and sandboxes.[^11] | Reusable experiment infrastructure is available; valid website tasks still require design and reference data. |

Folio's own evaluations should address the questions a website owner's customers ask, with results tied to recorded tasks and evidence. Developer tools are one segment alongside software subscriptions, commerce, and services. The hypothesis to test is whether a focused, understandable report helps an owner choose and verify a useful change.

AgentReady provides another important boundary: its methodology separates unobservable checks from failed checks, while its journey-testing page explicitly describes the production journey runner as not live. Folio should apply the same discipline to both its own roadmap and competitor summaries. A vendor announcing a direction does not establish delivery.[^9][^12]

Do not rank these products with a single feature score. That would hide differences in collection surfaces, task definitions, rendering, reference data, human work, and billing units. The detailed [AI-search brief](research-ai-search-2026-09-13.md) and [adjacent-product brief](research-adjacent-2026-09-13.md) contain the underlying comparisons and pricing caveats.

## Public pricing and packaging

These are public-source snapshots, not equivalent workload quotes. They describe different combinations of prompts, engines, credits, pages, retention, and executions. No paid competitor account was tested.

| Product | Public commercial signal | Interpretation |
| --- | --- | --- |
| Profound | Retrieved display: $99 Starter and $399 Growth.[^14] | Billing-toggle state was not established in the extracted view; do not derive an annual quote. |
| Scrunch | Conflicting official package representations.[^15] | One view lists $300 monthly Starter, another $250 Core with different allowances. Treat current packaging as unresolved. |
| Peec AI | Current plan allowances readable; current monetary amounts not verified.[^16] | Dated amounts in the supporting brief should not become current homepage comparisons. |
| OtterlyAI | Monthly Lite $29, Standard $189, Premium $489.[^17] | Prompt and engine coverage differ; added engines may cost extra. |
| Semrush | AI toolkit display: $99/month/domain, billed annually.[^18] | This is not a quote for every SEO product or reporting add-on. |
| Ahrefs | Platform indexes and custom checks have separate prices.[^7] | Confirm plan entitlements and workload before comparing a subscription. |
| Screaming Frog | £199 / US$279 / €245 per person per year.[^19] | A crawler licence is not a hosted model-evaluation allowance. |
| Braintrust | Starter $0; Pro $249/month plus applicable usage.[^20] | Retention, scores, inference, and overages matter independently. |
| Inspect AI | Open-source framework.[^11] | Inference and operating work remain separate costs. |

Folio should validate a unit of customer value before setting new prices. Candidate offers include a one-off question review, a recurring review of a stable question set, and an agency workflow across client sites. None is an active commercial product established by this report. Existing Folio pricing remains proposed; actual billing and recurring paid monitoring require separate implementation.

Avoid claiming Folio is cheaper from subscription sticker prices. First define a workload: sites, pages per question, number of questions, model settings, trials, retention, human reference review, and retests. Measure actual provider costs and unresolved usage before promising a margin or credit allowance. This is an operating recommendation, not a financial forecast.

## Customer suites

A suite should represent a recognizable customer decision, not just a sector name. The buyer chooses the task and supplies approved references; the evaluator records what was available, what was answered, and which assertions passed. Common mechanics can serve several markets while preserving different task definitions.

| Proposed suite | Example customer question | Required reference | Measurable first outcome | Later capability, separately gated |
| --- | --- | --- | --- | --- |
| Software and subscriptions | Which plan meets these requirements, and what would five seats cost? | Versioned plan matrix, limits, billing unit and assumptions | Correct plan/feature match and declared calculation; explicit unknowns | Find the right pricing pages independently; test a configured quote |
| Shops and products | Does this variant fit my device, and can I return it after opening? | Exact variant specification and applicable return policy | Correct compatibility and policy conditions, including exceptions | Live inventory/price retrieval; sandbox cart or returns journey |
| Services and local businesses | Do you offer this service in my area, and how do I request a quote? | Service catalogue, geographic coverage, hours, contact routes | Correct service/area answer and documented next step | Discover the correct local page; test an authorized enquiry workflow |
| APIs and developer tools | Will this tool work with our stack, and how is it authenticated? | Versioned API/SDK documentation and prerequisites | Correct documented compatibility, version, authentication and request shape | Execute API/CLI/MCP tasks with independent postconditions |
| Hospitality | Does this room allow our party and pet, and what are the cancellation terms? | Room/rate-specific occupancy and policy records | Correct policy interpretation for the stated scenario | Authorized availability/price lookup and test booking |
| Education and training | Do I meet the prerequisites, what does it cost, and when can I apply? | Approved course/intake catalogue and eligibility rules | Correct stated prerequisites, dates, fees and discretionary exceptions | Follow the application journey in a controlled environment |

All six suites are proposals. The four shown on the revised homepage are illustrative use cases, not new runnable evaluators. The present product-name/price tuple does not establish plan selection, return eligibility, service coverage, or API correctness.

Recommended first release: a shared task/reference contract and a software-plan pack, followed by a small local-service pack to test whether the product generalizes beyond software. This sequence reflects engineering proximity and contrast between tasks, not verified market demand. Ecommerce becomes a strong candidate when a merchant can provide reliable variant and policy references. Developer docs remain a useful parallel category; hospitality and education should follow access to suitably precise references.

No source review can establish which of these is “most popular.” Recruit owners with real questions before ranking market attractiveness. An agency may provide access to several verticals, but a multi-client sales hypothesis is not evidence that team roles or agency entitlements already exist. The [segment specification](research-evaluation-segments-2026-09-13.md) expands these task and reference requirements.

## Keep three experiment types separate

**Understanding supplied evidence.** The model receives frozen pages and answers a declared question. The answer key remains withheld. This can measure extraction, bounded reasoning, arithmetic under stated assumptions, and appropriate abstention after the new task contracts are implemented. It cannot show that the model found the page itself. Current Folio covers a narrow subset of this mode.

**Finding an answer.** The agent starts from a query or URL and must retrieve the relevant sources under a declared tool, locale, and navigation budget. Record “could not find” separately from “found but misunderstood.” A controlled agent's result is an observation of that harness, not a consumer ChatGPT, Claude, or search-engine session. The separate keyword-benchmark work underway belongs in this mode and needs its own validation.

**Completing an action.** The evaluator checks an observable end state: a fixture API response, a test cart state, or another explicitly permitted outcome. It requires a purpose-built environment, approved operations, controlled data, and cleanup. Text claiming that an action worked is insufficient. Real purchases, appointments, or messages are not routine website checks.

An eventual suite can contain tasks at all three levels, but should report them independently. A shop can explain its return policy correctly while its checkout fails. An API can execute successfully when directly supplied yet remain undiscovered in a generic query. Neither observation cancels the other.

## What the existing suite establishes

The code provides useful foundations: private owner-bound evidence, captured-text hashes, deterministic output checks, withheld owner references, exact quote matching, offline verification, explicit paid starts, and comparison rules. Technical readiness, external search observations, and agent verification are already separate concepts. Preserve these boundaries.

The documented managed live evaluation used one `example.com` capture. It establishes a bounded workflow observation, not representative accuracy across industries. A separate developer-homepage batch concerns technical page captures, not API execution. Infrastructure and keyword-benchmark changes are active in another workstream; their presence in the working tree is not independent validation. See [live validation](LIVE-VALIDATION.md), [homepage batch](DEVELOPER-TOOLS-EVALUATION.md), and the current [launch checklist](../TODO.md).

Two local deterministic probes expose why the headline result needs attention:

| Probe | Observed local result | Product implication |
| --- | --- | --- |
| Empty facts, citations and findings; valid readable capture; no reference key | 100% of measured checks passed, with 3 passed and 5 unmeasured | A perfect percentage can contain no useful answer. Lead with task outcomes and missingness. |
| Correct fixture fact values, irrelevant but genuine quotations, unsupported finding text | 8 of 8 checks passed | Occurrence and matching values do not establish that the cited passage supports the claim. |

These probes ran against synthetic input without a model or provider call. They demonstrate verifier semantics, not observed live-model misconduct or a security finding. The [suite assessment](research-suite-assessment-2026-09-13.md) records the source locations, limitations, and proposed acceptance criteria.

## Product priorities and release gates

| Priority | Deliverable | Acceptance evidence |
| --- | --- | --- |
| First | Task-first result summary | Empty extraction cannot appear as overall success; answered, incorrect, failed, and unmeasured counts are legible in UI and export |
| First | Shared task/reference specification and initial plan suite | Versioned cases, approved answer keys, negative cases, field-specific graders, and named scope |
| Next | Claim-to-source evidence links | Irrelevant genuine quotes fail support while occurrence can still pass; wrong plan, variant, locality and version are distinguishable |
| Alongside the suites | Complete experiment manifest | Query, source, references, locale, model, prompts, tools, grader and environment changes are explicit and affect comparison eligibility |
| Next | Saved finding/change/retest record | A downloaded repair is distinct from an implemented change; a later result links comparable observations and explains differences |
| After calibration | Repeated authorized trials and monitoring | Trial counts include failures, variability is reported, spend limits hold, and freshness cannot be triggered by navigation |

Use task-specific reference states: known answer, confirmed absent, ambiguous, and no reference. Correct abstention on a deliberately unanswerable question should be measurable separately from missing ground truth. Keep integrity checks as prerequisites and diagnostics; they should not dominate a customer-facing task-success percentage.

Semantic grading needs calibration. Start with explicit typed facts and reviewed evidence spans. Before adding a model grader, build supported/contradicted/irrelevant/insufficient examples labelled by people, and report disagreement and false support. ALCE is a useful precedent for separating answer correctness from citation quality; it does not validate Folio's current grader.[^21]

Repeated trials should follow a pilot that estimates variability. Predeclare task cohorts and retain unavailable attempts; do not count every citation within one answer as an independent observation. HELM's emphasis on standardized scenarios, coverage, and multiple metrics is a methodological reference, not permission to present a universal Folio rank.[^22]

## Positioning and landing-page changes

The revised page uses **“Put your website to the test.”** It immediately explains the existing action: inspect what an AI reader takes from a captured page, compare answers with supplied references, and review changes. Four proposed suites make the wider direction concrete without restricting the brand to developer tools.

The hero now shows a fictional evidence report instead of invented numeric rankings for real companies. Its missing pricing reference remains visible. Product copy names the current product-name/pricing scope, preserves manual publishing and explicit fresh runs, and separates search observations from task completion. The evaluation link opens the existing workspace; it does not start work. Privacy and competitor sources remain accessible.

Mobbin references helped evaluate how a landing page can identify an audience and show the work product early. The inspected [Anchor example](https://mobbin.com/sites/sections/d99917c8-d6a4-42f2-92ce-00e32442c35c) pairs audience copy with a request example; the [Mural example](https://mobbin.com/sites/sections/d98fd0c4-8ff4-4ef8-bf82-c2597b1edb38) pairs an API use case with a documentation action. Folio keeps its own cream/green editorial design and uses a report as the preview. These are visual references, not evidence of conversion gains.

Keep present-tense claims narrow: private evidence inspection, product/pricing reference checks, deterministic technical audits, repair downloads, and saved comparisons. Do not claim all proposed suites are available, that Folio monitors consumer-AI visibility, that literal quotes prove semantic support, or that an observed score change causes conversion or ranking improvements. A clear limit belongs beside the affected result, not hidden in a general disclaimer.

## Customer validation and commercial decisions

Run exploratory interviews and report reviews across at least two contrasting website types. Ask each owner for recent questions, approved answers, and intended source pages. Record how questions were selected; an owner-selected challenge set is useful but not a representative population sample.

Have owners and an independent reviewer label a small set before model runs. Include a correct answer, a wrong answer, and an unmeasured case in report walkthroughs. Observe whether the owner can identify the issue, choose an actionable edit, and interpret a retest without a verbal explanation from the product team.

Evaluate willingness to pay using the actual deliverable and an explicit scope. Compare one-off reviews, repeated checks of known questions, and an agency review service. Keep these commercial experiments distinct from enabled checkout or paid subscriptions. Recruit based on access to reliable references and ownership of a repair workflow, not only interest in an AI score.

Track proposed success measures: time to identify an actionable failure, reviewer agreement, proportion of tasks with usable reference data, implementation of a chosen edit, interpretation of the retest, repeat use, and cost per informative result. Set decision thresholds before a trial; this report does not invent validated targets. If owners cannot produce references or do not act on reports, revise the task and offer before expanding the benchmark catalogue.

## Evidence scope and sources

Research accessed 13 September 2026. This report synthesizes current first-party product material, local source review, and two synthetic verifier probes. Vendor capabilities are advertised descriptions unless explicitly identified otherwise. No competitor accounts were opened, no paid competitor evaluation was executed, and no commercial outcome was independently reproduced. A capability absent from a retrieved page remains unknown.

Price representations were inconsistent or incomplete for some vendors; the table retains those uncertainties. Collection counts are deliberately omitted from the main comparison because page snapshots and populations differ. Production deployment and the separate keyword-runner implementation are outside this report's validation scope.

The supporting briefs provide additional detail: [AI search platforms](research-ai-search-2026-09-13.md), [SEO and evaluation infrastructure](research-adjacent-2026-09-13.md), [suite assessment](research-suite-assessment-2026-09-13.md), and [customer-specific suite design](research-evaluation-segments-2026-09-13.md). Earlier research files contain stale future-tense descriptions of managed evaluations; use current implementation documents for capability status.

[^2]: Profound. [Content Optimization](https://www.tryprofound.com/features/agents/content-optimization). Undated live product page.
[^3]: Scrunch. [API explanation](https://scrunch.com/faqs/what-apis-does-scrunch-offer-and-how-do-they-work); [Agent Experience Platform](https://scrunch.com/platform/agent-experience/). Undated live pages.
[^4]: Peec AI. [Introduction and collection methodology](https://docs.peec.ai/intro-to-peec-ai). Undated live documentation.
[^5]: OtterlyAI. [Brand report KPI definitions](https://help.otterly.ai/brand-report-kpi-definition). Undated live documentation.
[^6]: Semrush. [Getting started with the AI Visibility Toolkit](https://www.semrush.com/kb/1496-getting-started-with-ai-visibility-toolkit). Undated live guide.
[^7]: Ahrefs. [Brand Radar guide](https://help.ahrefs.com/en/articles/11064852-what-is-brand-radar-and-how-to-use-it); [Patches documentation](https://help.ahrefs.com/en/articles/9775727-how-patches-work-in-site-audit). Live documentation.
[^8]: Screaming Frog. [SEO Spider overview](https://www.screamingfrog.co.uk/seo-spider/); [Crawl comparison](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-compare-crawls/). Undated live pages.
[^9]: AgentReady.me. [Scoring methodology and limitations](https://www.agentready.me/methodology). Editorial review August 30, 2026.
[^10]: Braintrust. [Evaluation overview](https://www.braintrust.dev/docs/evaluate); [Experiment comparison](https://www.braintrust.dev/docs/evaluate/compare-experiments). Undated live documentation.
[^11]: UK AI Security Institute. [Inspect AI](https://inspect.aisi.org.uk/); [Evaluation logs](https://inspect.aisi.org.uk/eval-logs.html). Undated live documentation.
[^12]: AgentReady.me. [AI Agent Testing Platform for Real Journeys](https://www.agentready.me/agent-testing-platform). Product direction page; production runner described as not live.
[^14]: Profound. [Pricing](https://www.tryprofound.com/pricing). Retrieved display; billing-toggle ambiguity retained.
[^15]: Scrunch. [Pricing](https://scrunch.com/pricing); [Pricing FAQ](https://scrunch.com/faqs/what-is-the-pricing-for-scrunch-plans). Conflicting first-party package descriptions.
[^16]: Peec AI. [Plans](https://peec.ai/pricing); [Vendor reference](https://peec.ai/ai-instructions). Current amounts not verified; supporting reference dated July 2026.
[^17]: OtterlyAI. [Pricing](https://otterly.ai/pricing/). Monthly display snapshot.
[^18]: Semrush. [AI Visibility pricing](https://www.semrush.com/pricing/ai/). Annual-billing display snapshot.
[^19]: Screaming Frog. [SEO Spider FAQ](https://www.screamingfrog.co.uk/seo-spider/faq/). Annual licence prices.
[^20]: Braintrust. [Pricing](https://www.braintrust.dev/pricing). Base plans; usage terms separate.
[^21]: Gao et al. [Enabling Large Language Models to Generate Text with Citations](https://arxiv.org/abs/2305.14627), 2023; [ALCE implementation](https://github.com/princeton-nlp/ALCE).
[^22]: Liang et al. [Holistic Evaluation of Language Models](https://arxiv.org/abs/2211.09110), 2022.
