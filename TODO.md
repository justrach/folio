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
- [ ] Finish final integrated build/deployment and verify public pages/authenticated boundary on the deployed version. No new paid provider test is authorized by this checkpoint.
- [ ] Validate the MCP workflows with a hosted owner-scoped client separately from SDK/D1 fixtures.
- [ ] Review issue #7 row-level collection scope: saved aggregate reports now explicitly say detail was never collected; no new detailed SEO collector exists.
- [ ] Integrate/review the separate real-readiness graph task (#8) when ready; do not invent Overall/SEO health/Discovery scores.
