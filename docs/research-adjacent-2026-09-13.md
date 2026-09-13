# Folio: adjacent competitors and evaluation engineering references

Research access date: **13 September 2026**. Scope: five comparators selected for the decisions Folio faces now—Semrush, Ahrefs, Screaming Frog, Braintrust, and Inspect AI. This is a first-party documentation review, not a product trial, purchase recommendation, or independent validation of vendor outcomes. No accounts were created, subscriptions purchased, or competitor evaluations executed. Undocumented capabilities are unknown, not proven absent. Prices below are public page snapshots and exclude unverified taxes, discounts, and account-specific terms.

## Decision

Folio should position its private pilot around **understanding how a captured website supports an agent's answer, inspecting the evidence, and deciding what to change**. Its technical checks, search observations, and agent verification should remain separate measurements. Competing on a larger AI-visibility database or a more comprehensive crawler would put the pilot against established specialist infrastructure. Competing on a generic evaluation dashboard would put it against mature engineering tools.

That positioning is a strategic inference, not a demonstrated market advantage. Customer research still needs to establish whether a focused website workflow is valuable enough to pay for. Export, comparison, transparency, historical records, and repair handoffs already appear in competitors' documentation; none is a supportable exclusive claim.

## Comparison at a glance

Buyer descriptions below are inferred from the documented workflows. The product details are the vendors' advertised capabilities, not outcomes reproduced for this report.

| Comparator | Buyer and job | Measurement unit | What Folio should learn |
| --- | --- | --- | --- |
| Semrush AI Visibility Toolkit | Marketing/SEO team researching and monitoring brand presence | Brand mentions, citations, prompt visibility, and separate site checks | Keep the measurement layer clear; show the question and source behind each observation. |
| Ahrefs Brand Radar and Site Audit | SEO team connecting discovery, competitive research, and changes | AI-answer records/custom checks; separately, URL-level technical findings and patches | A report-to-change workflow is established; document exactly what a repair modifies. |
| Screaming Frog SEO Spider | Technical SEO or agency diagnosing websites and migrations | Crawled URLs, page elements, links, issues, and differences between crawls | Make capture scope, rendering, comparison conditions, and changed evidence visible. |
| Braintrust | AI engineering/product team comparing application versions | Dataset case → task output → scorer result; experiment/trial | Stable case IDs, explicit baselines, failure drilldowns, and repeatability are basic expectations. |
| Inspect AI | Research/engineering team designing model or agent evaluations | Dataset sample × task/model configuration × epoch | Separate obtaining an answer from scoring it; retain enough configuration to interpret the result. |

## Semrush: a broad search-marketing workflow

Semrush documents a journey through brand visibility, competitor gaps, prompt research, sentiment, strategic recommendations, daily custom-prompt tracking, and technical checks. It also describes CSV/PDF/report-sharing options, while noting export availability varies by tool. Optimization can involve manual work or other toolkits. These capabilities establish that competing suites do more than count mentions. The underlying unit is an observed AI/search presence or technical condition; it is not automatically verified correctness against a website owner's private reference answer. [Getting-started guide](https://www.semrush.com/kb/1496-getting-started-with-ai-visibility-toolkit).

The retrieved AI Visibility pricing page displays **$99/month per domain, billed annually**, including 25 custom prompts and one domain for Brand Performance. It lists reporting and user add-ons separately. This is the AI toolkit's displayed offer, not a quote for the complete SEO suite or every reporting capability. [AI Visibility pricing](https://www.semrush.com/pricing/ai/).

**Implication:** Folio's separate Search Console, DataForSEO, technical, and agent views are a credible choice about measurement clarity. Avoid claims that all-in-one SEO/AEO is new, competitors offer no actions, or passing readiness checks will cause citation gains.

## Ahrefs: discovery scale plus an established repair handoff

Brand Radar combines broad indexed AI answers with custom prompts, brand comparisons, saved report configurations, historical views, citations, and API access. Its documentation distinguishes index freshness from custom-prompt frequency and explains its search-derived prompt collection. Public prices are **$199/month per platform index**, **$699/month for all platforms**, or custom tracking from **$50/month for 2,500 checks**, with separate overages. The page mixes standalone and paid-plan entitlement descriptions; verify exact checkout requirements before a purchase. Collection scale is a vendor claim, not coverage of every user's conversation. [Brand Radar guide and pricing](https://help.ahrefs.com/en/articles/11064852-what-is-brand-radar-and-how-to-use-it).

Ahrefs Patches supports title/meta-description drafts, publishing/unpublishing, history, and exports. Its guide describes temporary changes and warns that JavaScript deployment is invisible to bots that do not execute JavaScript. That is a concrete example of why a repair's deployment mechanism matters. A patch is not inherently evidence of improved search or task success. [Patches documentation](https://help.ahrefs.com/en/articles/9775727-how-patches-work-in-site-audit).

**Implication:** Folio can emphasize reviewable source observations and a bounded repair download, but should not imply it invented audit-to-fix workflows. A future change record should capture implementation location, verification conditions, and the later capture, rather than count a download as a successful fix.

## Screaming Frog: the technical evidence baseline

SEO Spider is a desktop crawler with raw-HTML and JavaScript-rendering options, extraction, technical checks, and data exports. Its product page distinguishes the 500-URL free crawl from advanced licensed capabilities. These are substantially broader crawl operations than Folio's bounded captured-page rubric; a Folio result should never appear to certify an entire website. [SEO Spider overview](https://www.screamingfrog.co.uk/seo-spider/).

