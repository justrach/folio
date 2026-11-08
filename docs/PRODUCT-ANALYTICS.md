# Folio product analytics and logging plan

Reviewed 8 November 2026 using `humansand/ampersand-v0.1` through the user-authorized Vercel Gateway. The model supplied instrumentation recommendations; the priorities below include engineering corrections after inspecting the current workflow. These are design hypotheses, not interviews, measured user behavior, or production validation.

## What is implemented locally

Folio has an event-only first-party collector and operator report. No external PostHog project, analytics SDK, or session recording is involved.

- `/api/analytics/config` exposes whether collection is enabled.
- `/api/analytics` accepts allowlisted anonymous browser events. The client honors opt-out, Do Not Track and Global Privacy Control. Collection failure does not block product actions.
- `/analytics` reads recorded events only for accounts accepted by the existing internal `isAdmin` policy from main (`src/lib/admin.ts` / `admin-emails.ts`). Ordinary accounts cannot access the product-wide report. Internal admin pages are forwarded to the authenticated backend; the public frontend has no analytics database binding.
- `/overview?view=demo&demo=analytics` is a fictional demonstration, with no stored-user reads. Real analytics errors never substitute sample numbers.
- `/overview?view=demo&demo=team` is a separate sample credit-allocation concept. It does not implement employee memberships, a credit wallet, financial accounting, or billing.

Existing event names are defined in `src/lib/product-analytics-schema.ts`. Current emitters cover normalized page areas, onboarding step views, website check requests/results, evaluation requests/API acceptance or failure, report views, social-demo draft/brainstorm/save/export interactions, sample team tasks, and generic UI errors. Successfully saved setup steps emit `onboarding_step_completed`; editing, failed saves, starter-pack previews and skips do not. Page areas are not arbitrary paths or query strings.

Browser IDs measure browsers, not verified people or employees. A report view is client-observed behavior, not authoritative job completion. Export events record requests, not proof that a file was saved, read, published, or applied.

## Workflow logger map

Browser additions below are implemented for persisted setup steps, repair requests/results, fresh-check preparation, comparison/evidence views, observed evaluation states, saved-evidence action requests/results, login requests/email return, and Search Console action requests/results. Existing backend creation, provider-state and verification records remain authoritative and owner-scoped; no duplicate backend lifecycle stream was added. `evaluation_state_observed` records status changes when a report is open, not every poll or jobs that complete with no browser open.

| Workflow boundary | Implemented events / records | Bounded properties | Source and limits |
| --- | --- | --- | --- |
| Website check, both setup and dashboard audit form | `website_check_requested`, `website_check_result` | result, duration_ms, generic error_code | Browser-observed HTTP outcome; no target URL. |
| Successfully saved setup steps | `onboarding_step_completed` | step, result | After successful check/claim/save responses. Views, edits and skips do not count as completed. |
| Evaluation creation/reconciliation/final verification | Existing private creation attempts, provider-state and verification records; `evaluation_state_observed` when a report is open | status, generic failure result | Private records remain authoritative. Browser observation emits on status change, not every polling response; it cannot observe a closed tab. |
| Explicit return of requested saved evidence | `evaluation_action_requested`, `evaluation_action_result` | action=return_evidence, result, status | API acceptance is not completed inference. No report/run/provider identifier is exported to analytics. |
| Repair artifact request | `repair_download_requested`, `repair_download_result` | kind=repair_bundle, result, surface | Success means browser artifact generation/download initiation, not confirmed saving or application. Demo repair requests use repair_demo. |
| Prepare a fresh evaluation/audit; open comparison | `followup_prepared`, `comparison_opened` | flow=fresh/compare, surface | Preparing a form does not start work or authorize spending. No observational change is claimed as causal improvement. |
| Open captured evidence | `evidence_opened` | surface | Evidence tabs, direct evidence buttons and keyboard tab navigation; no evidence contents or source IDs. |
| Explicit Search Console actions | `integration_action_requested`, `integration_action_result` | action=connect/import/disconnect, result | Connect acceptance is not a consent grant. Reopening a saved report does not start an import. |
| Login action and email API success | `sign_in_requested`, `sign_in_return_observed` | method=google/email/github, result | Email return is client-observed. An OAuth request is not logged as successful login. No credentials or callback URLs. |
| Social demonstration | Existing draft/brainstorm/save/export events | result=local, bounded channel/source/kind | Separate content_demo surface; templates and pre-generated ideas do not imply live agent calls. |

Remaining opportunities include an authoritative OAuth-return audit and explicit DataForSEO request/result adoption signals. Review existing owner-scoped run records for useful bounded recovery categories before adding another backend audit stream.

Ampersand also suggested SEO lookup adoption. Add request/result enums at the explicit DataForSEO handler when that question becomes useful; do not instrument page loads as paid lookups or record keyword/domain inputs.

## Three journeys to inspect

1. **Setup:** step viewed → step successfully saved → website check requested → successful check result → report viewed. Missing later events mean an unobserved continuation, not necessarily failure. Inspect each step separately rather than forcing every user through a paid evaluation.
2. **Delivery and recovery:** inspect existing private run records for creation attempt → confirmed session or ambiguous creation → required owner action → verified completion/failure/cancellation. Unknown creation and cost stay unknown; no automatic replacement task. Browser analytics separately shows report views, without joining account or job identifiers into the anonymous stream.
3. **Findings to follow-up:** report viewed → evidence opened (optional) → repair requested → explicit fresh check → comparison opened (optional). A score change is observational. Changed models, references, suites or coverage may make a delta invalid; no causal improvement claim.

