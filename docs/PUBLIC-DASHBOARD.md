# Public benchmark dashboard

Plain `/overview` opens public questions, collection status, and published recommendations without signing in. It uses an independent public shell, so opening it does not read account identity, saved customer records, or the private agent activity list. `/leaderboard` also uses the public shell, even when its URL includes workspace-looking query hints.

The private website overview is `/overview?view=workspace`; illustrative charts are at `/overview?view=demo`. Existing overview links with website/scope context still enter the authenticated workspace. A URL hint carries selection only and never grants ownership or permission to start work.

## Reading a result

Search matches the question, category, audience and returned website names/URLs. Audience and task-status filters narrow the task list. Desktop task buttons and the mobile task selector open the same report. The selected task is recorded in `/overview?query=<public-query-id>` using native browser history, so direct links, refresh, Back and Forward restore that query. Filters remain local to the current mounted page; a shared link does not preserve them.

The browser renders at most 25 task buttons and 25 mobile task options per page. Search and filters still cover the complete snapshot. **Previous** and **Next** browse questions without replacing the selected report; **Show selected task** returns to its page. Opening a task link or using browser history reveals that task's page. Public snapshot refreshes preserve the current browsing page and clamp it if fewer matching tasks remain. Page controls announce the visible range and work with the keyboard; the mobile selector includes each full question so questions in the same category remain distinguishable.

Each report shows the exact public question, language/locale, returned recommendation list, observation time and model. Positions retain the original one-based order within that answer, including repeated recommendations and missing website URLs. They are not Google positions, averaged cross-query rankings, consumer ChatGPT results or independently judged product quality.

Sources use returned titles where available, with a hostname fallback beside each recommendation. Links retain their original citation URLs. Expand **Returned reason** for the recorded explanation and **About this observation** for execution labels, the full source list and limitations. A citation link establishes what the agent returned; it does not independently verify factual support. A completed answer with an empty recommendation list stays empty.

## Publication and collection are separate

The dashboard exposes two independent facts: whether collection has a confirmed status, and whether a reviewed answer has been published.

| Stored collection status | Result without a published observation |
| --- | --- |
| `not-started` | Not started; no answer or position inferred |
| `queued` | Queued; no answer returned yet |
| `running` | Agent work reported in progress |
| `completed` | Preparing result; awaiting publication |
| `failed` | No completed answer recorded for the attempt |
| `cancelled` | Attempt cancelled; no answer published for it |
| `unresolved` | Needs review; no confirmed result |

A published answer remains readable if a newer task is running, failed or unresolved. Its collection status remains separate in the data. The publication progress bar measures questions with published answers; it is not a model-execution percentage.

`publishedQueryCount` counts questions with at least one published observation. `publishedObservationCount` includes their retained history. `completedUnpublishedQueryCount` counts confirmed completed tasks that have no published observation. Collection counters retain all seven statuses independently.

Website and source totals use only the latest published observation for each exact query. Website identities count distinct hosts, normalizing case, a trailing dot and `www`; subdomains remain distinct and unknown URLs do not count. Sources count distinct exact URLs. Older answers do not inflate these totals. No cross-query average position or general company score is calculated.

The separate HTML coverage summary counts each catalog website's latest public-homepage capture, retaining measured, unavailable and unmeasured outcomes. Local previews and non-catalog rows are excluded. The existing 36-page `readiness-v1` batch measures bounded homepage HTML, not the search questions or other vendors' API task success.

## Public snapshot API

`GET /api/public/benchmarks` needs no authentication and accepts no owner or run selector. It reads only these public inputs:

| Input | Purpose |
| --- | --- |
| `src/data/public-search-rankings.json` | Reviewed query definitions and allowlisted completed observations |
| `src/data/public-search-progress.json` | Public query status, optional start/finish times and public observation references |
| `src/data/developer-tools.json` and `src/data/developer-tool-evaluations.json` | Separate catalog and homepage coverage |

The response format is `folio-public-dashboard-v1`, defined by `PublicDashboardData` in `src/lib/public-dashboard.ts`. It contains `updatedAt`, derived `summary`, ordered `queries`, retained public `observations`, and optional `htmlCoverage`. Each query has `collection`, `resultStatus`, `latestObservation` and `observationCount`. Result status is `published`, `awaiting-publication` or `not-published`.

