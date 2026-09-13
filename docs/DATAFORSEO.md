# DataForSEO integration

Folio provides two bounded, server-side SEO data tools. These observations stay separate from the HTML readiness rubric, public leaderboard and agent-reader evaluations. There is no browser-side provider credential, automatic lookup on page load, or automatic retry.

## Setup

Store `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` in the ignored `.dev.vars` file for local development. For a deployed Worker, use `wrangler secret put DATAFORSEO_LOGIN` and `wrangler secret put DATAFORSEO_PASSWORD`. These are the raw API login and password; the adapter creates the HTTP Basic header. Do not use `NEXT_PUBLIC_*` variables or paste a pre-encoded Authorization header into either value.

Set `DATAFORSEO_ALLOWED_USER_IDS` to comma-separated Better Auth user IDs explicitly approved by the owner of the provider credentials. An empty list blocks all billable queries. Obtain the user's ID from their validated session or the local `user` table after they sign in. Never auto-enroll an account using its unverified email address. A wildcard has no special meaning.

For the local app, create an account and copy its ID from **Search & backlinks**. The credential owner can authorize it with `bun run seo:approve <account-ID>`, then restart the dev server. This command changes only the local allowlist and makes no provider requests.

The request route permits 20 lookups per approved account per hour, atomically tracked in D1. Each lookup makes at most two provider tasks. Failed or ambiguous requests still use a lookup slot. This is a request limit, not a guaranteed dollar spending cap. The integration does not purchase credits or activate a subscription.

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

Run `node --conditions=react-server --import tsx --test tests/dataforseo.test.ts` to test the server-only adapter directly. A real provider smoke test should be initiated deliberately for the intended domain after the owner's account is approved.

## Saved reports and agent access

Each explicit lookup reserves an owner-scoped `seo_reports` record before the provider call. Successful normalized responses, including partial failures and unknown costs, are saved without overwriting older observations. An interrupted reservation remains unconfirmed; it is never silently retried. `/api/seo-reports` and its detail route read saved data only. If persistence fails after a paid response, the UI offers a private download and reports the failure.

A live evaluation can attach one completed private report matching its exact target hostname. The managed read-only `read_saved_seo_report` function returns this frozen snapshot only after an owner click; it cannot perform fresh DataForSEO lookups or choose another report. Deleting an evaluation removes its copy, not the separate SEO history record.
