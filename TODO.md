# Folio TODO

Working checklist for completing the current website-evaluation pilot. Check items only after implementation and relevant verification. Provider credentials, deployment access, and external billing are dependencies, not completed features.

## Two-stage private website research

- [x] Improve the first-site research flow with a four-step guide, one focused query editor, same-discovery draft preservation, saved/unresolved resume actions, report-first competitor briefs and a canonical Search questions handoff. Verified October 2, 2026 by 26 desktop/mobile research and navigation fixtures, a rendered Codegraff walkthrough, project typecheck and Cloudflare build. Provider responses were fixture-controlled; no new paid task or production deployment was performed for this UX change.
- [x] Add capture-free website saving/selection and explicit paid managed OpenAI query discovery: up to five source-backed customer-query hypotheses, with no automatic audit, competitor research, or spending on navigation.
- [x] Add owner-reviewed/edited query → separately authorized competitor investigation, private source-backed strengths/advisory suggestions, saved history/JSON download, and authenticated agent reuse. Retain one-attempt request identities, shared quotas, owner isolation, recorded page-open requirements, unknown costs, and exclusion from measured/public search observations.
- [x] Verify local implementation on September 30, 2026 with focused schema/transport/MCP fixtures, actual isolated D1 including restart/concurrency/public-boundary checks, the 37-check serial D1 suite, 16 desktop/mobile browser fixtures against the built local app, project typecheck, and the Cloudflare production build. The parallel D1/dev-browser runs encountered local emulator socket/file-descriptor errors; serial D1 and built-app browser runs passed. See [website research](docs/WEBSITE-RESEARCH.md).
- [ ] Validate explicitly authorized live OpenAI results/model access, actual provider usage, isolated PostgreSQL runtime behavior, and production deployment. The local PostgreSQL test server was unavailable; mocked provider receipts and browser APIs do not establish these outcomes. Checkout/customer billing is not implemented.

## Question-first evidence coverage

- [x] Add a bounded private question → website → captured-page index prototype using 38 curated existing/starter question texts and Jev relevance/answer-coverage Choice judgments. Explicit spending, frozen request validation, once-only reservations, provenance, advisory distributions and private reports are implemented. Verified by 18 focused fixture tests and the project typecheck on September 30, 2026; see [question coverage](docs/QUESTION-COVERAGE.md).
- [x] Prepare the real saved Codegraff-site packet as a three-question/six-page matrix: 18 pairs and 36 typed judgments, all not evaluated. Original receipt/reservation remain unchanged; no new capture, sandbox, inference reservation or paid call was made.
- [x] Connect coverage to the existing Folio Index `/leaderboard` and selected-question `/overview` results, preserving exact question/observation/returned-position identities and original rankings. Add strict reviewed public projections, honest not-evaluated states, captured-page provenance and explicit operator plan/run/preview/local-publication workflow. Verified September 30, 2026 by 48 focused fixtures and four desktop/mobile GUI cases; no live Jev call or deployment. Local emulator resource errors remain outside the mocked browser validation.
- [ ] Validate actual Jev responses and calibrate against independently labeled question/page examples. The local TypeSafe key is absent; fixtures and a prepared source matrix do not establish semantic accuracy, speed, cost or citation readiness. The integrated public coverage artifact is empty, and production deployment is not complete.

## Codegraff gateway fleet migration

- [x] Switch the opt-in local search experiment to Codegraff gateway fleet with explicit secure guest attachment, bounded full-output downloads, historical receipt compatibility, and no automatic create/exec retries. Verified by 44 focused fixture tests and the project typecheck; see [sandbox experiments](docs/CONDENSATION-SEARCH.md).
- [x] Add explicit public-website capture → frozen page/check evidence → sandbox analysis → private report mode, with six-page attempt bounds and exact saved quote/check references. Verified by 61 focused fixtures, CLI help and the project typecheck on September 30, 2026; this is local implementation, not production integration or live outcome validation.
- [ ] Validate one explicitly authorized public-website → guest Graff findings → downloaded output/report → confirmed cleanup pilot. The September 30, 2026 attempt captured six real public pages and confirmed guest attachment/terminal cleanup, but gateway HTTP 503 left execution uncertain with no model output retained. Its private export is an incomplete source packet, not a completed assessment. The provider reports tested local timeout-handling fixes, but neither host nor gateway fix is deployed and this pilot's specific 503 cause remains unconfirmed. The additionally authorized paid attempt remains unused and conditional on a confirmed deployed fix; no automatic replacement was started.
- [ ] Validate one explicitly authorized Folio host-search → guest Graff research answer → downloaded output/report → confirmed cleanup pilot. The provider agent's separately authorized live security checks cover credentials and direct guest model calls, not this full research workflow.

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
- [x] Implement and locally test the PostgreSQL/Hyperdrive runtime, auth schema, and full-row D1 importer; complete the September 27, 2026 maintenance-window production cutover to PlanetScale after post-commit field verification across 32 tables and 832 rows. Both Workers now use uncached Hyperdrive; D1 remains intact for reconciled rollback. See [migration record](docs/POSTGRES-MIGRATION.md).
- [ ] Rotate the agent-scoped PlanetScale credential that appeared in chat, confirm PostgreSQL 18 compatibility with Cloudflare, validate live owner sign-in and owner-scoped writes, and monitor read-after-write/latency/errors. The public-index Worker already uses a separate verified read-only role. Anonymous hosted checks and local fixtures do not establish these outcomes.

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

