# Production UI release — 8 November 2026

Verified application source: `fc600a488c201578afbc4a539fa36ed7366d1452`.
Production frontend Worker version: `f49fccd7-86b7-4205-acc5-bdeb67d352a4`.

The dashboard, public Index, login, onboarding and API documentation use the
shared cream/green presentation and dark palette. The bottom-right theme control
offers System, Light and Dark, persists explicit choices, follows operating-system
changes in System mode, and stays clear of the background-run dock on mobile.
Buttons and custom dropdowns use shared press motion and respect reduced motion.

## Local validation

All 11 CI command stages passed on the source above in the isolated Linux runner:
frozen Bun install, setup, typecheck, unit tests (325 passed), real D1 tests
(37 passed), Chromium dependency installation, desktop/mobile browser tests
(374 passed, two existing skips), OpenNext build, frontend Worker dry build,
built-Worker runtime smoke check and scheduler dry build. Next.js remains 16.4.5;
OpenNext 1.20.16 supplies its compatible Worker runtime.

The preceding attempt found a real mobile overlap between the theme picker and
background activity link (373 passed, one failed, two existing skips). The fix
passed the focused managed-session test on desktop and mobile before the full
suite was rerun. The failed run remains preserved locally.

The release-record commit adds documentation and aligns the tracked logging
configuration with the deployed configuration: query strings are redacted,
invocation logs and traces disabled. The matching frontend dry build passed;
these metadata changes were made after the full application-source CI run.

## Production verification

The frontend was uploaded without routes, then activated at `usefolio.site/*`,
`usefolio.site/` and `usefolio.site/leaderboard*`. The separate
`usefolio.site/api/question-index*` route remains on the existing public-index
Worker. Previous route ownership was saved privately for rollback.

Headless Chromium verified the actual HTTPS production domain at 1440×1000 and
390×844: dashboard, Index, login, API docs, onboarding and landing returned 200,
rendered without horizontal overflow, and retained the selected theme. System,
Light and Dark controls worked. Six public benchmark reads returned 200; three
used live data and three used the explicitly labelled published snapshot. Legacy
question views and the public-index API returned 200; anonymous `/api/sites`
returned 401. Navigation produced no API writes or browser page errors.

Cloudflare's backend deployment ID was checked before and after activation and
remained unchanged. No database migration, private evidence copy, provider-secret
update, scheduler deployment, real-account login, OAuth consent or paid provider
run was part of this release.

## Existing limitation

Existing backend public benchmark reads intermittently hang. The public GET alone
has a five-second bound and an explicitly labelled fallback to original dated
published artifacts. Private, authentication and paid operations retain their
original forwarding behavior. This fallback does not repair the existing
PostgreSQL runtime. Real authenticated and provider workflows require their own
production validation; mock/local passes do not establish those outcomes.

See [frontend deployment](../FRONTEND-DEPLOYMENT.md) for runtime boundaries and
rollback requirements. Detailed local logs remain ignored and are not published.
