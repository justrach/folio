# Folio TODO

Working checklist for completing the current website-evaluation pilot. Check items only after implementation and relevant verification. Provider credentials, deployment access, and external billing are dependencies, not completed features.

## Completed foundation

- [x] Annual-report-inspired landing page, dashboard, charts, and researched positioning.
- [x] Better Auth login and account-scoped D1 storage.
- [x] Technical website audits, reviewed repair downloads, and opt-in technical index.
- [x] Authenticated DataForSEO organic and backlink tools.
- [x] Managed OpenAI Agents API sessions, private evidence reports, reproducible demo, and background activity UI.
- [x] Proposed pricing and private plan-interest preferences.
- [x] Architecture, evaluation strategy, privacy boundaries, and competitor research documentation.
- [x] Push source to public `justrach/folio`, excluding credentials and private local data.

## Finish the pilot

- [x] Accept explicit owner-confirmed product/pricing reference answers for live evaluations; keep them out of model inputs and label their provenance.
- [x] Compare two private evaluation runs, showing per-check changes and whether captures/reference facts changed.
- [x] Provide an executable offline evidence-bundle verifier, with tampering tests and a documented command.
- [x] Save SEO lookups privately and reopen previous results without repeating paid provider calls.
- [x] Let the managed agent inspect an explicitly selected saved SEO report through a bounded application tool; do not give it unrestricted paid-provider access.
- [x] Add private evaluation-evidence deletion with lifecycle safeguards and preserved spending accounting.
- [x] Add an authenticated, bounded background reconciliation job and Cloudflare scheduling configuration; it may retrieve existing sessions but never create paid tasks automatically.
- [x] Persist reconciliation health and last-success timestamps, flag stale background checks, and propagate partial failures through sanitized scheduler diagnostics. Requires migration `0023_reconciliation_health.sql`; deployed monitoring remains unverified.
- [x] Project lightweight private evaluation summaries in D1 and expose stable cursor pagination with older-history controls in Page evidence and Agents. Local unit, focused actual-D1, and desktop/mobile history regressions pass; no provider requests or deployment were performed.
- [x] Add GUI and backend regression coverage for these workflows, then run type checking, unit tests, GUI tests, and the Cloudflare build.
- [x] Update README/architecture/evaluation docs and this checklist; push the completed changes to the public repository.

## Connected workflow and local runtime

- [x] Add repository-specific `AGENTS.md` guidance covering navigation, managed sessions, privacy, evidence semantics, tests, and existing authorization.
- [x] Show saved audits and recent private evaluations in the explicit workspace view without requiring a technical audit first.
- [x] Carry exact website/report/run context through audit, SEO, evaluation, agent, comparison, and login flows without automatic paid starts.
- [x] Show account/target readiness, active-session blocking, and rolling run allowance beside the evaluation form.
- [x] Separate fresh website evaluation from paid frozen replay and make reports, exports, and comparisons directly reachable.
- [x] Use Bun for dependency installation and project/CI commands, with a pinned text lockfile and explicit supported Node tooling.
- [x] Make local D1 persistence explicit; add local migration status and private SQL backup commands.
- [x] Exercise actual Miniflare D1 bindings, Better Auth, repositories, concurrency, deletion accounting, restart persistence, and isolated stores.
- [x] Fix evidence deletion's D1 trigger-count mismatch using the conditional update's returned row.

## External launch dependencies

Search Console implementation now includes optional Google identity, explicit read-only linking, bounded private snapshots, saved reopening, and local disconnect that preserves login/history. One bounded local Google validation completed on 13 September 2026; public onboarding and the remaining live checks stay separate. See [Search Console validation and the production checklist](docs/SEARCH-CONSOLE.md).

- [x] Validate local Google identity sign-in, explicit read-only consent, actual property retrieval, and one private Search Console import through Folio. Completed 13 September 2026; private account/property/report details and metrics remain outside Git.
- [x] Reopen the saved live Search Console report through the built local Wrangler preview using the existing D1 state, without another import.
- [ ] Validate live disconnect/reconnect and isolation with two real Google accounts. Fixture tests do not satisfy these live checks.
- [ ] Prepare public Google onboarding at `usefolio.site`: deployed HTTPS, exact production callback, separate production OAuth configuration, public privacy policy, authorized-domain ownership, and applicable branding/data-access verification. Domain ownership and Google review are not established by local setup.

