# Backend live-data release — 8 November 2026

Application source: `e4ae2db`. Final verified checkout: `2569742` (only the Index
layout fixture changed after the application source was frozen).

Production backend version: `5098f6fa-795d-4758-a516-6f4e8b05eb05`.
Production frontend version: `bc8cb9ae-eb96-4d44-ac1a-430a991e0ba2`.

## Change and runtime boundaries

The deployed PostgreSQL implementation reused one module-level pg pool across
Worker requests. The backend now uses request-scoped pools, including the shared
context coordinator needed across OpenNext's separate application and Worker
bundles. Cleanup runs on success and failure. Hyperdrive retains upstream pooling;
its query cache was checked and remains disabled. The already deployed PG adapter
and Better Auth PG schema are now present in main, with atomic adapter batches.
Local development still defaults to D1. No failure switches databases or retries a
write. No schema migration or record copy was performed.

The Index comparison, source-answer table, landing answer table and hackathon
answer table read the validated public API. The default comparison includes all
questions with published observations in the current response, rather than only
the original 35-question cohort. Explicit model and question filters retain their
original evidence semantics. Refresh updates comparison and source answers from
one response. The frontend saved-snapshot fallback was removed: failed live reads
return 503 and a retry state, preserving an already loaded result where available.
Dated HTML captures remain dated captures; no fresh research is implied by a read.

## Local validation and retained failures

Typecheck, all 344 unit tests and all 37 real D1 integration tests passed in the
isolated Linux runner. The full browser collection ran 380 cases: 376 passed,
two existing skips and two failures of the same desktop/mobile Index layout test.
That older fixture returned null for every API, which prevented the newly live
Index from rendering. A fixture-only change supplies the validated published
response. Both failed cases then passed with `--last-failed --retries=0`, keeping
all layout/privacy assertions. Application code did not change after the full
browser run. Thus 378 distinct browser cases passed across the full run and the
focused recheck, with two existing skips; this was not a fresh pristine full run.

The final local check sequence passed all 13 stages, with the GUI stage explicitly
using that failed-case recheck. It included frozen installation, setup, typecheck,
unit/D1 tests, browser dependencies, OpenNext build, backend and frontend dry
builds, actual built-Worker runtime checks for both entry points and scheduler dry
build. Earlier failures and interrupted runs remain preserved privately.

A separate disposable local PostgreSQL regression passed sequential and concurrent
public-store reads, actual Better Auth signup/sign-in/session reads and atomic
adapter-batch rollback. An initial native Mac workerd check and a TCP fixture run
hit local connectivity failures; the same workerd unit check passed in Linux and
the PG integration passed using its disposable Unix socket. Assertions were not
weakened. No development records or production records were used as fixtures.

## Hosted and production verification

A restricted candidate exposing only public GETs and a fixed invalid-key check
exercised the existing Hyperdrive connection before production deployment. The
final candidate passed 24 sequential/concurrent live reads and public audit reads;
8 invalid-key checks returned 401 without stalling.

After deployment, production passed another 24 sequential/concurrent public
benchmark reads: all returned 200 with `X-Folio-Public-Source: live-published-data`,
no snapshot notice, and a maximum observed duration of 2,210 ms. The response
contained 397 published observations at verification time. The public audit
endpoint returned 200. Eight database-backed invalid-key requests returned 401.
Ten account/report/integration-status endpoints returned their expected anonymous
responses (seven protected reads returned 401; three public status/session reads
returned 200).

Chromium verified the actual production dashboard, Index, login, API docs,
onboarding and landing at 1440×1000 and 390×844. The Index rendered its comparison
and refresh control; all routes rendered without horizontal overflow. System,
Light and Dark selections worked. Six additional public reads returned live data
without snapshots. Legacy question views and the public-index API returned 200;
anonymous private reads returned 401. No browser page errors or API writes were
observed during these navigation checks.

Backend secret, D1 and Hyperdrive binding metadata matched the pre-deploy snapshot.
The selected engine remained PostgreSQL. Route ownership was preserved and the
previous backend/frontend versions saved for rollback. This release did not
validate a real owner's OAuth flow, start a paid provider run, deploy a scheduler,
change billing or migrate a database. Local fixture passes do not claim those
production integrations were independently exercised.

See [live database reads](../BACKEND-LIVE-READS.md) and
[frontend deployment](../FRONTEND-DEPLOYMENT.md) for implementation and rollback
boundaries. Private deployment/verification logs remain outside Git.
