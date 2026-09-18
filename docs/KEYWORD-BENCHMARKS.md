# Search-question evaluations

Folio can save a set of questions for an existing website, record a baseline answer, run a question again, and compare the two saved observations. Codegraff can be the website being studied. The execution provider remains the managed OpenAI Agents API in its hosted sandbox.

The benchmark is separate from the HTML website evaluator, technical readiness scores, Search Console metrics, DataForSEO estimates, and the public tool directory. A returned recommendation order describes one answer within its recorded search scope. It is not an independently established product-quality rank or a measurement of the consumer ChatGPT website.

This guide describes the implemented workflow and its fixture checks. Actual provider outcomes and production deployment require their own recorded validation; passing the tests below does not establish either.

## Use the website already in your account

1. Open `/websites` and select an existing private website. If it exists only as a saved Search Console report, use **Open website** from the connected-property list, or **Use this website** from that saved report. This explicit action saves a website entry from the owned report; it makes no Google request, scan, or agent call and does not publish it.
2. Open **Evaluations → Search questions** (the default at `/evaluations`). The older `/benchmarks` route remains available. The website ID is a selection hint; the server reads the owned website before accepting it.
3. Choose a question template and select **Save keyword suite**, or select **Write or edit these questions** to save 1–10 questions of your own. The editor accepts one question per line, a suite name, answer language and customer location; it rejects duplicates and oversized drafts. This saves private questions without inference. A suite is selected automatically only when its saved case targets exactly match the chosen website.
4. Select **Run baseline** for one question. Each start is a separate paid action.
5. Open its saved progress. Once a baseline completes, choose it and select **Run fresh observation** for a later answer.
6. The selected result leads with the query, target presence and citations. Expand named tools for their reasons and sources, compare baseline/fresh summaries, or download the private observation. Question/run settings remain available below the report.

[The catalog](../src/lib/keyword-benchmark-catalog.ts) contains four broader open-web packs with six questions each, plus the two original three-question coding-harness templates:

| Template / search mode | Execution and scope |
| --- | --- |
| `small-team-work-v1` / `open-web` | Recommendations, pricing, client work, setup, integrations and simpler alternatives |
| `clothing-shopping-v1` / `open-web` | Recommendations, shipping, returns, sizing, value and materials |
| `service-booking-v1` / `open-web` | Service discovery, coverage, pricing, cancellation, comparisons and screening |
| `learning-python-v1` / `open-web` | Beginner courses, projects, prerequisites, free options, practical support and pace |
| `coding-harness-open-web-v1` / `open-web` | Luna (`gpt-5.6-luna`) by default, live OpenAI web search with no domain filter; the hosted sandbox has outbound network disabled and validates local JSON |
| `coding-harness-research-v1` / `reviewed-domains` | Luna for new runs; saved model retained for historical observations, live search and hosted network restricted to the reviewed documentation hosts |

All broader packs and custom questions use the open-web execution contract, defaulting to Luna. A custom draft requires an existing owned website; target URLs and execution settings cannot be supplied as overrides. Saving only creates suite/case records: no capture, session, reservation or provider call is made. A saved suite reports completed-question coverage and each question’s latest attempt state; incomplete questions are not silently scored as zero.

Absent `searchMode` means the legacy reviewed-domain mode. Old cases, harness hashes and saved runs are not relabelled as open-web research. The open-web harness is versioned separately; each run records its exact version. The legacy harness remains `keyword-research-v1`. Templates neither create public directory entries nor change publication. Legacy starts reject targets outside the reviewed corpus; open-web starts accept a validated public HTTPS target from the existing owned site.

Visible progress retrieves the selected existing task every ten seconds. It never starts another answer. Closing or hiding the page stops this polling. The benchmark currently has no server-side deadline scheduler; use an open progress panel or CLI `--wait` while a task is active.

## Local setup and account access

Use Bun for the repository commands and Node for the explicit script runtime. Apply migrations through the existing local wrapper:

```sh
bun install
bun run db:status:local
bun run db:migrate:local
bun run benchmark --help
```

Migrations `0009_keyword_benchmarks.sql` and `0010_keyword_benchmark_lifecycle.sql` add the private suite, case, run, corpus, deadline, and cancellation fields. The local app and CLI use the same `.wrangler/state/v3` store. The CLI explicitly disables remote bindings; these commands do not provision or migrate production D1.