Server validation rejects unknown fields, missing/duplicate query IDs, invalid dates, mismatched observation references, and invalid public ranking content. The browser's `assertPublicDashboardData` additionally recomputes counters and each selected latest observation. Private owner/run/session IDs, provider items, usage, errors, captures, reference answers and credentials are outside this contract. Publishing a technical scan or saving a private run does not authorize exporting those records here.

The GET returns `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Invalid artifacts return a generic 503 with code `public_data_unavailable`; rejected values are not returned. There is no POST handler. Reading or refreshing this endpoint performs no authentication, D1 read, provider request, capture or inference, and consumes no provider evaluation allowance.

## Refresh behavior

The UI loads a snapshot on entry and offers **Refresh**. It currently polls every 15 seconds while any unpublished task is not failed or cancelled, including pending or unresolved tasks that may receive a later publication update. Requests have a 15-second timeout and are aborted on cleanup. A failed refresh retains the last valid snapshot with an update notice; an initial failure shows a retry action.

Polling reads the published artifacts only. It cannot start, retry, reconcile or cancel an agent task. It is not a provider event stream. `updatedAt` is the status artifact's saved timestamp, while each answer retains its own observation time. Production uses bundled artifacts: new data must be included in a new application build/deployment before public reads can expose it. Development artifact updates do not establish production deployment or continuous collection.

## Collection and validation checkpoint

The initial primary collection has 15 public questions. At the 13 September 2026 dashboard checkpoint, six real tasks completed and the seventh creation remained unconfirmed, stopping that batch. These execution facts do not imply that all 15 answers are published. The dashboard uses validated artifact counts; current collection/recovery details and unknown-attempt accounting belong in [LIVE-VALIDATION.md](LIVE-VALIDATION.md). An ambiguous creation is never automatically retried merely because no answer appears publicly.

Eight focused public-data unit tests passed, including strict projection, cross-reference validation, count derivation, preserved order, separate HTML coverage, and actual public GET execution with network access rejected by the fixture. Forty-two affected GUI cases and 12 new public-dashboard/index cases passed across desktop/mobile. Browser checks use mocked public responses and assert that public navigation makes no private/auth calls or paid POSTs. Bun 1.4.1 type checking, all 215 unit tests and the OpenNext Cloudflare build passed for the public-dashboard snapshot at `3f1ec76` with the public-shell and label updates later committed in `fa35a5b`. Later merged changes need their own validation. A further 24 targeted Index/ranking/browser checks passed, including the updated navigation handoff. These checks do not establish a production deployment, a finished 15-question collection, consumer-AI coverage or independent judging.

## Real ranking graph

The landing page, public overview result and Search rankings view plot actual returned recommendation positions on an ordinal axis. They do not convert positions to scores out of 100. The full question stays readable beside bounded filters; each company keeps its source links and answer explanation. Model, capture date and harness details remain in the evidence disclosure rather than the prominent public labels. The public leaderboard no longer exposes the illustrative multi-company score chart. A separate future real scoring evaluation is tracked in issue #8; existing HTML-readiness scores retain their bounded technical meaning. No new collection or live-update infrastructure is implied by the graph.

## Private website handoff

The private question editor can now browse published questions and reuse their exact wording, language and locale. Selecting one replaces the editable question draft and starts no provider work. Owners can also prepare three editable scenarios from their supplied audience/task description. These are deterministic drafts, not facts inferred from a website capture.

A completed private keyword report reads the public snapshot and shows the newest observation with identical question, language, locale, model, search mode, surface, harness version and environment type. It retains original public recommendation positions and links to the source question. Private references and environment fingerprints are not public; no before/after change score or causality claim is made. Mismatches remain unmeasured, and a failed public read does not hide the private answer. The comparison request contains no private question, website, owner or run selector, and performs no writes or inference.

## Owner-selected shared observations

Completed standard open-web website observations can be explicitly shared from their report. Opening sharing reads publication state; Preview computes the exact question metadata, recommendation order, source links, model/harness, observation time and limitations. Publish requires the hash of that reviewed projection. No action here creates provider work.

Migration `0014_public_keyword_observations.sql` stores the projection with an owner/run foreign key and revision. Raw answer text, reference facts, target metadata, provider receipts and usage remain private. Completed source evidence must match its retained final answer and provider receipt. Public GET reads only this projection table alongside reviewed static artifacts; it does not join private records. A database failure returns unavailable rather than serving stale shared records.

Withdrawal clears the projection and increments a retained revision, invalidating old previews. Source deletion cascades the projection. Already downloaded copies cannot be recalled. Two owners publishing the same public observation do not transfer withdrawal authority: each controls only their own publication, and another independent copy can remain visible. Existing static operator publications are separate copies.

The browser must first show the exact public fields. Catalog-exact questions retain their existing identity/category; new questions use content-derived IDs. Returned position remains an observation, not a universal score. Publication accepts the standard open-web harness and explicitly allowlisted models after retained-evidence validation; SEO-assisted and no-browser observations remain separate. Astra has live validation; Luna remains experimental until its exact Folio contract has been exercised.

Release 17 September 2026: migration0014 applied before the D1-backed public GET. Deployed Worker version `a554097b-09a5-4b58-a1e6-77e6162c62c8`. Live public GET retained 3,500 questions and 286 observations with no-store caching; anonymous publication GET/POST returned401. No owner result was published during release checks.

Validation: 261 unit tests, 24 real isolated D1 tests, 46 affected desktop/mobile GUI checks, and the production OpenNext build passed. After the final merge correction, nine focused dashboard/D1 checks passed; desktop/mobile preview overflow checks also passed. Provider calls were not made. Actual authenticated production publication remains unverified; local D1 and mocked browser tests establish only their respective scopes.

## Model-specific collection and reading

Open-web starts now accept an explicit allowlisted model. Astra remains the default; Luna is offered as experimental pending a completed hosted-web validation in Folio. Selecting a model never creates work. The selected model is frozen in the existing reservation and sent with its single create request; the one-active-run limit is shared across models. Unsupported choices are rejected before reservation. SEO-assisted starts remain Astra-only because that combined tool path has not been validated for Luna.

The public index can select a model and read its latest observation for each exact question. Missing model results remain unmeasured; a result or running state from another model is not substituted. Models remain part of comparison identity. The all-model view is latest-per-question, not a pooled vote or cross-model score.

The public collection CLI accepts `start --model gpt-5.6-luna` alongside its existing `--confirm-spend` requirement. Large catalogs are split into suites of at most 50 questions; seeding does not start collection. A published Luna result must pass the same retained-answer, provider-receipt, search and validation-marker checks as Astra. Allowlisting a model is not evidence of a successful provider run.

Reference: the [official Luna model page](https://developers.openai.com/api/docs/models/gpt-5.6-luna) lists web search, hosted shell and structured outputs. Folio's exact managed-session combination still requires its own live check.

Model-controls release: Worker `94ba1e26-16d7-4d14-969b-4d0129958fbc` deployed on 17 September 2026. No new provider sessions or publications were created. The public corpus still contains 286 Astra open-web observations; Luna currently has no published observation in this corpus. The older no-browser Luna cohort is a separate harness and is not pooled into these results.

Validation: 267 unit tests and 25 isolated D1 tests passed. The affected GUI run passed 54 checks and failed two stale assertions expecting every fixture report to say Astra; after correcting them to the recorded fixture model, both desktop/mobile reruns passed. TypeScript and the production OpenNext build passed. Live checks covered the Luna unmeasured URL, switching to Astra rankings, 390px layout, and absence of private/provider API POSTs during navigation. A first overbroad no-POST assertion caught Cloudflare `/cdn-cgi/rum` analytics; the follow-up identified that destination and verified the relevant API boundary. Screenshots are private ignored local artifacts, not repository data.

Authenticated production validation remains pending: the existing local validation account was rejected by production sign-in. No account approval list or spending limit was changed. A finite two-question Luna validation plan is saved locally, but no starts have been made.