Show each measure with its source and denominator. Do not combine browser and backend steps into a supposedly fully attributable end-to-end conversion rate. Opt-outs, blocked delivery, browser changes, retention and bounded report history limit observations. Sample interactions remain excluded by default.

## Boundaries

Do not capture every click, keystrokes, session video, clipboard contents, prompts, captions, page URLs/query strings, emails, private evidence, OAuth/provider tokens, account IDs, provider IDs or raw exceptions. Do not infer abandonment from a tab closing or unknown usage as zero. Do not label client-supplied events as a trusted security or financial audit.

Operational records have a different purpose and permission boundary: owner-scoped run recovery, service delivery and existing quota accounting. Do not silently export them into behavioral analytics or use backend collection to bypass browser opt-out. Aggregate operational health and browser behavior can be displayed with distinct denominators; they are not linked-user attribution.

## Configuration and storage

Analytics uses its own `ANALYTICS_DB` D1 binding and `analytics-migrations/0001_product_usage_events.sql`. It never calls the business `getDb()` helper and never falls back to Postgres or the account D1 database. Local setup migrates the separate local binding; production migrations explicitly select ANALYTICS_DB with the production config.

- `PRODUCT_ANALYTICS_ENABLED=false` disables collection; otherwise it is enabled. Missing/unavailable storage does not fabricate accepted events or sample reports.
- Admin access reuses `isAdmin(session.user.email)` from main, including its existing named owners and optional server-only `ADMIN_EMAILS` additions. Session identity comes from Better Auth, never a request body. There is no separate analytics admin list. The actual admin page is `/folio-internal/analytics`; the report API checks the same policy before storage access. Do not reuse the paid-provider allowlist.
- Stored events retain random browser/session IDs and allowlisted properties. Browser sessions renew after 30 minutes idle.
- Ingestion removes at most 100 expired rows per write using the created-at index. Reports always exclude events outside their requested window. Cleanup is bounded and ingestion-driven, not a guaranteed scheduled deletion while idle.
- Ingestion is bounded to 4 KiB, 30 events per browser per minute and 50,000 per day. These are ingestion controls, not billing-grade or abuse-proof identity quotas.
- The report returns at most 5,000 matching events and labels partial results. Product events are the default; demo interactions require explicit inclusion.

The collector returns a queued acknowledgement and uses Cloudflare waitUntil for its database write. Browser actions never await telemetry. Collection and reporting run as separate requests from page rendering. Missing storage does not fall back to business SQL; a failed telemetry write stays non-blocking.

The schema/store have unit and actual temporary Miniflare D1 coverage, including sanitization, restart persistence, permissions, retention and ingestion bounds. Browser tests cover opt-out, sample separation and access denial. Local fixture validation does not establish production migration, real operator configuration, deployment, or actual provider behavior.

## Clickable local inspection

The admin report supports a five-second refresh toggle and shows bounded event properties in each selected browser timeline. Use `?includeDemo=true&live=true` to include demo interactions and turn refresh on. Product and demo surfaces remain labelled separately. Opening analytics itself does not produce a page-view event.

For isolated GUI review, a private ignored local proxy on port 3103 uses fixture admin authentication and a local SQLite event database with the same collector, admin report guard and store helpers. Its visible banner identifies the sandbox. It blocks other API writes, so no provider work runs. The event trail there records real local clicks (including automated walkthroughs), not production traffic; the fixture admin is not a production login. Normal port 3002 uses actual Better Auth and its configured database. Local sandbox proof does not configure or migrate the production account/database.

Validation of this revision: typecheck and 370 unit tests passed; the actual temporary Miniflare D1 analytics regression passed; 16 focused analytics/layout browser checks passed across desktop/mobile. Login, evaluation navigation/spend guards and Search Console were also checked; the Search Console navigation helper was updated to open the now-collapsed More tools disclosure, then all 16 of its desktop/mobile checks passed. These checks use isolated accounts/provider fixtures. An additional local walkthrough stored actual draft/repair click events through the collector and reopened them in the admin inspector. Production migration and deployment are not established by this validation.

## Funnel view

The admin view now includes an original responsive funnel with website-research, content-demo and repair-request paths, direct stage counts, selectable stages, keyboard controls and an equivalent data table. The selected journey and demo inclusion survive refresh through URL parameters. Product and demo events cannot complete each other's journeys. See [funnel design and generated-art provenance](design/ADMIN-FUNNEL-2026-11-08.md). This revision passed typecheck, 372 unit tests and 20 focused desktop/mobile checks. It remains a local preview, not a production deployment record.

## Release integration

The release integrates the existing named admin accounts and main's authenticated admin/index operations page. `/folio-internal` resolves to the existing admin surface after authorization, `/folio-internal/analytics` opens analytics, and the admin overview links to it. The frontend routes these pages to the backend that owns Better Auth; there is no fixture identity in this deployed path. The dedicated analytics database is provisioned in APAC. Unit/runtime regressions cover database-binding isolation, a stalled write returning before storage finishes, and backend-only admin rendering. The local demo remains separate from real-account and production verification.
