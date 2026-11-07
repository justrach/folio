# DataForSEO integration

Folio provides two bounded, server-side SEO data tools. These observations stay separate from the HTML readiness rubric, public leaderboard and agent-reader evaluations. There is no browser-side provider credential, automatic lookup on page load, or automatic retry.

## Setup

Store `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` in the ignored `.dev.vars` file for local development. For a deployed Worker, use `wrangler secret put DATAFORSEO_LOGIN` and `wrangler secret put DATAFORSEO_PASSWORD`. These are the raw API login and password; the adapter creates the HTTP Basic header. Do not use `NEXT_PUBLIC_*` variables or paste a pre-encoded Authorization header into either value.

Set `DATAFORSEO_ALLOWED_USER_IDS` to comma-separated Better Auth user IDs explicitly approved by the owner of the provider credentials. An empty list blocks all billable queries. Obtain the user's ID from their validated session or the local `user` table after they sign in. Never auto-enroll an account using its unverified email address. A wildcard has no special meaning.

For the local app, create an account and copy its ID from **Search & backlinks**. The credential owner can authorize it with `bun run seo:approve <account-ID>`, then restart the dev server. This command changes only the local allowlist and makes no provider requests.

The request route permits 20 lookups per approved account per hour, atomically tracked in D1. Each lookup makes at most two provider tasks; the separate row-detail collection has its own 20-per-hour key and at most two more tasks. Failed or ambiguous requests still use a lookup slot. This is a request limit, not a guaranteed dollar spending cap. The integration does not purchase credits or activate a subscription.

An operator can verify credentials without a paid lookup using `GET https://api.dataforseo.com/v3/appendix/user_data` with the same Basic authentication. DataForSEO explicitly documents this endpoint as free. Its response includes the account login and billing details: inspect only the necessary status and subscription fields, and never persist or display the raw response. This account check is not performed automatically by Folio's configuration endpoint. [DataForSEO User Data](https://docs.dataforseo.com/v3/appendix-user-data/)

## Browser API

`GET /api/seo-data` returns configuration and the current account's authorization status, tool definitions, and market settings. It does not contact DataForSEO. `configured: true` only means server credentials exist; it is not proof of provider access.

`POST /api/seo-data` accepts `{ "domain": "example.com" }`. It requires a validated session, an explicitly approved user ID, and a same-origin JSON request. URL paths are discarded: this is a domain lookup. The account ID cannot be supplied in the body.

The response contains independent `organic` and `backlinks` objects with `status`, `data`, `error`, `costUsd`, `taskId`, `providerVersion`, `endpoint`, and `fetchedAt`. A section can be `success`, `empty`, or `error`. A failed backlinks task does not erase a successful organic result. Missing metrics remain `null`; provider-returned zeroes remain zeroes.

The aggregate includes `totalCostUsd`, `knownCostUsd`, and `costIsComplete`. Unknown billing is represented by `null`, including after a timeout or unreadable response. Task-level costs are preserved even on a provider error. Task and envelope costs are not added together. Provider error bodies and status messages are not returned or logged.

Results are returned privately and are not persisted or published by this endpoint. Reloading the page does not rerun the lookup. A deliberate new lookup can incur another charge.

## Tools for server-side agents

`seoToolDefinitions` provides JSON Schema input definitions and tool annotations. `executeSeoTool(name, { domain }, { userId }, { env })` dispatches one approved operation:

- `seo_domain_overview` requests Google organic data for the United States (`2840`) and English (`en`), with one result.
- `seo_backlinks_summary` requests live backlinks, includes subdomains and indirect links, excludes internal backlinks, and requests the provider's 0–100 authority scale.

The dispatcher requires a trusted server session context. Do not accept `userId` from an agent's generated arguments. A production agent runner should additionally allocate a per-run spend budget and persist the returned provenance before citing it. The definitions are a local adapter; they do not by themselves expose a public MCP endpoint or make an agent run automatically.

## Data interpretation and verified sources

The organic endpoint returns ranking distribution and modeled monthly traffic. Folio maps `metrics.organic.count`, `etv`, and `estimated_paid_traffic_cost` to distinct keyword, traffic, and traffic-value fields. Retrieval time does not establish the source's update time. [DataForSEO domain rank overview](https://docs.dataforseo.com/v3/dataforseo_labs-google-domain_rank_overview-live/)