The server needs `OPENAI_API_KEY` and the exact account ID in `OPENAI_ALLOWED_USER_IDS`. These values belong in ignored `.dev.vars` locally and Worker secrets/configuration when deployed. An email address is not an authorization substitute. Restart the development server after configuration changes.

Normal keyword access allows six starts in a rolling 24 hours and one active benchmark. Website evaluations retain their separate configured daily allowance and active-run guard. All failed, cancelled, and unresolved reservations continue to count.

`OPENAI_UNMETERED_USER_IDS` is an optional comma-separated list of exact, already-approved account IDs exempt from daily start caps. For those accounts, access and remaining-allowance fields return `null`, meaning no daily cap; counts are still recorded. This is not a free-use setting: provider charges, explicit starts, one-active limits, input bounds, and benchmark deadlines remain. Other accounts keep their normal limits. Keep real account IDs out of tracked examples and documentation.

## CLI operations

The CLI is a local operator interface. It verifies that `--owner-id` exists in local Better Auth storage and applies the same configured provider-access checks as the service. Browser APIs derive the owner from the authenticated session instead. The CLI never changes either approval list.

Use IDs from your own authenticated workspace and private JSON results:

```sh
BENCHMARK_OWNER_ID='your-existing-account-id'
BENCHMARK_SITE_ID='your-owned-website-id'

bun run benchmark status --owner-id "$BENCHMARK_OWNER_ID"
bun run benchmark seed --owner-id "$BENCHMARK_OWNER_ID" \
  --template coding-harness-open-web-v1 --website-id "$BENCHMARK_SITE_ID"
```

The seed result contains the suite and generated case IDs. If `--website-id` is omitted, a template with a website target must match an existing owned website URL; there is no fabricated fallback website.

```sh
BENCHMARK_CASE_ID='case-id-from-your-private-suite'

bun run benchmark start --owner-id "$BENCHMARK_OWNER_ID" \
  --case-id "$BENCHMARK_CASE_ID" --confirm-spend --wait
```

`--confirm-spend` authorizes exactly that start. `--wait` polls the same saved session; it does not retry creation. To run a fresh answer, select a completed baseline from the same owned case:

```sh
BENCHMARK_BASELINE_ID='completed-baseline-run-id'

bun run benchmark start --owner-id "$BENCHMARK_OWNER_ID" \
  --case-id "$BENCHMARK_CASE_ID" --baseline-id "$BENCHMARK_BASELINE_ID" \
  --confirm-spend --wait
```

Existing-run operations require no new start:

```sh
BENCHMARK_RUN_ID='existing-run-id'
BENCHMARK_SUITE_ID='existing-suite-id'

bun run benchmark status --owner-id "$BENCHMARK_OWNER_ID" --suite-id "$BENCHMARK_SUITE_ID"
bun run benchmark reconcile --owner-id "$BENCHMARK_OWNER_ID" --run-id "$BENCHMARK_RUN_ID"
bun run benchmark cancel --owner-id "$BENCHMARK_OWNER_ID" --run-id "$BENCHMARK_RUN_ID"
bun run benchmark compare --owner-id "$BENCHMARK_OWNER_ID" \
  --baseline-id "$BENCHMARK_BASELINE_ID" --run-id "$BENCHMARK_RUN_ID"
```

Commands save their full results under ignored `.local/keyword-benchmarks` with private directory/file permissions. Standard output reports the private file path and bounded status, not provider credentials or full answers. Comparison and status read saved data. Reconciliation retrieves the saved provider session and may enforce its already-persisted deadline. A cancel acknowledgement is not a confirmed stopped task.

When a new creation fails, its private `providerMetadata` retains the original numeric `creationHttpStatus` when received and the bounded `creationErrorCode`, alongside any request/session receipt. These diagnostics are immutable through the run update helper and contain no provider body, arbitrary error message or credentials. Older records remain absent rather than having status inferred from timing. Recording an HTTP error does not release an ambiguous creation hold or authorize a retry; the original outcome and unknown usage remain intact. The external observation API continues to return a generic safe error rather than raw provider diagnostics.

## Authenticated browser API

External agents use the separate [Folio Agent API](AGENT-API.md), with scoped keys, 24-hour default freshness and idempotent explicit ensure requests. Its GET routes never start work. The routes below serve the browser workflow.