## September checkpoint and next implementation steps

- [x] Add optional Google identity and explicit, private Search Console imports with isolated D1 and browser regressions.
- [x] Add an independently sourced 36-website directory across five audiences, Spectrum-derived sortable tables, and bounded public-homepage `readiness-v1` observations. The current batch measures all 36 public pages and reproduces offline; see [coverage](docs/DIRECTORY-COVERAGE.md) and [evaluation](docs/DEVELOPER-TOOLS-EVALUATION.md). These are separate from agent-task benchmarks.
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
- [x] Validate a local paid Codegraff open-web keyword start (`gpt-6-sol` + Responses `web_search`) for an approved test account. The authenticated run completed, reopened by owned GET, and rendered with citations in Folio on September 27, 2026. Cost was not reported; this is not production or publication validation. See [keyword benchmarks](docs/KEYWORD-BENCHMARKS.md).
- [ ] Validate the separate reviewed-domain Codegraff path (hosted search + `glm-5.3-flash`) for an approved account. Open-web Responses validation does not establish this path's live provider behavior.
- [x] Add a ranked public table and an explicit collection/export script with a strict public projection.
- [ ] Complete collection and public review of the initial 15 primary questions. At the 13 September public-dashboard checkpoint, six real tasks completed and the seventh creation was unconfirmed, stopping that batch. Published counts come from the validated public artifacts, separately from completion status. See [live validation](docs/LIVE-VALIDATION.md) for current recovery and accounting; private customer results are not published into this collection.

## Subsequent product expansion

These are not claims about the current pilot: repeated independent cross-company trials and a public agent benchmark; consumer AI visibility collectors; verified domain ownership; team roles; automatic repair publishing; and paid recurring monitoring with enforced provider-cost credits. Each requires its own acceptance criteria before implementation or launch claims.

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
- SEO detail investigation found that current persisted reports contain aggregates only. Exact report reads now state that keyword, landing-page and backlink rows were not collected. A row-level provider collector is not implemented by this change.
- Public rankings now graph actual returned positions; the public sample-score tab is removed. A separate real multi-company scoring evaluation is tracked in [issue #8](https://github.com/justrach/folio/issues/8).
- Local fixtures, provider validation and production deployment remain separately recorded; these entries do not establish new paid/live collection.

### 13 September saved checkpoint

Incoming collaborator work (`9383bf7`, merged through `5e0a3a1`, author `yxlyx`) adds compact Search Console setup steps and is integrated without conflicts. The previously uncommitted hackathon page/README route entry is included in this reviewed checkpoint. The separate issue #8 real-score evaluation remains another task, not part of these MCP fixes.

Validation: 232 unit tests and 22 actual temporary-D1 tests passed; affected public graph/browser checks passed. The second landing revision has a real result preview above the fold and moves the query explorer below the workflow. Desktop/mobile visual checks cover 320–1440px. Parallel GUI runs encountered trace-file cleanup collisions; affected cases are rerun with isolated output directories rather than hiding the failures.

Production: migration `0013_seo_agent_tools.sql` was applied successfully to the existing production D1. The app revision at this checkpoint is not yet deployed. Earlier clean production builds and scheduler dry run passed; the final integrated revision still needs its final production build, deploy and hosted smoke checks.

Remaining acceptance work:
- [x] Finish final integrated build/deployment and verify public pages/authenticated boundary on the deployed version. Completed 20 September 2026 from `bb89efb`; Worker `af017bc8-7cc5-4cee-86fc-9089277546e2`. See [production setup](docs/PRODUCTION-SETUP.md). No new paid provider test was run.
- [ ] Validate the MCP workflows with a hosted owner-scoped client separately from SDK/D1 fixtures.
- [ ] Review issue #7 row-level collection scope: saved aggregate reports now explicitly say detail was never collected; no new detailed SEO collector exists.
- [ ] Integrate/review the separate real-readiness graph task (#8) when ready; do not invent Overall/SEO health/Discovery scores.

## Luna crawl follow-up

- [ ] Validate a real authorized Luna → crawl MCP → Jev run. The implemented ten-page workflow and local fixtures are documented in [website crawl](docs/WEBSITE-CRAWL.md); do not mark live validation from mock results.

## DataForSEO keyword tool

- [x] Implement Luna-compatible website-question research and reusable keyword research MCP with bounded private D1 receipts and reported costs.
- [ ] Validate a live Luna → keyword research MCP → DataForSEO task; fixtures do not establish provider connectivity. See [keyword research](docs/KEYWORD-RESEARCH.md).
