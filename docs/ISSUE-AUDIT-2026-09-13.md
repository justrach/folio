# Saved-workflow issue audit — 13 September 2026

The audit started from `183c33c` and inspected all eight open issues in `justrach/folio`. Existing implementations were checked for concrete defects; an open issue was not treated as proof that its entire feature was missing.

| Issue | Existing implementation and audit outcome |
| --- | --- |
| #1 Historical observations | Fixed normalized website URL matching and discovery of failed/cancelled-only history. `latestAttempt` is separate from the active `currentAttempt`; strict paid reuse is unchanged. |
| #2 Matched visibility | Fixed pairing across changed saved research domains and false mismatches between absent/empty reference facts. Saved-data comparisons remain bounded and do not establish causality. |
| #3 Product identities | Existing reviewed product/host separation retained; relevant visibility regressions pass. No new public identity registry or live observations collected. |
| #4 Discovery/history | Fixed website history URL matching and rejection of keyword-only filters on website requests. Existing overlapping-window `changedSince` polling remains a documented saved-state view, not a durable event log. |
| #5 MCP contracts | Envelopes now require exactly one result/error; conditional SEO scope and account-approval errors are distinct. Capability metadata describes conditional scopes. Inner success payloads remain generic objects, so complete per-tool success schemas remain an acceptance gap. |
| #6 Page evidence | Fixed normalized website lookup so saved captures remain discoverable. Absent transport fields remain unknown; no crawl is triggered. |
| #7 Detailed SEO rows | Persisted reports contain aggregates. Detailed collection remains separate feature/spending scope; this audit adds no collector. |
| #8 Real public scoring graph | Separate evaluation/design work remains. This audit adds no scores, public data, or paid collection. |

Additional reproducible fixes let a failed selected Search Console report be reopened without duplicate history, and align a saved SEO report's domain with the next explicit lookup form. Neither action starts a paid lookup. Playwright startup now follows `GUI_BASE_URL`'s port and uses public-page readiness, supporting an isolated worktree without requiring live auth data.

The TODO now distinguishes the recorded existing production D1/migration checkpoint from the checked-in local placeholder and outstanding deployment validation. No issue is closed by this audit. Hosted MCP acceptance, live provider checks, production deployment, Google onboarding and billing remain separate dependencies.

Validation passed with Bun 1.4.1: 239 unit tests, 22 actual temporary Miniflare D1 tests, 20 relevant desktop/mobile browser checks, TypeScript, OpenNext Cloudflare build, and scheduler dry run. Both new UI regressions also failed against the original components before the fixes were restored. Browser checks covered saved-report recovery, history, refresh and owner clearing on isolated port 3017 with mocked APIs. This was a targeted browser run, not the entire GUI suite. All new data is synthetic fixture data; collector files, private state, credentials and the concurrent collector's server were outside this audit's ownership.
