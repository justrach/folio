# Website directory coverage

Source review: **13 September 2026**. The catalog now contains **36 websites**: the original 24 developer-tool entries plus 12 websites spanning workplace software, retail, services/travel, and learning. Existing IDs are preserved. Audience labels are editorial groupings; inclusion does not establish customer demand, product quality, a recommendation, or a purchased placement.

The directory's broader audience coverage does not create new task suites. Folio's actual page evaluations still use the bounded `readiness-v1` HTML rubric. A technical result does not test a store's checkout, a tour booking, service availability, learning outcomes, or an API integration. Actual capture timestamps, failures, checks and measured results belong to the separate [evaluation record](DEVELOPER-TOOLS-EVALUATION.md).

## What the completed batch found

Batch `2026-09-13T04-44-48-052Z-429a6072` measured all 36 public pages. The original eight capture failures were resolved through a larger bounded capture and Cloudflare's reviewed canonical URL. All public results and the separate local preview reproduced offline from their saved captures.

Across these captured pages, 14 titles received partial points, 10 pages failed the structured-data check, nine descriptions received partial points, and nine primary-heading checks received partial or no points. These are findings under Folio's fixed HTML rubric, not evidence of commercial harm or poor agent task performance. The directory now counts partial checks as needing attention as well as showing explicit failures.

The next useful expansion is customer-question coverage with reviewed reference answers: plan inclusions for software, returns and shipping for shops, service areas and booking terms for services, and prerequisites and course format for learning. Each needs its own cases and evidence before it can become a scored suite. Rendered-page comparison is another useful next step: Duolingo's valid client-rendered shell has little text in the captured HTML, which the current rubric records without claiming to measure the rendered experience.

A separate two-page Chromium diagnostic found 182 rendered content words on Duolingo where the saved raw-HTML rubric found none, and 269 rendered content words on Notion versus 173 in the raw capture. Fresh unauthenticated browser contexts blocked non-GET requests; no forms or accounts were used. The later captures and extraction methods differ, so these observations support developing a distinct rendered capture mode. They do not revise the saved HTML scores or establish that a rendered rubric would be more accurate. Diagnostic bodies remain in ignored local storage.

## Added coverage and official sources

The descriptions in `src/data/developer-tools.json` are brief original summaries of the linked official pages. The `observedAt` field records source review, not evaluation execution. New records carry official website and product/help/about references; they contain no third-party reports or scores.

| Audience | Websites | Source basis |
| --- | --- | --- |
| Software & work | Notion | [Product](https://www.notion.com/), [help](https://www.notion.com/help): documents, knowledge, projects and shared workflows. |
| Software & work | Slack | [Singapore English homepage](https://slack.com/intl/en-sg/), [help](https://slack.com/help): conversations, channels, meetings and automation. |
| Software & work | Basecamp | [Homepage](https://basecamp.com/), [features](https://basecamp.com/features): project management, to-dos, message boards and shared files. |
| Shops & brands | IKEA | [US homepage](https://www.ikea.com/us/en/), [customer service](https://www.ikea.com/us/en/customer-service/): furniture, home furnishings and product support. |
| Shops & brands | Allbirds | [Homepage](https://www.allbirds.com/), [help](https://www.allbirds.com/pages/help): shoes, apparel and shopping information. |
| Shops & brands | Everlane | [Homepage](https://www.everlane.com/), [about](https://www.everlane.com/pages/about): clothing, accessories and product information. |
| Services & travel | Taskrabbit | [Homepage](https://www.taskrabbit.com/), [services](https://www.taskrabbit.com/services): home assembly, moving, cleaning and repairs. |
| Services & travel | Intrepid Travel | [English homepage](https://www.intrepidtravel.com/en), [about](https://www.intrepidtravel.com/en/about): guided small-group travel and itineraries. |
| Services & travel | G Adventures | [Homepage](https://www.gadventures.com/), [about](https://www.gadventures.com/about-us/): small-group tours and travel styles. |
| Learning | Coursera | [Homepage](https://www.coursera.org/), [about](https://www.coursera.org/about): courses, certificates and degree programs. |
| Learning | Duolingo | [Homepage](https://www.duolingo.com/), [official product explanation](https://blog.duolingo.com/new-subjects/): language, math and music lessons. |
| Learning | edX | [Homepage](https://www.edx.org/), [about](https://www.edx.org/about-us): online courses, professional certificates and degrees. |

The 24 existing entries retain their official source references and are grouped under **Developer tools**. This preserves their original integration-oriented descriptions; a product such as Box can serve other audiences too. The label identifies this catalog's chosen framing, not an exclusive market definition.

## Selection and capture conditions

This is a small editorial convenience sample. Selection aimed to broaden the kinds of websites available for inspection while retaining the established developer coverage. It is not a representative sample of industries, countries, popularity, or AI visibility. Three entries in each new group do not support group-level performance claims.

The new homepage URLs returned HTTP 200 in a lightweight public HTTP preflight from the local environment. That check established reachability only; it used a different request path from Folio's evaluator and did not create a score. Some returned minimal HTML shells, and IKEA returned more than the one-megabyte preflight sample limit. The actual bounded evaluator must retain any size, access, timeout, or content failure rather than treat preflight success as measured success.

Initial candidate checks returned access errors for Marriott, Hilton, Expedia, Patagonia, Rick Steves, GetYourGuide and FutureLearn. Khan Academy returned HTTP 200 but its body was a client challenge, so it was excluded rather than given a page score. These candidates were not included in this expansion; no access controls were bypassed. This selection limits what can be inferred about the broader market. A different network, locale, time, or rendered-browser harness may observe different access conditions.

Slack's public homepage redirected to the Singapore English page from the local network, so the catalog records that exact destination. IKEA explicitly uses its US storefront; Intrepid uses its English landing page. Comparisons should retain those different page and locale conditions. Cloudflare Workers' old hostname redirected to its [official product page](https://www.cloudflare.com/products/workers/); the catalog now targets that exact URL rather than broadening the evaluator's redirect permissions.

## Metadata contract

The existing `DeveloperTool` and `DEVELOPER_TOOLS` exports remain named for compatibility with saved record IDs. They now describe the broader catalog. `audience` is required and is validated against the exported `WEBSITE_AUDIENCES` list: Developer tools, Software & work, Shops & brands, Services & travel, and Learning. `WebsiteAudience` and its compatibility alias `DeveloperToolAudience` provide the same union type.

`docsUrl` remains the compatibility field for an official documentation, help, product, or organization reference. It should be presented as an official reference when the site is not a developer tool. Website identity, source description, capture evidence, and measured evaluation outcomes remain separate records.