Backlinks use the separate summary endpoint. Referring domains can count subdomains, while referring main domains is a separate field. Authority rank is a provider link metric, not a Google search position or Folio score. Backlinks access can require a subscription; the integration reports access failures without enabling a plan. [DataForSEO backlinks summary](https://docs.dataforseo.com/v3/backlinks-summary-live/)

Implementation research inspected OpenSEO's [transport](https://github.com/every-app/open-seo/blob/main/src/server/lib/dataforseo/core.ts), [envelope handling](https://github.com/every-app/open-seo/blob/main/src/server/lib/dataforseo/envelope.ts), [Labs adapter](https://github.com/every-app/open-seo/blob/main/src/server/lib/dataforseo/labs.ts), [backlinks adapter](https://github.com/every-app/open-seo/blob/main/src/server/lib/dataforseo/backlinks.ts), and [authenticated MCP boundary](https://github.com/every-app/open-seo/blob/main/src/server/mcp/project-auth.ts). Folio implements its own small adapter; it does not import the application. In particular, it fetches the two endpoints independently and does not imply that a domain organic lookup also retrieves backlinks.

## Validation

The test suite uses injected provider fixtures exclusively. It verifies unauthorized-account blocking before any network request, exact request payloads, separate response shapes, missing versus zero metrics, charged failures, unknown costs, timeout behavior, redirect refusal, body-size bounds and rejection of account overrides. No paid provider call is required to run tests.

On 13 September 2026, the operator configured the supplied credentials in the ignored local environment and validated them using the free `appendix/user_data` endpoint. HTTP and provider/task status indicated success; the provider reported zero cost. Only these status fields were inspected in output. The credential owner's signed-in local account was approved through the existing operator command, and the built Wrangler preview displayed "Ready to query" after restart. This establishes credential access and local configuration, not a successful organic/backlink lookup, a backlinks subscription, production configuration, or access for every Folio account. Existing per-user approval and lookup limits still apply.

Run `node --conditions=react-server --import tsx --test tests/dataforseo.test.ts` to test the server-only adapter directly. A real provider smoke test should be initiated deliberately for the intended domain after the owner's account is approved.

On 7 November 2026 the operator supplied a new API password and ran the adapter directly against the live provider: the credential passed the free `appendix/user_data` check, and one detail collection returned 50 keyword rows, 33 grouped landing pages and 30 live backlink rows with both task costs reported. The first attempt failed with provider status `40501` because `mode` carried a backlinks-status value; it now sends `mode: "as_is"` with `backlinks_status_type: "live"`. The same flow was then repeated through the authenticated routes on the built Worker — lookup, detail collection, reopen from D1, and a refused second collection — so the route and storage paths are live-validated for one domain. The browser panel and MCP reads still have fixture-backed coverage only.

## Saved reports and agent access

Each explicit lookup reserves an owner-scoped `seo_reports` record before the provider call. Successful normalized responses, including partial failures and unknown costs, are saved without overwriting older observations. An interrupted reservation remains unconfirmed; it is never silently retried. `/api/seo-reports` and its report route read saved data only; the separate `POST /api/seo-reports/<id>/detail` route is the only SEO report path that can spend, and only for keywords and backlink rows on an already-saved report. If persistence fails after a paid response, the UI offers a private download and reports the failure; that download includes any collected rows, so nothing has to be re-purchased to keep the evidence.

A live evaluation can attach one completed private report matching its exact target hostname. The managed read-only `read_saved_seo_report` function returns this frozen snapshot only after an owner click; it cannot perform fresh DataForSEO lookups or choose another report. Deleting an evaluation removes its copy, not the separate SEO history record.

## Row-level detail

Aggregate buckets cannot name a keyword or a landing page, so row-level detail is a separate, explicit collection attached to one already-saved report. `POST /api/seo-reports/<id>/detail` reads the owned report, takes the domain from that record rather than the caller, and runs at most two more provider tasks:

- `dataforseo_labs/google/ranked_keywords/live`, United States / English, 50 rows ordered by search volume, mapped to keyword, position, landing page, search volume and estimated traffic. Landing pages are grouped from the returned rows; no second query or inferred page.
- `backlinks/backlinks/live`, live rows ordered by provider authority, mapped to source URL/domain, target URL, follow state, authority rank, spam score and first-seen time.

Rules this path keeps: a report's rows are collected at most once (a second POST is refused rather than silently charging again); a pending report cannot receive rows; the detail domain must match the report; a separate hourly slot key (`folio:seo-detail:<userId>`, 20/hour) still consumes a slot on failure because the request may have been billed; unknown cost stays `null`; and provider text is bounded, control characters stripped, and only absolute `http(s)` URLs are kept. Rows are stored in `seo_reports.detail_json` with `detail_retrieved_at` (migration `0024_seo_report_detail.sql`); the aggregate `result_json` is untouched and old reports keep `NULL`.

The panel renders the rows only after a user clicks **Collect keyword and link rows**, and the MCP `folio_seo_reports` read returns `detail.state: "collected"` with those rows. A keyword sandbox cannot trigger this collection, and no managed agent tool was added for it. When such a report is attached to an evaluation, the frozen evidence keeps at most 20 rows per source and labels truncation, so the existing capture size limit is never exceeded silently.

## Authenticated MCP and sandbox SEO

Folio now includes `/api/mcp` for coding clients and `/api/v1/seo` for explicit, idempotent DataForSEO lookups. Keyword sandboxes can opt into one selected-domain SEO lookup with a short-lived capability; existing evaluation keys require a separate `seo` permission. See [MCP setup and behavior](MCP.md) for migration, configuration, client examples and validation limits.

## Website keyword research

Managed website questions now support Luna with optional, bounded DataForSEO related-keyword research. General coding clients can use the same research via Folio MCP. See [keyword research](KEYWORD-RESEARCH.md) for authorization, limits, private D1 receipts and cost semantics.