Every route requires Better Auth and applies exact owner filters. All responses are private and non-cacheable. Mutations require the configured application origin; a supplied owner field never grants access.

| Method and route | Request / result | Provider activity |
| --- | --- | --- |
| `GET /api/benchmarks` | Suites, templates, access, current usage | None |
| `POST /api/benchmarks` | `{templateId, websiteId?}` or `{name, websiteId, questions, language, locale}` → `{suite}` | None |
| `GET /api/benchmarks/[suiteId]` | `{suite}` with owned cases | None |
| `GET /api/benchmarks/runs?suiteId=...&caseId=...` | `{runs}` with at most 100 summaries | None |
| `POST /api/benchmarks/runs` | `{caseId, kind: "baseline" | "fresh", baselineRunId?}` → `{run}` | One new paid session |
| `GET /api/benchmarks/runs/[id]` | `{run}` with private answer | None |
| `POST /api/benchmarks/runs/[id]/reconcile` | `{run}` | Saved-session GETs; one reserved cancel request if overdue |
| `POST /api/benchmarks/runs/[id]/cancel` | `{run}` | At most one reserved cancel request |

Fresh runs require a completed baseline owned by the same account and linked to the same case. A different query or execution setting does not silently become comparable. Query parameters can select existing records; they cannot authorize a start.

## Persistence, deadlines, and recovery

The service validates inputs before reserving capacity. One atomic D1 statement freezes the owned case and reserves the daily/active allowance. It then persists `createAttemptAt` before exactly one session-create POST containing the initial input. Baseline answers and independent reference facts are excluded from the provider payload.

A missing response can conceal a running, billable task. Such a reservation remains unresolved, with unknown cost, and blocks a replacement while active. Reconciliation does not recreate it. A received session ID is retained even when the provider response shape differs. If its receipt cannot be saved after a bounded database retry, the API returns private recovery details and the CLI writes a private recovery file; retain that ID for operator recovery rather than submitting another task.

Runs freeze the model, search mode, harness version, domain list and environment fingerprint, original case/reference snapshot, timestamps, and a three-minute task deadline. Reconciliation checks that the retrieved environment matches that saved mode: restricted domains for legacy runs, disabled sandbox networking for open-web runs. Cases can be edited for future runs without rewriting existing observations. Terminal run inputs and results remain immutable; a later parser correction does not silently replace an earlier failed record.

The deadline is an application action, not a provider-enforced monetary cap. When an active panel or CLI reconciler observes an overdue run, it persists `cancelAttemptAt` before issuing the one cancellation POST. Retries cannot submit duplicate cancellation events. Acknowledgement gets a separate timestamp; subsequent retrieval must confirm completed, failed, or cancelled state. An interrupted client or closed browser cannot guarantee timely cancellation. Failed cancellation stays unresolved and retains the original reservation.

## Page evidence and discovery documents

Select **Page evidence** for the existing captured-page/reference workflow. Explicit `view=page` links remain in that view; legacy page run, target and SEO-report links still resolve there. `view=search` makes keyword run IDs unambiguous. Switching views clears incompatible record selections and does not start work.

The technical scanner separately inspects `/robots.txt`, `/llms.txt`, `/llms-full.txt` and `/sitemap.xml` on the captured page’s origin. It records successful, missing, blocked, malformed, unavailable or size-limited observations. Markdown titles, summaries and supported document links; robots groups/directives/sitemap references; and bounded XML URL entries are inspected. Linked files and sitemap entries are not followed. These optional diagnostics add zero points and preserve the existing HTML rubric. They cannot establish that a model consumed a document or that it improved a recommendation.

See the [current capability review](EVALUATION-CAPABILITIES.md) for implemented behavior, observed provider outcomes and remaining judging work.

## What the answer establishes

A completed observation requires a completed root turn and a completed assistant final answer matching the bounded schema. It also requires recorded live-search activity and a completed hosted command with the exact JSON-validation marker. An explicit nonzero command exit code fails the check. The provider can report `exit_code: null`; the marker is retained as an observation, while successful exit remains explicitly unmeasured. Missing final items, idle status, or a cancellation acknowledgement alone are not success.

