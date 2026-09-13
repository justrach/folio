# Folio Agent API

The `/api/v1` API lets an external agent read its owner's saved website evaluations and keyword observations, or explicitly request a sufficiently recent result. It uses Folio API keys, not the underlying provider credential. GET requests never start evaluations or retrieve remote model progress.

The running application serves the human reference and key controls at `/docs/api`, OpenAPI 3.1 at `/api/openapi.json`, a generated Markdown reference at `/docs/api/reference.md`, and discovery links at `/llms.txt`. These references describe the current server; their availability does not establish a production deployment.

## Keys and ownership

Sign in at `/docs/api` to create a named key. Read access is included; **Allow this key to start evaluations** adds `evaluate` permission. The full token is shown once and belongs in the calling agent's secret environment. Folio stores its SHA-256 hash and a display prefix, not the recoverable token. Keys default to 30 days, support 1–90 days, and are limited to ten active keys per owner. Revocation prevents subsequent key access without deleting saved observations.

Send `Authorization: Bearer <FOLIO_API_KEY>` on every `/api/v1` request. Browser cookies do not substitute for a key. The server derives the exact owner from that key; caller-supplied account IDs cannot select another owner's records. Key creation and revocation require an authenticated browser session and the configured same-origin request. Login permits the fixed local `/docs/api` return path.

| Permission | Operations |
| --- | --- |
| `read` | Authentication status, owned websites/cases, saved observations and run detail |
| `evaluate` | Ensure a recent observation, reconcile an existing task, request cancellation |

Evaluate permission does not approve provider spending by itself. The owner's server approval, allowed website targets, daily allowance and active-run reservations still apply. The explicit per-account daily exception retains usage accounting and active-run limits. Keys allow 60 requests per minute. A `rate_limited` response includes `Retry-After: 60`; capacity and key-count limits do not imply a timed retry.

## Read first, then explicitly ensure freshness

Enumerate owned IDs with `GET /api/v1/sites` or `GET /api/v1/benchmark-cases`. An observation selector is one of:

```json
{"kind":"website","websiteId":"website_example","maxAgeSeconds":86400}
```

```json
{"kind":"keyword","caseId":"case_example","maxAgeSeconds":86400}
```

`maxAgeSeconds` defaults to 86,400 seconds (24 hours), accepts integers from 0 to 604,800, and is not a recurring schedule. Unsupported fields and duplicate query parameters are rejected.

Use the selector as query parameters on `GET /api/v1/observations` to read the latest matching completed result. `disposition` is `saved` or `missing`; inspect `freshness.fresh` for its age. Stale or missing data does not start work.

After authorization to incur usage charges, send the selector as JSON to `POST /api/v1/observations/ensure`, with an `Idempotency-Key`. Folio atomically reuses a fresh matching completion, reuses a matching active task, or reserves one new run. An unrelated active task blocks a new reservation. A keyword ensure starts a baseline observation of the saved case; it does not create a new question or silently attach a comparison baseline.

Use an 8–128-character idempotency value containing letters, digits, dots, underscores, colons or hyphens. Keep that value and the same request for retries. The identity is owner-scoped, survives key replacement within that owner, and commits with the run reservation. Reuse with a different selector or age limit returns 409. Retrying the same logical request returns its existing saved run; it does not become permission for a later fresh run. A new observation request needs its own explicit authorization and identity. A reserved request rejected as `run_limit` or `owner_active_elsewhere` keeps that outcome for its identity; waiting does not turn its retry into a new reservation. Once the capacity issue is resolved, a separately authorized request needs a new identity.

| Response disposition | Meaning |
| --- | --- |
| `fresh_saved` | A matching completed result met the requested age |
| `existing_active` | A matching task already occupies the active slot |
| `started` | One new task was reserved and started |
| `saved` | Saved state, including an idempotent repeat of an earlier request |
| `missing` | No matching completed result exists; used by GET |

Ensure returns HTTP 202 when its selected run is active; otherwise it returns 200. Saved-run GETs use 200 even while the task is active. `maxAgeSeconds: 0` prevents reuse of a completed result, but still reuses matching active work and does not override quotas or uncertain creation.

Website freshness uses the oldest saved page capture time. Replaying frozen evidence does not make that source newly captured. Keyword freshness uses the run's saved creation time. Freshness requires a completed result and a nonnegative age within the requested window. Matching also checks the target/case and current execution configuration: website suite/model/name and absence of optional reference/SEO inputs, or the exact keyword case/model/harness/environment. An arbitrary recent run is not interchangeable with the requested observation.

## Retrieve progress without starting another task

Follow `run.pollUrl`, such as `/api/v1/runs/keyword/run_example`, to read local saved state. Use `POST` with `{}` on its `/reconcile` endpoint to retrieve the existing remote task. Reconciliation never starts a new session or supplies a pending application-tool answer. Keyword reconciliation can issue the one reserved cancellation request after its saved deadline. A closed client is not a keyword deadline scheduler.

`POST` with `{}` on `/cancel` requests cancellation. Keep reading or reconciling until the saved status is `completed`, `failed` or `cancelled`; an acknowledgement alone does not prove work stopped. `requires_action` means inspect the existing attempt. Do not replace an uncertain task by changing the idempotency key. A 503 persistence response can include private recovery run/session IDs; retain those before leaving the client.

| Route under `/api/v1` | Purpose |
| --- | --- |
| `GET /auth/status` | Key identity and scopes |
| `GET /sites` | Existing owned website IDs and public target URLs |
| `GET /benchmark-cases` | Existing owned case IDs, query, target, locale and search mode |
| `GET /observations` | Latest matching saved completion and freshness |
| `POST /observations/ensure` | Explicit freshness request; may start paid work |
| `GET /runs/{kind}/{id}` | One owned run's saved state |
| `POST /runs/{kind}/{id}/reconcile` | Retrieve existing work |
| `POST /runs/{kind}/{id}/cancel` | Request cancellation |

Errors use `{error:{code,message}}`: 400 invalid input; 401 invalid, expired or revoked key; 403 scope/account denial; 404 no owned record; 409 conflicting or unresolved work; 429 rate/capacity limit; 503 unavailable or unconfirmed persistence. Private responses use `Cache-Control: private, no-store`.

## Results and publication

Responses include status, result, nullable usage, freshness, and provenance. Keyword provenance includes saved search mode, harness/environment identity, allowed domains and recorded completed-search count when available. The projection excludes full page captures, private reference values, provider collection payloads, hidden reasoning and credentials; a recovery session ID is private operational data. Unknown usage and cost remain null.

A website result verifies captured-page evidence. A keyword result records recommendation order and returned citations from an API-agent answer. Neither establishes consumer ChatGPT behavior, Google rank, factual truth, or a general product-quality score. Legacy reviewed-domain cases remain distinct from open-web Astra cases; see [keyword semantics](KEYWORD-BENCHMARKS.md).

This API reads private owner records. It does not publish them. The public search table uses a separately reviewed, allowlisted artifact with public queries, timestamps, execution labels, ordered recommendations, citations and limits; it excludes account/run/session IDs, secrets, usage and raw collection payloads.

Implementation: [HTTP reference](../src/lib/agent-api-reference.ts), [key storage](../src/lib/agent-api-key-store.ts), [freshness service](../src/lib/agent-observation-service.ts), [atomic request ledger](../src/lib/agent-observation-store.ts), and migration `0011_agent_api.sql`. Fixture/D1 tests and actual provider validation are separate; this guide makes no new live-run or deployment claim.
