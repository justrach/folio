# DataForSEO keyword research for website tasks

Folio's managed website-question workflow defaults to Luna. When the owner enables “research keywords and search data” and explicitly starts a question, Luna can call `folio_keyword_research` while investigating what the website should offer, which free tool could serve its audience, or which searches matter to the product. Model selection remains explicit; enabling SEO never switches to Astra.

## Tools and authorization

- `folio_keyword_research`: one fixed DataForSEO Labs Google related-keywords task per seed. US / English; depth 2; maximum 20 related rows plus seed, including available volume, 12 monthly observations, CPC and advertising competition. No arbitrary URLs, extra endpoints or model-selected task limits.
- `folio_sandbox_seo`: existing selected-domain Google organic overview and backlink summary (two provider tasks). Call only when relevant; keyword research does not require buying a backlink report.
- The managed run authorizes at most three distinct keyword seeds and one overview. The application also reserves at most 15 keyword requests per owner per rolling day. A selected target website and existing DataForSEO account approval are required. Checkboxes, navigation and status reads spend nothing.
- Coding agents using Folio's general `/api/mcp` can call `folio_keyword_research` with `domain`, `seed`, `requestKey`, `confirmSpend:true` and `seo` scope. It is available alongside saved website evidence tools for other website tasks. External clients choose their own model; Folio's managed tasks default to Luna.
- The technical ten-page crawl remains a separate capture-and-Jev workflow. It does not automatically purchase keyword data. Use a website question with the research option to plan improvements using live search data.

Example question: “What useful free tool could this website offer its customers? Check related search demand, explain the job it would do, and separate measured keyword estimates from your product suggestions.”

## Receipts, costs and privacy

`keyword_research_requests` reserves before POST, storing owner, selected domain, hashed request identity, optional run grant, provider observation, status and reported cost. Same sandbox seed reuses the same record even if the model changes its request key. A general MCP retry must reuse its request key. Pending, failed and ambiguous requests never automatically retry. A returned provider cost is counted once; missing cost stays unknown. D1 cost summaries include the `keyword-research` source independently of model tokens and domain overview costs.

Raw provider errors and credentials are never passed to agents. Only bounded projected metrics leave the server. Credentials stay in existing server configuration. Research reports remain private and are not added to the benchmark index. They are separate records from evaluation evidence; deleting an evaluation does not promise to erase keyword research receipts.

New sandbox grants are version 2. Existing version-1 grants retain only their previously authorized overview tool. Grants expire within five minutes or the saved run deadline, and stop authorizing new requests after cancellation, hold release or a terminal run. Admission rechecks these conditions atomically alongside the request count.

Search volume is a provider estimate, not actual site traffic. Advertising competition is not organic ranking difficulty. Unknown values remain null. Keyword demand alone does not establish product fit or guarantee traffic. Luna reasons over these observations; this change does not add another Jev call.

## Validation

Provider payload and projection tests use fixtures. D1 integration tests cover one-create Luna tool configuration, MCP discovery/dispatch, versioned capabilities, concurrent duplicate requests, limits, ownership, cancellation, reported costs, unknown cost and no retry after a transport failure. These are not a live Luna-to-DataForSEO validation.

API reference: https://docs.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live/ (checked 18 September 2026).

Local validation: 288 unit tests, 36 actual D1 integration tests, TypeScript, and 12 distinct desktop/mobile checks passed (14 browser executions including a strengthened Luna launch rerun). No paid provider lookup was made during these checks.

## Parallel observations

`OPENAI_PARALLEL_USER_IDS` grants exact approved account IDs up to three simultaneous keyword observations, enabling Luna 6, Sol 6 and Astra 6 comparisons. Other accounts retain one active observation. This is separate from the daily-cap exemption. D1 reserves capacity atomically; each run still requires an explicit start, retains its deadline and tool budgets, and records its own usage.

The September four-model index cohort uses ten identical public questions with one authorized attempt for each of Astra, Sol, Terra and Luna (40 total). These open-web observations run without optional TypeSafe or DataForSEO calls so all four share the same research harness. A completed answer must pass the existing evidence/projection validation before entering the public rankings. Invalid results retain their failed status and recorded usage. The model landscape reports token estimates separately from unreported search/sandbox charges; this is a workflow comparison, not a general quality benchmark.