- [x] Configure a valid OpenAI Agents API key, approve a dedicated local test account, and verify one live managed run. Completed on 13 September 2026; credentials and private evidence remain outside Git. See [live validation](docs/LIVE-VALIDATION.md).
- [ ] Finish production application configuration, deployment secrets, the intended `https://usefolio.site` hostname, and deployed scheduler validation. The saved checkpoint below records an existing production D1 with migration `0013` applied; checked-in local Wrangler configuration still uses a placeholder ID. Remote database existence does not establish deployment of this revision or hosted validation.
- [x] Verify hosted Actions on the public repository. The full `Folio checks` workflow passed on cleaned commit `b9c5cf0` on 13 September 2026 ([run](https://github.com/justrach/folio/actions/runs/34738507709)); validation of later commits is recorded separately.
- [ ] Choose/configure a payment processor before enabling actual subscriptions. Current pricing is a proposal and creates no charges.
- [x] Upgrade Better Auth to 1.7.18 for CVE-2026-114607 (critical: OAuth state usable as a magic link) and two further advisories fixed in 1.7.7, one of them specific to Postgres rate limiting. TypeScript, 336 unit tests, 37 real-D1 integration cases and the GitHub auth GUI spec pass; the one intermittent GUI failure reproduces as dev-server file-descriptor exhaustion, not auth.
- [ ] Validate the enterprise proposal in [enterprise pricing](docs/ENTERPRISE-PRICING.md): a $1,000/month Index Partner tier and a $3,000 pilot quarter exist only as a quote. No entitlements, ledger, or payment provider enforce them, and no customer has agreed to a price yet.

## September checkpoint and next implementation steps

- [x] Add optional Google identity and explicit, private Search Console imports with isolated D1 and browser regressions.
- [x] Add an independently sourced 36-website directory across five audiences, Spectrum-derived sortable tables, and bounded public-homepage `readiness-v1` observations. The current batch measures all 36 public pages and reproduces offline; see [coverage](docs/DIRECTORY-COVERAGE.md) and [evaluation](docs/DEVELOPER-TOOLS-EVALUATION.md). These are separate from agent-task benchmarks.
- [x] Read what those 36 companies do on their own public pages — agent-ready documentation, proof next to claims, migration and support as product — with Parallel Extract over 72 URLs. It is a non-scoring review with stated limits; see [strengths](docs/DEVELOPER-TOOLS-STRENGTHS.md).
- [x] Inventory the same 36 sites from their sitemaps (188,705 URLs across 33 that answered; three block non-browser agents) and join the cached ranking sample for five domains. Free pass; the paid ranking run stopped at HTTP 402 after six domains and $0.2628, so 30 domains lack a ranking join. See [site inventory](docs/SITE-INVENTORY-ANALYSIS.md).
- [x] Complete the ranking join for all 36 sites ($1.42 total) and sample what the pages are about with Parallel Extract (979 pages, about $1.08, 30 URLs per site). `box.com` and `daytona.io` remain unavailable for sitemap inventory. See [site inventory](docs/SITE-INVENTORY-ANALYSIS.md).
- [x] Add a public privacy notice using `support@usefolio.site` and preserve the cream/green visual system during landing cleanup.
- [x] Implement separate private keyword suite/case/run storage and a managed hosted-sandbox transport with fixture tests. Baselines are prior observations, not answer keys.
- [x] Validate the supplied DataForSEO credentials using its free account endpoint. No paid SEO lookup is implied by this credential check.
- [x] Wire keyword storage and transport into an authenticated CLI/API workflow with durable start quotas, one create attempt, deadline cancellation, and saved-session recovery.
- [x] Add baseline/fresh comparison controls, seed reviewed private queries, and validate one actual baseline/fresh pair with recorded search and sandbox activity. This is a bounded local trial, not a broad independent benchmark.
- [ ] Use explicitly requested DataForSEO observations to inform query selection while retaining their provenance separately from reference facts and agent answers.
- [ ] Complete the prepared production OAuth setup, remote migrations, deployment, eligible Google support-contact configuration, and hosted validation. Creating the production database/project does not complete public sign-in.

## Search rankings and agent API

- [x] Default `/overview` to the public benchmark dashboard; retain owned website observations at `?view=workspace`, an explicit `?view=demo`, and separate unfinished attempts.
- [x] Keep `/leaderboard` in a public shell without account identity or private workspace reads, including private-looking query hints.
- [x] Add strict `GET /api/public/benchmarks`, separate collection/publication counters, per-question recommendation details, titled sources, mobile filters and history-aware task links. Snapshot refreshes perform no auth, D1 or provider operation.
- [x] Make evaluations question-first while preserving direct page-evidence links; save editable 1–10 question suites and broader starter packs without inference.
- [x] Inspect four optional discovery documents without changing the HTML readiness score or treating their presence as search rank.
- [x] Put saved evaluation reports and ordered keyword recommendations first, with citations, provider coverage, progress, and explicit baseline comparisons.
- [x] Add Astra open-web research in hosted sandboxes, preserving legacy restricted-domain observations and per-run harness provenance.
- [x] Add scoped, expiring Folio API keys; 24-hour default freshness; durable idempotent ensure requests; OpenAPI, Markdown and browser reference pages.
- [x] Validate two private open-web searches locally. Retain the third unknown creation and its accounting; current operator dispositions are recorded in [live validation](docs/LIVE-VALIDATION.md), without automatically retrying an uncertain creation.
- [x] Add a ranked public table and an explicit collection/export script with a strict public projection.
- [ ] Complete collection and public review of the initial 15 primary questions. At the 13 September public-dashboard checkpoint, six real tasks completed and the seventh creation was unconfirmed, stopping that batch. Published counts come from the validated public artifacts, separately from completion status. See [live validation](docs/LIVE-VALIDATION.md) for current recovery and accounting; private customer results are not published into this collection.

## Subsequent product expansion

These are not claims about the current pilot: repeated independent cross-company trials and a public agent benchmark; consumer AI visibility collectors; verified domain ownership; team roles; automatic repair publishing; and paid recurring monitoring with enforced provider-cost credits. Each requires its own acceptance criteria before implementation or launch claims.

## AI-tool index expansion (7 November 2026)

- [x] Add 200 authored AI-tool evaluation questions (100 AI assistants, 100 AI app builders) under the AI tools audience; keep the 35-question core cohort and the frozen 3,500-question artifact unchanged.
- [x] Extend the website catalog to 50 reviewed homepages and run a fresh bounded `readiness-v1` batch: 41 measured, nine unavailable; all 50 saved outcomes reproduced offline.
- [x] Add category filtering and a last-refreshed date to the public dashboard, and measured/average/last-refreshed context to the website directory.
- [ ] Collect and publish paid managed answers for the 200 AI-tool questions. This requires explicit spend approval and provider credentials; authored questions are not observations.

Validation for this expansion: TypeScript, **303 unit tests**, **50/50 offline readiness reproductions**, and the affected desktop GUI specs passed — public dashboard **8/8** (fixture public data), website directory **5/5**, landing rankings **2/2**. The homepage batch made real unauthenticated GET requests and no model or DataForSEO calls. The live `/api/public/benchmarks` route still requires local D1 setup; GUI coverage used fixture API responses.

## Validation of this checklist

Public-dashboard checkpoint: eight focused public-data unit tests, 42 affected desktop/mobile GUI cases, and 12 new public-dashboard/index GUI cases passed. The checks cover public-only reads, strict data validation, query/history selection, filters, mobile overflow, and separation from the private workspace. GUI provider responses were mocked. Bun 1.4.1 type checking, all 215 unit tests, and the OpenNext Cloudflare build passed for the public-dashboard snapshot at `3f1ec76` with the public-shell and label updates later committed in `fa35a5b`. Later merged changes need their own validation. A further 24 targeted Index/ranking/browser checks passed, including the updated navigation handoff. These tests do not establish all 15 live results or production deployment. See [public dashboard](docs/PUBLIC-DASHBOARD.md).

Earlier UI/API checkpoint: exact Bun 1.4.1 type checking, 205 unit tests, and 14 isolated actual D1 cases passed. The broad desktop/mobile run passed 190 cases and skipped two intentional duplicates. Four report-layout/login assertions were updated for the new view controls, one real failed-start notice race was fixed, and one login test was interrupted by a Next.js development reload. All six affected cases passed their focused reruns; the new question editor also passed six desktop/mobile checks. These fixture runs made no provider calls. Later live collection is recorded separately; these results validate the local UI/API, not additional live search collection or production deployment.

September checkpoint: TypeScript, 149 unit tests, five real Miniflare D1 integration cases, OpenNext Cloudflare build, and scheduler dry run passed. The full browser run passed 94 cases, with two obsolete default-tab assertions and one concurrent trace-file collision; all three affected cases passed their isolated rerun (one intentional mobile auth duplicate remained skipped). Eight new desktop/mobile directory checks passed after fixing a hidden table label that expanded the mobile viewport and intercepted pointer input. The separately updated landing passed desktop/mobile navigation and bounded contrast checks. A saved homepage observation reproduced offline. The built local Wrangler preview preserved the signed-in account and saved Search Console report and showed the approved account ready for DataForSEO. The free DataForSEO credential check succeeded; no paid SEO lookup or new live keyword trial was started.

Completed locally: 108 unit tests passed; 45 desktop/mobile GUI tests passed (one intentional mobile authentication duplicate skipped); TypeScript passed; the OpenNext Cloudflare application build and scheduler dry-run build passed. Offline verification reproduced a downloaded fixture without network access. Real local Better Auth/D1 smoke checks passed. Paid provider responses were mocked for new tests; no additional DataForSEO or live OpenAI request was made.

Follow-up live validation: one actual managed OpenAI evaluation completed and its exported evidence reproduced offline. The required initial-input session creation was corrected, with 114 unit tests, 10 relevant desktop/mobile GUI tests, and TypeScript passing. See [live validation](docs/LIVE-VALIDATION.md) for the observed result and scope.

The implemented loop and manual improvement steps are documented in [EVALUATION-LOOP.md](docs/EVALUATION-LOOP.md). Offline verification now accepts saved SEO captures, with reproduction and tampering regression cases; all 116 unit tests passed and TypeScript checks passed.

Current workflow/runtime validation: Bun's frozen dependency installation, TypeScript, 124 unit tests, three real Miniflare D1 integration cases, the OpenNext Cloudflare build, and the scheduler dry run passed. The full browser suite found one same-page navigation failure (80 passed, one failed, one intentional mobile authentication skip). Query selection now uses native browser history; all 32 affected desktop/mobile checks passed afterward, including the failed case and a regression requiring no server-page request for same-page selection. No known test failures remain. Local migration status and a private SQL backup were verified, and the previously captured live evidence reproduced through the Bun command without network access. No additional OpenAI or DataForSEO work was started.

See [frontend workflow](docs/FRONTEND-WORKFLOW.md), [local D1 persistence](docs/LOCAL-D1.md), and [agent guidance](AGENTS.md) for operating the finished paths. Local tests do not establish hosted CI or production database readiness.

Production Cloudflare deployment and payment setup remain unchecked. Hosted CI passed for the explicitly identified public commit above; local live inference does not establish a deployed scheduler or active paid subscription.

## MCP and sandbox SEO

- [x] Add scoped bearer-authenticated Streamable HTTP MCP, coding-client setup, and explicit idempotent SEO lookups shared with REST.
- [x] Add opt-in selected-domain SEO capability for managed open-web keyword sandboxes, with separate harness identity and no shell credential exposure.
- [ ] Validate hosted sandbox-to-MCP connectivity and a real DataForSEO tool result separately from fixture tests.

## MCP evidence and public graph follow-up

- Implemented separate historical/current-compatible observations, bounded typed batch reads, paginated discovery/history, matched saved visibility comparisons, separate reviewed product/host metrics, capability/error envelopes, and saved page-evidence access. See [MCP contracts and limits](docs/MCP.md).
- Row-level SEO detail is now implemented as a separate explicit paid collection on a saved report: up to 50 ranked keyword rows with landing pages plus 50 live backlink rows, stored in `seo_reports.detail_json` (migration `0024_seo_report_detail.sql`). Exact MCP report reads return either `not_collected` or the collected rows.
- Public rankings now graph actual returned positions; the public sample-score tab is removed. A separate real multi-company scoring evaluation is tracked in [issue #8](https://github.com/justrach/folio/issues/8).
- Local fixtures, provider validation and production deployment remain separately recorded; these entries do not establish new paid/live collection.

### 13 September saved checkpoint

Incoming collaborator work (`9383bf7`, merged through `5e0a3a1`, author `yxlyx`) adds compact Search Console setup steps and is integrated without conflicts. The previously uncommitted hackathon page/README route entry is included in this reviewed checkpoint. The separate issue #8 real-score evaluation remains another task, not part of these MCP fixes.

Validation: 232 unit tests and 22 actual temporary-D1 tests passed; affected public graph/browser checks passed. The second landing revision has a real result preview above the fold and moves the query explorer below the workflow. Desktop/mobile visual checks cover 320–1440px. Parallel GUI runs encountered trace-file cleanup collisions; affected cases are rerun with isolated output directories rather than hiding the failures.

Production: migration `0013_seo_agent_tools.sql` was applied successfully to the existing production D1. The app revision at this checkpoint is not yet deployed. Earlier clean production builds and scheduler dry run passed; the final integrated revision still needs its final production build, deploy and hosted smoke checks.

Remaining acceptance work:
- [ ] Finish final integrated build/deployment and verify public pages/authenticated boundary on the deployed version. No new paid provider test is authorized by this checkpoint.
- [ ] Validate the MCP workflows with a hosted owner-scoped client separately from SDK/D1 fixtures.
- [x] Review issue #7 row-level collection scope: persisted reports keep aggregates, and keyword/landing-page/backlink rows are collected only on an explicit second action for one saved report, once per report, with its own hourly limit and unknown-cost handling. No aggregate is ever presented as a row set.
- [ ] Integrate/review the separate real-readiness graph task (#8) when ready; do not invent Overall/SEO health/Discovery scores.

## Agent change records (AEO loop over MCP)

- [x] Record a website change from the owner's agent with its per-question baseline (`folio_change_record`, new `changes` key scope, migration `0026_website_changes.sql`), report publication or withdraw (`folio_change_update`, or **Confirm it's live** under `/agents`), and read each question's answer before and after (`folio_changes`). Only retests with matching settings saved after the reported publication are paired. Guided MCP prompts `improve_aeo` and `review_aeo_changes` adapt to the key's scopes. See the [AEO walkthrough](docs/AEO-DEMO.md). Fixture coverage: outcome rules, real MCP SDK client, real Miniflare D1; no provider request was made.
- [ ] Validate the loop live: completed paid answers before and after a real published change, through a real coding client. The local workspace currently has no completed answer for its saved question (two attempts failed, one on provider billing limits), so no live before/after pair exists yet.
- [x] Create the `website_changes` table in the application's Postgres database. Done on 11 November 2026 through the `scripts/pg-schema.ts` translation. That database is the production system of record since the 7 November cutover (it is the one `.dev.vars` points at), so the table already exists in production; the code that uses it is not deployed. The D1 rollback engine does not have migration `0026`.

## Published index for agents

- [x] Add four compact, paged MCP tools over the published index (`folio_index_overview`, `folio_index_search`, `folio_index_answer`, `folio_index_website`) and a no-key, read-only endpoint at `/api/index-mcp` (60 requests a minute per address; nothing about the request is saved). On the keyed endpoint, the first page of each ask is saved to the owner (migration `0027_agent_index_asks.sql`) and listed under `/agents` as **What your agents asked**. See [MCP](docs/MCP.md). Fixture coverage: the bundled published artifacts, a real MCP SDK client, real Miniflare D1; exercised against the local app, which reads the production Postgres database.
- [x] Let keyed agents read the crawled index in Postgres (`research` schema): `folio_index_pages` word search over page titles and excerpts, crawl coverage for one website in `folio_index_website`, and crawl totals in `folio_index_overview`. Read-only; not available on the no-key endpoint. Covered by real Miniflare D1 fixtures and a read-only session against the real database (50–500 ms per search over 100,825 pages).
- [ ] Validate `https://usefolio.site/api/index-mcp` from a hosted MCP client. Deployed 11 November 2026 (backend `e00d583f`); raw JSON-RPC checks there passed (initialize, `tools/list`, `folio_index_overview` on live published data, GET 405, foreign origin 403). The `agent_index_asks` table already exists in the production Postgres database (created 11 November 2026); the D1 rollback engine lacks migration `0027`. Only the local endpoint has been exercised.
- [x] Semantic search for agents. `folio_index_pages` embeds the question in the app (`gemini-embedding-2` through the Codegraff gateway) and queries turbopuffer directly, filtering by page host for one website; scores matched the index service's to three decimals. It falls back to the index service only without those keys, and to the labelled word match when semantic search is not configured, fails or finds nothing. Covered by real Miniflare D1 fixtures with an injected provider and by calls to the real Codegraff gateway and vector store through a read-only database session.
- [ ] Confirm `folio_index_pages` reports `mode: semantic` on the deployed app worker (`CODEGRAFF_API_KEY` set on `folio-visibility` 11 November 2026; needs a keyed call). Until then the deployed tool would use the index service or the word match.
- [x] Keyword runs on Folio's own agent instead of OpenAI managed Agents: Graff via `@codegraff/sdk` in a standard (non-fleet) Codegraff sandbox, gateway `/v1/search` as a capped, recorded tool, citations restricted to URLs the run retrieved, one in-VM repair turn, sandbox destroyed after the outcome is saved. OpenAI remains for runs with Folio MCP tools, `gpt-6.1-terra`, website evaluations, and `KEYWORD_AGENT_PROVIDER=openai`. See [Codegraff agent](docs/CODEGRAFF-AGENT.md). Mocked-gateway unit tests plus live gateway runs through the adapter (no database); no production run yet.
- [x] **Where it shows up** on `/websites`, and the same report for agents as `folio_website_gaps` (`GET /api/sites/{id}/visibility` for the owner): Google searches that show the website and at what position (`research.rankings_latest`), saved search and backlink counts, whether published AI answers name it and which indexed questions mention it, how much of it Folio has read, rule-based gaps with evidence and a next step, and "not checked yet" unknowns kept apart. Saved data only. Unit rules, a real-D1 MCP call and desktop/mobile browser checks; read against production data through the local preview.
- [x] Organizations: anyone can create one or join with an invite link (`/orgs`); owners invite, remove and promote; members share their saved websites and read each other's shared reports; each member's agents are listed by name and last use, and agent reads of shared websites appear as team activity. Agents get `folio_organizations`, and `folio_website_gaps` reads shared websites. Real-D1 lifecycle tests, a rolled-back run of the same flows on production Postgres, and desktop/mobile browser checks. Presentation script: [Manus demo](docs/MANUS-DEMO.md).
- [x] Owners **add people by email** before they have an account (`migrations/0029_organization_email_invites.sql`). Nobody is looked up, so it reveals nothing about who uses Folio. The person joins when they next list their organizations (`/orgs`, or their agent's `folio_organizations`) with that email verified by Google or GitHub; an unverified email/password account with the same address claims nothing. Waiting emails expire after 30 days, owners alone see and cancel them, and the limits on members still apply. Folio sends no email: for each waiting person the owner gets **Email the invite** (a `mailto:` with a note naming the address to sign in with) and **Copy message**. `/login?next=/orgs` tells people to use Google or GitHub with that address, accounts with an unverified email see on `/orgs` why they weren't added, and new members get a dismissible welcome with their two first steps. Real-D1 tests and browser checks.
- [x] **Connect your agent** panel on `/agents#connect` and every organization page: pick a client (Claude Code, Codex, Cursor, VS Code, Claude Desktop, Manus, any MCP client), create its key inline (masked, shown once), copy the client's setup, a status box that turns green on the key's first call, four starter prompts, a permission-by-tool guide and troubleshooting (`src/lib/agent-onboarding.ts`). The next step is highlighted, and for clients that can't read `FOLIO_API_KEY` the copy buttons fill in the new key while the screen keeps a placeholder or masked key. Claude Code (command and shared `.mcp.json`), Codex, Cursor and Claude Desktop via `mcp-remote` were checked against production with a temporary key, since deleted; VS Code follows its documented format and was not run. Manus (Connectors → Create → custom MCP server by URL with a Bearer token, always on the public `https://` address) follows Manus's documentation and was not run: no Manus account.
- [x] **Find anything** (⌘K) is a plain search box over every page, with the words people use for each ("team" finds Organizations, "mcp" finds Connect your agent, "billing" finds Pricing), and, when signed in, the person's websites, organizations, Search & backlinks reports, Search Console snapshots and loaded audits (`GET /api/workspace-search`: names, IDs and dates only, read one query at a time, never claims an email invite). Every typed word must match; Enter opens the best match, arrow keys move through the list. Results only navigate: `/websites?site=`, `/orgs?org=` (selects that organization once) and `/search-data?report=` (opens a saved report, a free read). Unit, real-D1 and browser tests. Not searched yet: evaluation runs and keyword evaluation suites.
- [x] **Folio as an MCP App**: in hosts that support MCP Apps, `folio_find` (new: the search above, for agents, returning the IDs other tools take) and `folio_website_gaps` open Folio inside the conversation. The person can search, open a website's report or an organization's shared websites, open reports and evidence in Folio, and send a gap to the agent with **Ask my agent to fix this**. It is one static page (`ui://folio/workspace.html`, `src/lib/folio-app.ts`) with no network access of its own; every read is a `tools/call` the host makes with the person's key, limited to three read tools. Tested against the official `AppBridge` (`@modelcontextprotocol/ext-apps` 1.7.5). That test caught that `ui/message` content must be an array of content blocks; the spec's prose shows one object.
- [x] The Folio app runs on the official `App` class: `@modelcontextprotocol/ext-apps` 1.7.5 is a runtime dependency, the server uses its `registerAppTool`/`registerAppResource`, and the page's source is `src/mcp-app/`, bundled by `bun run app:build` with the package's `app-with-deps` entry into `src/lib/folio-app.generated.ts` (about 330 KB; a unit test catches a stale build). Version 2 of the package needs the 2.x MCP SDK.
- [x] **Where these numbers come from** on every website report (web panel, MCP App, `folio_website_gaps`): each number is labelled Google's own count, Estimate, Third-party record or Recorded by Folio, with its source and date. For the owner, the DataForSEO visits estimate sits beside Google's own clicks from their newest Search Console snapshot for the domain. Search Console imports now also record US-only totals, to compare like with like. The honest comparison with Ahrefs and Similarweb, with sources, is in [Data sources](docs/DATA-SOURCES.md).
- [ ] Use each owner's Google-to-estimate ratio to correct competitor estimates (Ahrefs's own suggested method), and measure DataForSEO's estimates against Search Console across many websites before publishing any accuracy figure. One website (`codegraff.com`, about 1,000× apart) is an example, not a study.
- [ ] Open the Folio app in a real MCP Apps host: Claude Desktop (through `mcp-remote`), VS Code with Copilot, Goose or MCPJam. It has only run inside the official host bridge in a test browser.
- [ ] `tests/developer-tools-evaluation.test.ts` ("real workerd reproduces readiness-v1…") occasionally fails inside the full `bun run test` run and passes alone; it starts a real `workerd`, so it is load-sensitive. Give it a longer timeout or run it in `test:d1`.
- [ ] Run the Manus setup in a real Manus account. If Manus's servers send an `Origin` header, `/api/mcp` refuses them (403 `Untrusted MCP origin`) and would need an allowlist entry for Manus.
- [ ] OAuth for MCP so Claude.ai and ChatGPT web connectors can connect without a pasted key.
- [ ] Local dev only: the Cloudflare bindings proxy that `next dev` starts (`workerd`) leaks loopback connections to itself, about 30–220 per request, until it hits its 10,240-handle limit and pages fail with `ERR_SOCKET_NOT_CONNECTED` or time out. Restart the dev server before long browser runs. Also don't run `bun run typecheck` (`next typegen`) while the dev server is running: it corrupted `.next/dev` once, after which Turbopack's PostCSS worker crashed on every page until the cache was moved aside. Production Workers don't use this proxy.
- [ ] Organizations, next: per-member credit budgets and an append-only usage ledger (1 credit = $0.01) checked before paid work; shared question sets owned by the organization rather than one member; organization-scoped keys. Until then paid work runs on the account that starts it.
- [ ] Collect answers for the 100 **AI tools › AI assistants** questions that name Manus beside ChatGPT, Claude, Gemini, Perplexity and Copilot (none run yet; paid). Until then Manus's place in AI answers is unmeasured.
- [ ] Production: record one owner-started keyword run on the Codegraff agent. Deployed 11 November 2026 with the owner's existing Codegraff key as the secret; replacing it with a dedicated budget-capped key is still recommended. The key is copied into each short-lived sandbox (standard sandboxes cannot take the fleet-only scoped credential).
- [ ] Bake `@codegraff/sdk` into a sandbox image or snapshot; each run installs it (~12 s).
- [ ] Move website evaluations (`src/lib/agents.ts`) onto the same agent.
- [ ] Index service follow-ups (its repository is separate): `/search` with `entityId` returned no items for every entity tried, and about a third of requests (9 of 24) failed with `500` after 15 seconds. The MCP tool no longer depends on it when the app has its own keys.
- [ ] Embed the pages that have no vector (571 of 100,825, including 30 of the 31 `manus.im` pages), so semantic search can find them. The text recipe used for the existing vectors is in the index repository; new vectors must use the same one.
- [ ] Semantic search over published answers. `folio_index_search` is still a word match: the 4,050 questions have no vectors. The same model could embed them once into their own turbopuffer namespace; that is a write to the vector store and needs a decision.
- [ ] Decide who may read the crawl. Any signed-in account can create a `read` key; the index contract calls the crawl private. An account allowlist would restrict it.
- [ ] OAuth sign-in for MCP clients that cannot send a bearer header. Folio's keyed endpoint is bearer-key only.
- [ ] Multi-agent workspaces. Today each key is named and its asks and recorded changes are attributed to it under `/agents`; there is no shared task board, hand-off or team membership. `/orgs` remains a local preview.

## Luna crawl follow-up

- [ ] Validate a real authorized Luna → crawl MCP → Jev run. The implemented ten-page workflow and local fixtures are documented in [website crawl](docs/WEBSITE-CRAWL.md); do not mark live validation from mock results.

## DataForSEO keyword tool

- [x] Implement Luna-compatible website-question research and reusable keyword research MCP with bounded private D1 receipts and reported costs.
- [ ] Validate a live Luna → keyword research MCP → DataForSEO task; fixtures do not establish provider connectivity. See [keyword research](docs/KEYWORD-RESEARCH.md).

## SEO row-level detail

- [x] Add explicit keyword/landing-page/backlink row collection on one saved SEO report (`POST /api/seo-reports/<id>/detail`, migration `0024_seo_report_detail.sql`), an explicit browser action, and collected/not-collected MCP detail states. Local fixtures, 315 unit tests, four desktop/mobile SEO browser cases and TypeScript pass; no paid provider request was made.
- [x] Validate live row retrieval with the real DataForSEO account, through both the adapter and the authenticated routes served from the built Worker: 50 keyword rows, 33 grouped landing pages and 30 backlink rows, persisted and reopened from D1, with a second collection refused (`409`). An invalid `mode` value was caught and fixed (provider status `40501`). Panel and MCP live reads keep fixture coverage. See [live validation](docs/LIVE-VALIDATION.md).

## Lean proofs scaffold

- [x] Add a Lean 4 project in `proofs/` with one proven model invariant ("navigation never spends"), `bun run proofs:check`, and a separate `proofs` CI job. See [Lean proofs](docs/LEAN-PROOFS.md).
- [ ] Bind a model to the TypeScript through a shared artifact checked on both sides. Until then the proofs establish properties of the hand-written model only, not of the application.
- [x] Confirm the hosted `proofs` job on GitHub Actions. It passed on `82754f5` on 11 November 2026 ([run](https://github.com/justrach/folio/actions/runs/42866642224)). The `validate` job in that run failed on the same seven GUI cases that already failed on `b3727a7`; see the open item below.
- [ ] Fix the seven GUI cases failing in hosted `validate` since before `b3727a7`: three in `evaluations-redesign.spec.ts`, `index-layout-gui.spec.ts:36`, `real-overview-gui.spec.ts:283` (desktop and mobile), and mobile `product-funnel.spec.ts:4`.

## Workspace polish (11 November 2026)

- [x] One segmented tab control for Overview, the Index and Evaluations; two heading levels below the page title; outlier containers and controls on the panel radius; a shared `WorkspaceState` for empty, unavailable and signed-out states. The Index now reports a failed read separately from an empty index. Rules are in [design.md](design.md).
- [x] Rework the Overview's saved-results section in plain language: an **AI search answers** panel that states what it is and what was found before its filters, one filter row, one date/export line, one disclosure style, and clearer question rows. See [overview clarity](docs/design/OVERVIEW-CLARITY.md). Local validation, CI mode on this worktree's own dev server with fixture API responses: TypeScript passed; `real-overview-gui`, `overview-visual-cards`, `overview-window-export`, `overview-filters-scrubber`, `frontend-workspace-summary` and `page-style-audit` passed 64 of 66 desktop/mobile cases. The two failures are `real-overview-gui.spec.ts:283` on desktop and mobile, already failing on hosted `main`. Two assertions in `real-overview-gui.spec.ts` follow the renamed **Open web** switch and the corrected "1 needs attention" wording.
- [x] Raise workspace contrast through the tokens in `src/app/theme.css`: darker ink and secondary text, stronger hairlines and control borders, more tonal distance between shell, canvas and surface, and a 1px ring in the control shadow. Targets are in [design.md](design.md). Measured locally on the signed-in dev account across Overview, Index, Websites, Evaluations, Agents, Search data and Settings at 1440px: median text contrast on the light Overview rose from 5.8:1 to 9.2:1 (dark 9.1:1 to 9.5:1; the Index went from 5.1:1 to 7.1:1). Text below WCAG AA went from 3 of 616 elements to 2 with the tokens alone; both were the Agents group counts, which pass after removing an `opacity` dim. This is a scripted computed-style measurement, not an accessibility audit; text over images and gradients is skipped. The two theme unit tests and TypeScript pass. The browser suite was not rerun after the colour change.
- [x] Raise the workspace type floor from 12px to 13px: every 13px font size in the workspace stylesheets became 14px and every 12px became 13px (900 declarations in 44 files), the few 9–11px labels moved to 12–13px, and the light workspace uses the browser's default font smoothing instead of `antialiased`. Rules are in [design.md](design.md). Measured locally at 1440px across Overview, Websites, Evaluations, Agents, Index, Search data and Settings: the share of visible characters at 12px or smaller went from 50% to under 1%. Landing, login, onboarding, pricing, API reference, privacy, the sample demos and operator analytics keep their sizes; the shared recorded-ranking table grew 1px on the landing.
- [x] Give the dark workspace the same readability treatment: lighter text tokens, stronger hairlines and control borders, a darker shell and canvas, a new `--folio-raised` fill so selected tabs, secondary buttons and the current navigation item are lighter than their surroundings, visible select borders, and default font smoothing. Measured locally on the signed-in dev account at 1440px across Overview, Index, Websites, Evaluations, Agents, Search data and Settings: median text contrast on the dark Overview rose from 9.5:1 to 10.8:1 and on the Index from 7.8:1 to 9.2:1, with no text below WCAG AA before or after. The light Overview capture is byte-identical to the one taken before this change. Same caveat as above: a scripted computed-style measurement, not an accessibility audit. Local validation after the change, CI mode with fixture API responses: the two theme unit tests passed, and `page-style-audit`, `shared-appearance-gui`, `theme-picker`, `sidebar-motion`, `control-motion`, `real-overview-gui`, `overview-visual-cards`, `overview-filters-scrubber`, `evaluation-hub` and `shared-select-gui` passed 68 of 70 desktop/mobile cases with 2 skipped; the two failures are `real-overview-gui.spec.ts:283`, already failing on hosted `main`. The full suite was not rerun.
- [ ] Rerun `evaluations-gui.spec.ts:172`, `gui.spec.ts:210`, `gui.spec.ts:278` and `gui.spec.ts:451` on hosted CI. In the full local run after the type change (455 passed, 14 failed, 5 skipped; 411 unit tests and TypeScript passed) these four specs failed on `503` responses from this worktree's crashing local Workers runtime, not on an assertion about layout. They passed on hosted `main` before this work and have not been confirmed there since. The other seven failures are the hosted pre-existing ones; the larger type moved two of their measurements further over budget (evaluation report offset 330.9px to 334.1px against 321px; Index selector 454.3px to 457.4px against 440px).
- [ ] Review the result in the browser and commit. The change is local and uncommitted; hosted CI has not run on it.

Validation, local only: TypeScript passed. In CI mode on this worktree's own dev server, `page-style-audit` (every route, light and dark, signed out and signed in, desktop and mobile with a 320px overflow check), `public-dashboard-gui`, `evaluation-hub`, `keyword-benchmarks-gui` and `shared-appearance-gui` passed: 119 of 124 cases. Four failures are the hosted pre-existing ones above with unchanged measurements, except the Index selector, which moved from 456px to 454px against its 440px budget. The fifth, mobile `evaluations-gui.spec.ts:172`, failed on a `503` from `/api/github`: the local Workers runtime in this worktree crashes after exhausting file descriptors on loopback sockets. That case passed on hosted CI before this change and has not been rerun there. `bun run design:check` went from two findings to one; the remaining one is in `revenue-globe-demo.css`. `bun run design:live` was not run. API responses in these specs are fixtures.

## OpenNext build tooling

- [x] Upgraded off the unsupported pin: `next` **16.4.5**, `@opennextjs/cloudflare` **1.20.16**, `wrangler` **4.158.0**. `bun run cf:build` now succeeds with no `--dangerouslyUseUnsupportedNextVersion` flag, the peers (`next >=15.5.29 <16 || >=16.4.5`, `wrangler ^4.148.0`) are satisfied, and the deployment was verified live. Next 16 also updated `tsconfig.json` (`jsx: react-jsx`, `.next/dev/types` in `include`) and `dev` now runs Turbopack.
