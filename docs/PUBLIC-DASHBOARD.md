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
