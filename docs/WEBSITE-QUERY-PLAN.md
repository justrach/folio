# Website search evaluation plan

Prepared 13 September 2026. The [query data](../src/data/website-search-queries.json) contains **15 first-batch questions across five audiences**, with editorial coverage targets for **31 of the 36 catalog websites**. It also contains **72 follow-up questions: two for every website**. These are prepared inputs, not completed observations or scores.

The first batch emphasizes decisions people make: product fit, setup, cost, permissions, shipping, returns, booking conditions and learning access. The separate HTML rubric and discovery-document diagnostics do not answer these questions.

## First collection batch

| Query ID | Question focus | Catalog websites to inspect in the result |
| --- | --- | --- |
| `deploy-small-node-app-v1` | Node.js application and database: setup, cost, runtime limits | Vercel, Render, Railway, Cloudflare Workers |
| `auth-b2b-small-team-v1` | GitHub login now, enterprise SSO later | Better Auth, Clerk, WorkOS, Auth0 |
| `sandbox-python-jobs-v1` | Isolated Python execution and occasional GPU jobs | E2B, Daytona, Modal |
| `vector-search-small-app-v1` | Document search, filters, hosting and costs | Chroma, Qdrant, Pinecone |
| `research-api-citations-v1` | Web search, extraction and source evidence | Firecrawl, Exa, Tavily |
| `sentry-posthog-product-team-v1` | Application diagnosis versus product analytics | Sentry, PostHog |
| `client-project-workspace-v1` | Client projects and documents for five staff | Notion, Basecamp |
| `team-chat-history-v1` | Chat history and external guests for ten staff | Slack |
| `allbirds-first-order-v1` | Sizing, materials, care and purchase terms | Allbirds |
| `everyday-clothing-returns-v1` | Clothing sizing, fabric, delivery and returns | Everlane |
| `ikea-small-apartment-v1` | Desk dimensions, delivery, assembly and returns | IKEA |
| `taskrabbit-assembly-booking-v1` | New York City assembly availability, price and cancellation | Taskrabbit |
| `japan-small-group-comparison-v1` | Solo travel, trip styles, inclusions and booking conditions | Intrepid Travel, G Adventures |
| `python-course-fit-v1` | Beginner prerequisites, workload, exercises and certificate cost | Coursera, edX |
| `duolingo-spanish-fit-v1` | Spanish practice, plan access and subscription terms | Duolingo |

The audience split is six developer questions, two workplace questions, three shopping questions, two services/travel questions and two learning questions. Browserbase, Resend, Stripe, Temporal and Box have follow-up questions in the data but are **outside this first batch**. Completing all 15 inputs would not establish evaluation of all 36 websites.

## Question types and interpretation

Each entry in `primaryQueries` has exactly the existing `PublicSearchQuery` fields: `id`, `audience`, `category`, `query`, `language` and `locale`. The inputs use English and the US locale. Taskrabbit additionally specifies New York City; travel questions specify Japan. These conditions belong to this search observation and do not inherit a homepage's earlier capture locale.

`primaryCoverage` is separate reviewer metadata. It holds a question type, expected website IDs and three review questions. **Expected websites are editorial targets to look for, not required recommendations, answer keys, source restrictions or model inputs.** The collector should receive the question object only. An unmentioned target remains absent; it must not be inserted into the returned list.

There are three unbranded discovery questions, eight named comparisons and four named product questions. Named questions deliberately test whether an agent can research and explain a specified product decision. Mentioning a brand in the question changes the task: its position is not evidence that the brand was independently discovered. Keep these question types visible when interpreting results and do not combine their positions into an overall visibility score.

Comparisons involving different product roles should explain those differences. Sentry and PostHog need not be interchangeable; a Python sandbox and a GPU batch service may meet different requirements. Questions request verification of current capabilities and terms instead of supplying assumed prices, eligibility or policy answers.

## Running and judging a question

Use one existing managed Agents open-web session per question, retaining its hosted sandbox, exact query, language, locale, harness version and provider receipts. Follow the collection workflow in [keyword benchmarks](KEYWORD-BENCHMARKS.md). Save each creation attempt before sending it, retrieve the same session when its ID exists, and preserve unknown creation as unresolved. A prepared batch does not authorize bypassing an unresolved-session guard or silently retrying an ambiguous attempt.

The sandbox should inspect the saved answer and source artifacts for that question. Useful reproducible checks include parseable structured output, retained recommendation order, source URLs attached to the relevant recommendations, explicit missing evidence, and whether the question's requested comparison dimensions are addressed. A source link proves only that a URL was returned; it does not establish that the page supports the claim. Coverage of a topic is distinct from factual correctness.

For substantive judging, compare individual claims with independently captured official product, pricing, support or policy pages. Retain the exact supporting passages and capture dates, and mark inaccessible or ambiguous evidence as unresolved. Prices require currency, billing period, region and usage assumptions. Shipping, booking and course conditions require the applicable product, itinerary or course. Claims about comfort, learning outcomes or actual API execution require evidence appropriate to those claims; a readable answer is insufficient.

The current sandbox validates the collected answer's structure. This plan does **not** implement an independent factual judge, execute a purchase or booking, run each vendor's API, or supply verified reference answers. The per-query review questions are the proposed review checklist; they become measured checks only when a judge actually records its decision and evidence. Do not turn checklist completion into a truth score.

## Publication and coverage

Retain raw provider output and session identifiers privately. Publish only the completed observation's reviewed public projection, with original recommendation order, citations, provenance and stated limitations. Failed, cancelled and unresolved attempts belong in collection status, not fabricated rankings. See the [capability review](EVALUATION-CAPABILITIES.md) for implemented versus unfinished behavior.

The `websiteCoverage` section maps all 36 stable catalog IDs to their official source references, first-batch query IDs, and two concrete follow-up intents. Those references come from the existing [catalog](../src/data/developer-tools.json) and [coverage review](DIRECTORY-COVERAGE.md); they provide starting points for verification, not a new validation of changing prices or terms. They must not be used to restrict open-web search or force a recommendation. A later collection should record new observations against immutable question IDs and preserve separate results for changed wording, locale or harness.

For this file-only preparation, all 15 question objects were checked against the existing public artifact validator with an empty observations array. Catalog coverage and IDs were checked locally. No provider sessions, website requests, purchases, bookings or publication actions were performed by preparing these files.
