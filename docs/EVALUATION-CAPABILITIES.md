# Evaluation capability review

Reviewed 13 September 2026. The central workflow is now `/evaluations`: Search questions opens first, with Page evidence alongside it. Search observations, HTML checks and document diagnostics answer different questions and have separate evidence.

## What works

| Workflow | Implemented behavior | Validation boundary |
| --- | --- | --- |
| Customer questions | Four six-question packs cover team software, shopping, service booking and learning; custom suites accept 1–10 ordered questions, language and location | Input fixtures and real isolated D1 persistence/owner checks; saving starts no provider work |
| Search observations | One explicit question starts an Astra open-web observation; the saved answer retains original recommendation order, reasons, citations and provenance | Two actual private open-web searches were recorded earlier; broader question packs have not been run live |
| Read saved answers | Per-question history, result reports, baseline/fresh comparison, exports and completed-question coverage | Desktop/mobile fixture checks; saved results are not silently re-created |
| Page evidence | Captured content, reference comparison, source checks and explicit fresh evaluation | Existing live smoke evidence and offline reproduction; new navigation checked with fixtures |
| Discovery documents | Inspect robots.txt, llms.txt, llms-full.txt and sitemap.xml content; distinguish missing, blocked, malformed and bounded captures | Parser and scanner fixtures, with HTTP status preservation and no traversal |
| Public website audits | 36 independently captured public homepages across five audiences | Actual HTML captures reproduced offline; these are HTML observations, not recommendation rankings |
| Public search ranking table | Displays reviewed completed observations in recorded order and keeps empty queries explicit | Three prepared queries, zero published observations; populated-result QA awaits collection |

## What does not work yet

- New provider collection is on hold after an ambiguous third session-creation attempt. Its unknown outcome is retained; no automatic replacement is started.
- The sandbox currently validates the structured research output and records its command evidence. It is **not an independent factual or semantic judge** of the answer. Returned citations and recommendation reasons do not prove their claims.
- Multiple questions provide wider coverage, but the app does not turn their results into a validated overall product-quality score. Completion counts describe progress, and recommendation positions describe recorded answers.
- Broad fresh collection, repeated trials, independent answer keys and consumer ChatGPT/other chat-surface measurements are not completed.
- Discovery parsing does not prove crawl access, indexing, citation likelihood or model use. llms.txt is optional; llms-full.txt is an optional full-text convention. Robots is a directive inventory, not a crawler-policy engine. Sitemap analysis does not check complete site coverage or full XSD validity.
- Production deployment, public OAuth onboarding and billing remain separate launch dependencies.

## Useful next judging work

After the held provider outcome is resolved, run one deliberately chosen multi-question suite before broadening collection. Keep each question’s exact text, audience, location, returned answer and sources. Repeat identical questions on separate runs to expose variation; a single answer cannot establish stable visibility.

For an independent judge, define a separate versioned rubric for task completion, answer relevance, supported claims, citation entailment and abstention. Freeze source evidence and human-reviewed answer keys independently of the answering model, include adversarial and missing-evidence cases, and check agreement with human review before publishing aggregate scores. Report each dimension and its measured coverage instead of merging it with HTML points or treating absent answers as failures.

Discovery diagnostics can help explain source availability. They should remain evidence beside the search observations; attributing a recommendation change to a file edit would require controlled repeated evaluation.

## Document inspection bounds and sources

The scanner follows its existing exact-domain allowlist and redirect checks. It fetches four root paths with a four-second bound per document. Analysis caps are 512,000 bytes for robots.txt, 256,000 for llms.txt, and 2,000,000 for llms-full.txt/sitemap.xml. Retained link lists are capped; the stored scan detail uses small samples. A capture bound is not a protocol validity limit.

References: [Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309.html), [llms.txt proposal](https://llmstxt.org/), [llms.txt changes and optional conventions](https://llmstxt.org/changes.html), and [Sitemap protocol](https://www.sitemaps.org/protocol.html). Source documents are parsed as evidence, never executed as instructions.