The crawl-comparison guide documents saved-crawl comparisons, changed issues and page elements, content-change detection, and URL mapping for environments such as staging and production. Comparison requires a licence and database storage mode. These are observations of what changed between captures; attributing ranking or business results to a change still requires a separate experiment. [Crawl comparison](https://www.screamingfrog.co.uk/seo-spider/tutorials/how-to-compare-crawls/).

Its FAQ confirms **£199 / US$279 / €245 per person per year**. The free version is limited to 500 URLs per crawl; advanced features and saved-crawl workflows require licensing. [Pricing FAQ](https://www.screamingfrog.co.uk/seo-spider/faq/).

**Implication:** Folio should make one-page scope, capture time, source changes, and failed/unmeasured checks easier to interpret. Do not promise crawler depth as an advantage. An eventual repair-and-retest flow must preserve the relationship between each finding, applied change, and later observation.

## Braintrust: the product standard for evaluation iteration

Braintrust describes evaluations as data, task, and scoring functions, with expected outputs optional. It separates quick playground iteration from stored experiments and production scoring. That makes it an engineering comparator, rather than a direct website-marketing substitute. Custom scorers can express a website rubric, but a framework cannot supply trustworthy reference answers by itself. [Evaluation overview](https://www.braintrust.dev/docs/evaluate).

Its experiment documentation supports repeated trials of each input, including per-case trial counts. [Create experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations). Comparisons align cases to a baseline, show per-case regressions and output differences, group repeated trials, and support CSV/JSON/PDF exports. The UI's raw export is capped at 1,000 rows, with API access for larger exports. This establishes that saved evidence, exports, and side-by-side runs are not exclusive differentiators. [Experiment comparison](https://www.braintrust.dev/docs/evaluate/compare-experiments).

Public pricing shows **Starter $0/month** with 10,000 scores and 14-day retention, and **Pro $249/month** with 50,000 scores and 30-day retention. Usage allowances, model credits, and overages are listed separately. Do not compare its base subscription directly with a Folio paid-run price without a workload and retention model. [Pricing](https://www.braintrust.dev/pricing).

**Implication:** Prioritize understandable failures, stable question identities, frozen references, and explicit comparison conditions. Repeated trials and a saved change-to-retest record are potential improvements, not existing pilot claims. Folio's advantage would have to come from the website task and customer workflow, not generic experiment mechanics.

## Inspect AI: a methodology and implementation reference

Inspect is an open-source evaluation framework with datasets, solvers/agents, scorers, tools, sandboxing, and a log viewer. It evaluates model/agent behavior under a task definition. Model access is separately configured; open-source software does not imply cost-free inference or zero operating effort. It is a useful alternative for a technically capable team building its own evaluation harness. [Inspect overview](https://inspect.aisi.org.uk/).

Evaluation logs preserve task/model configuration, samples, outputs, scores, errors, and usage. A run's configuration can be exported for a new invocation; this reproduces conditions, not a guarantee of identical model answers. [Log files](https://inspect.aisi.org.uk/eval-logs.html). Inspect also supports rescoring an existing log with another scorer. Rescoring retained output and rerunning inference are distinct operations, and a model-based scorer may itself call a provider. [Task and rescoring documentation](https://inspect.aisi.org.uk/tasks.html).

**Implication:** Keep Folio's no-network offline evidence verification distinct from paid frozen replay and fresh capture. Publish enough rubric detail for the score to be understood, retain failure states, and version changes to scoring. Inspect is a reference for those practices, not a reason to replace Folio's authorized managed Agents API runtime.

## Recommended product and landing changes

1. **Lead with the customer's decision.** Explain that Folio helps a website team inspect what an agent answered from captured pages and identify what needs clarification. Demonstrate one question, answer, supporting quote, and reference comparison. Avoid an unsupported global “AI readiness” outcome.
2. **Give each measurement its own name.** Technical readiness, Search Console observations, estimated SEO data, and agent evidence checks answer different questions. An overall index should not conceal those differences or suggest causal uplift.
3. **Show the present loop accurately.** Capture → run/inspect → compare/export → review a repair → manually implement → explicitly evaluate again. The customer can use these current pieces; a durable change-to-retest record remains roadmap work according to `TODO.md`.
4. **Make the sample useful.** A sample report can show failed, passed, and unmeasured checks and what the customer receives. Label fixture results beside the result itself, including screenshots and exports. Do not present sample rankings as customer evidence.
5. **Use a specific proof promise.** An inspectable result is defensible; “guaranteed AI visibility,” “trusted truth,” “beats competitors,” and “fixes itself” are not supported by this research or the current pilot.

The public landing page can name alternatives in an honest FAQ, but detailed feature/pricing comparisons belong in dated research. Vendor prices and product scopes change too quickly to serve as permanent homepage claims.

## Internal-context correction and limits

The earlier [SEO research](research-seo.md) and [evaluation research](research-evaluations.md) contain dated “future” statements about orchestration that must not be copied as a current implementation inventory. [TODO.md](../TODO.md) records a working private managed run, owner reference answers, comparison, offline verification, and bounded local live validation; it separately leaves production deployment, recurring fresh monitoring, and independent public benchmarks unfinished. This report does not expand those validation claims or certify current code execution.

A useful follow-up market test is to give several website owners the same concrete sample report and ask which decision it changes, what evidence they would challenge, and what repair they would implement. Measure the time from inspecting a failed question to a reviewed change and a clearly interpretable retest. These are proposed validation criteria, not customer findings.
