# Evaluation capability review

Reviewed 13 September 2026 after the public collection batch. The public dashboard now contains **35 questions and 24 published live answers across five audiences**. The latest 20 questions were submitted with 20 concurrent workers: 18 completed and two remain unresolved. The earlier 15-question collection retains six completed answers, one unresolved creation and eight unstarted questions. Current machine-readable counts come from the public artifacts, not this dated summary.

The central workflow is `/evaluations`: Search questions opens first, with Page evidence alongside it. Search observations, HTML checks and document diagnostics answer different questions and have separate evidence.

## What works

| Workflow | Implemented behavior | Validation boundary |
| --- | --- | --- |
| Customer questions | Four six-question packs cover team software, shopping, service booking and learning; custom suites accept 1–10 ordered questions, language and location | Input fixtures and real isolated D1 persistence/owner checks; saving starts no provider work |
| Search observations | One explicit question starts an Astra open-web observation; the saved answer retains original recommendation order, reasons, citations and provenance | 24 actual public answers now include recorded searches, completed final JSON and hosted-sandbox validation evidence; earlier private trials remain separate |
| Read saved answers | Per-question history, result reports, baseline/fresh comparison, exports and completed-question coverage | Desktop/mobile fixture checks; saved results are not silently re-created |
| Page evidence | Captured content, reference comparison, source checks and explicit fresh evaluation | Existing live smoke evidence and offline reproduction; new navigation checked with fixtures |
| Discovery documents | Inspect robots.txt, llms.txt, llms-full.txt and sitemap.xml content; distinguish missing, blocked, malformed and bounded captures | Parser and scanner fixtures, with HTTP status preservation and no traversal |
| Public website audits | 36 independently captured public homepages across five audiences | Actual HTML captures reproduced offline; these are HTML observations, not recommendation rankings |
| Public question dashboard | Displays reviewed completed observations in recorded order, sources and individual collection status without requiring login | 35 prepared questions, 24 published answers, three unresolved attempts and eight unstarted questions; strict projection/API and desktop/mobile validation |

## What the live answers showed

The original six comparisons covered deployment, authentication, isolated execution, vector search, web research and application analytics. They returned 20 recommendation rows covering 19 catalog websites, with 59 distinct citation URLs. The later batch added practical website-specific questions about workplace permissions, shopping, delivery and returns, service booking, travel and learning.

The answers contain concrete evidence gaps. Agents reported unreadable or moved documentation URLs, prices missing from extracted tables, contradictory plan information and locale-dependent pricing. Examples include Better Auth SSO entitlements, Daytona GPU limits, Notion's pricing locale/billing interval, and IKEA pickup-policy differences. These are **agent-reported observations**, not independent confirmation that a website is broken. Each published answer retains its own limitations and sources.

Some questions return a sequence of recommended actions or resources rather than competing websites. IKEA shopping checks and Notion export checks are examples. Their list order must not be interpreted as a ranking of companies. Named-product questions test research of that product; they do not measure unprompted discovery.

## What does not work yet

- Three public attempts remain unresolved. One of the two unresolved new-batch attempts recovered its session receipt through a provider GET; its terminal result and cancellation outcome were still unconfirmed. The other lacks a confirmed session ID. Original attempts and unknown usage remain saved; no replacement was submitted.
- The sandbox currently validates the structured research output and records its command evidence. It is **not an independent factual or semantic judge** of the answer. Returned citations and recommendation reasons do not prove their claims.
- Multiple questions provide wider coverage, but the app does not turn their results into a validated overall product-quality score. Completion counts describe progress, and recommendation positions describe recorded answers.
- The 24 public answers broaden audience coverage, but repeated trials, independent answer keys and consumer ChatGPT/other chat-surface measurements are not completed.
- Discovery parsing does not prove crawl access, indexing, citation likelihood or model use. llms.txt is optional; llms-full.txt is an optional full-text convention. Robots is a directive inventory, not a crawler-policy engine. Sitemap analysis does not check complete site coverage or full XSD validity.
- Production deployment, public OAuth onboarding and billing remain separate launch dependencies.

## Useful next judging work

The next judging step is to evaluate the saved answers, retaining each question's exact text, audience, location and sources. Record whether every requested dimension was answered, which claims have supporting passages, and which evidence remained inaccessible. Repeat identical questions on separate explicitly started runs to expose variation; a single answer cannot establish stable visibility.

For an independent judge, define a separate versioned rubric for task completion, answer relevance, supported claims, citation entailment and abstention. Freeze source evidence and human-reviewed answer keys independently of the answering model, include adversarial and missing-evidence cases, and check agreement with human review before publishing aggregate scores. Report each dimension and its measured coverage instead of merging it with HTML points or treating absent answers as failures.

Discovery diagnostics can help explain source availability. They should remain evidence beside the search observations; attributing a recommendation change to a file edit would require controlled repeated evaluation.

## Document inspection bounds and sources

The scanner follows its existing exact-domain allowlist and redirect checks. It fetches four root paths with a four-second bound per document. Analysis caps are 512,000 bytes for robots.txt, 256,000 for llms.txt, and 2,000,000 for llms-full.txt/sitemap.xml. Retained link lists are capped; the stored scan detail uses small samples. A capture bound is not a protocol validity limit.

References: [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html), [llms.txt proposal](https://llmstxt.org/), [llms.txt changes and optional conventions](https://llmstxt.org/changes.html), and [Sitemap protocol](https://www.sitemaps.org/protocol.html). Source documents are parsed as evidence, never executed as instructions.