The parser restricts recommendation and citation counts. Legacy URLs must use approved HTTPS hosts; open-web URLs must pass public HTTPS syntax checks. New completed answers retain bounded root-turn search items, the final JSON and the validation command as private collection evidence. Citation presence and returned excerpts do not independently verify source content, factual support, or product performance. No vendor account, transaction, API credential, private Search Console snapshot, DataForSEO lookup, or independent reference answer is supplied to the sandbox. No consumer chat surface is measured.

Target presence compares returned recommendation URL hosts after removing `www` and a trailing dot. It does not infer names, aliases or subdomains. Missing/invalid target or recommendation identities remain unknown. Target citations are matched independently; being cited as a source is not the same as being recommended. Positions retain the original one-based answer order.

A comparison checks query, target URL, language, locale, rubric, search mode, independent references, model, harness, observation surface, and environment fingerprint. Matching inputs permit inspecting answer and mention/citation differences; changed inputs produce reasons for non-comparability while preserving both answers. Missing answers are not zero scores. Unknown token counts and costs stay `null`; the private comparison does not compute a general quality rank or causal improvement score.

## Private and public observations

Private browser/CLI exports retain the saved run, provider recovery identifiers and collection evidence. The external Agent API exposes a smaller owner-private projection. Neither grants publication permission.

The public `/leaderboard` search view reads `src/data/public-search-rankings.json`, a separately reviewed `folio-public-search-rankings-v1` artifact. Its allowlist contains public queries, dates, model/surface/search-mode/harness labels, original ordered recommendations, citations and limitations. It excludes account/run/session IDs, reference answers, full collection payloads, usage and credentials. The validator requires completed open-web observations and preserves each position; uncollected queries receive no fabricated results. Site technical-publication flags do not publish private keyword records.

This is a query-specific API-answer view, not a multi-provider quality league table. Consumer ChatGPT and other chat websites remain distinct and unmeasured. Actual populated observations and provider validation are recorded separately from this implementation guide.

### Public collection CLI

The separate collector uses the public artifact's reviewed queries and a dedicated private D1 suite. Each command targets the local Wrangler database. Only an explicit `start` creates paid work; `export` writes a private preview until `--publish` is supplied.

```sh
bun run rankings:collect seed --owner-id <existing-local-owner>
bun run rankings:collect start --owner-id <existing-local-owner> --query-id <public-query-id> --confirm-spend --wait
bun run rankings:collect reconcile --owner-id <existing-local-owner> --run-id <saved-run-id> --wait
bun run rankings:collect export --owner-id <existing-local-owner> --run-id <completed-run-id>
bun run rankings:collect export --owner-id <existing-local-owner> --run-id <completed-run-id> --publish
```

The exporter verifies the exact public query, Astra/open-web configuration and saved collection receipt; it strips private identifiers and keeps the original recommendation order. Raw evidence and previews stay in ignored `.local/public-search-collections` with private permissions. Publishing this artifact is separate from deploying Folio. The current collection hold remains in effect; the examples do not authorize resuming provider work.

## Validation and implementation map

```sh
bun run typecheck
bun run test
bun run test:d1
bun run test:gui tests/keyword-benchmarks-gui.spec.ts
```

Run the GUI filename present in the repository if it changes. The transport/service fixtures make no live inference request. Actual Miniflare D1 checks use temporary persistence and synthetic users, including owner isolation, atomic start and cancellation races, unknown costs, terminal immutability, nullable daily exceptions, unchanged normal limits, and restart persistence. They never load `.dev.vars` or the shared local database.

The main files are [service orchestration](../src/lib/keyword-benchmark-service.ts), [provider transport](../src/lib/keyword-benchmark-agent.ts), [D1 storage](../src/lib/keyword-benchmark-store.ts), [types and comparison](../src/lib/keyword-benchmark-types.ts), [reviewed catalog](../src/lib/keyword-benchmark-catalog.ts), and [CLI](../scripts/keyword-benchmark.ts). Production OAuth, a deployed database, hosted scheduling, external-user paid entitlements, and broad independent benchmark validation remain separate work. The public artifact schema and table are implemented; individual observations require their own reviewed evidence.

## Website keyword research

Managed website questions now support Luna with optional, bounded DataForSEO related-keyword research. General coding clients can use the same research via Folio MCP. See [keyword research](KEYWORD-RESEARCH.md) for authorization, limits, private D1 receipts and cost semantics.
